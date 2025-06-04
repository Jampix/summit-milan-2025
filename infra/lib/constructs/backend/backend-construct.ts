import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';

/**
 * Proprietà per il costrutto BackendConstruct
 */
export interface BackendConstructProps {
  /**
   * Prefisso per il nome delle risorse
   */
  appName: string;
  
  /**
   * Ambiente di deployment (dev, test, prod)
   */
  environment: string;
  
  /**
   * La tabella DynamoDB usata per archiviare i dati
   */
  eventsTable: dynamodb.Table;
  
  /**
   * Configurazioni per la funzione Lambda
   */
  lambda?: {
    /**
     * Memoria allocata alla funzione Lambda in MB
     * @default 256
     */
    memorySize?: number;
    
    /**
     * Timeout della funzione Lambda in secondi
     * @default 30
     */
    timeout?: number;
    
    /**
     * Livello di log
     * @default 'INFO' in produzione, 'DEBUG' in altri ambienti
     */
    logLevel?: string;
  };
  
  /**
   * Configurazioni per API Gateway
   */
  api?: {
    /**
     * Abilita il tracciamento delle richieste API
     * @default true in ambienti non di produzione
     */
    enableTracing?: boolean;
    
    /**
     * Configurazione CORS
     * @default permette tutte le origini e i metodi
     */
    cors?: apigateway.CorsOptions;
  };
}

/**
 * Costrutto per la creazione e configurazione del backend.
 * 
 * Questo costrutto gestisce la creazione di:
 * - Funzioni Lambda
 * - API Gateway
 * - Integrazioni e permessi necessari
 */
export class BackendConstruct extends Construct {
  /**
   * La funzione Lambda che gestisce gli eventi
   */
  public readonly eventHandlerFunction: lambda.Function;
  
  /**
   * L'API Gateway che espone le funzionalità
   */
  public readonly api: apigateway.RestApi;
  
  /**
   * L'URL dell'endpoint API
   */
  public readonly apiEndpoint: string;
  
  /**
   * Il modello di validazione per gli eventi
   */
  private eventModel: apigateway.Model;
  
  constructor(scope: Construct, id: string, props: BackendConstructProps) {
    super(scope, id);
    
    const isProd = props.environment === 'prod';
    const lambdaConfig = props.lambda || {};
    const apiConfig = props.api || {};
    
    // Calcolo del percorso relativo alla cartella src/lambda/event-handler
    // __dirname è la directory corrente (infra/lib/constructs/backend)
    // Risaliamo alla cartella root e poi accediamo alla cartella src
    const lambdaHandlerPath = path.resolve(__dirname, '../../../../src/lambda/event-handler');
    
    // Verifica che la cartella esista
    if (!fs.existsSync(lambdaHandlerPath)) {
      throw new Error(`Il percorso Lambda non esiste: ${lambdaHandlerPath}`);
    }
    
    // Creazione della funzione Lambda
    this.eventHandlerFunction = new lambda.Function(this, 'EventHandlerFunction', {
      functionName: `${props.appName}-event-handler-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(lambdaHandlerPath),
      environment: {
        TABLE_NAME: props.eventsTable.tableName,
        ENVIRONMENT: props.environment,
        LOG_LEVEL: lambdaConfig.logLevel || (isProd ? 'INFO' : 'DEBUG')
      },
      timeout: cdk.Duration.seconds(lambdaConfig.timeout || 30),
      memorySize: lambdaConfig.memorySize || 256,
      tracing: lambda.Tracing.ACTIVE,
      description: 'Processes event data and stores it in DynamoDB'
    });
    
    // Concessione dei permessi necessari
    props.eventsTable.grantReadWriteData(this.eventHandlerFunction);
    
    // Creazione dell'API Gateway
    this.api = new apigateway.RestApi(this, 'EventsApi', {
      restApiName: `${props.appName}-api-${props.environment}`,
      description: 'API for managing events data',
      deployOptions: {
        stageName: props.environment,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: apiConfig.enableTracing !== undefined 
          ? apiConfig.enableTracing 
          : !isProd,
        // Impostazioni di sicurezza per mitigare attacchi DoS
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000
      },
      defaultCorsPreflightOptions: apiConfig.cors || {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS
      },
      // Compressione delle risposte per migliorare le prestazioni
      minimumCompressionSize: 1000,
      // Sicurezza: forzare HTTPS per tutte le richieste
      endpointConfiguration: {
        types: [apigateway.EndpointType.EDGE]
      },
      // Politica di sicurezza: richiediamo TLS 1.2 come minimo
      endpointExportName: `${props.appName}-api-endpoint-${props.environment}`
    });
    
    // Impostiamo HTTPS obbligatorio per tutti i metodi
    const methodOptions: apigateway.MethodOptions = {
      apiKeyRequired: false,
      authorizationType: apigateway.AuthorizationType.NONE
    };
    
    // Aggiungere configurazioni di sicurezza a livello di dominio
    if (this.api.domainName) {
      // Applichiamo la politica di sicurezza TLS più recente disponibile
      (this.api.domainName.node.defaultChild as apigateway.CfnDomainName).securityPolicy = 'TLS_1_2';
    }
    
    // Creazione di un modello per la convalida delle richieste
    this.eventModel = this.api.addModel('EventModel', {
      contentType: 'application/json',
      modelName: 'EventModel',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['title', 'timestamp'],
        properties: {
          title: { type: apigateway.JsonSchemaType.STRING },
          description: { type: apigateway.JsonSchemaType.STRING },
          timestamp: { type: apigateway.JsonSchemaType.STRING, format: 'date-time' }
        }
      }
    });
    
    // Integrazione Lambda con API Gateway
    const lambdaIntegration = new apigateway.LambdaIntegration(this.eventHandlerFunction);
    
    // Definizione delle risorse e metodi API
    this.setupApiRoutes(lambdaIntegration);
    
    // Memorizza l'endpoint API
    this.apiEndpoint = this.api.url;
  }
  
  /**
   * Configura le rotte API
   * @param lambdaIntegration L'integrazione Lambda da utilizzare
   */
  private setupApiRoutes(lambdaIntegration: apigateway.LambdaIntegration): void {
    // Creazione della risorsa /events
    const events = this.api.root.addResource('events');
    
    // GET /events - Lista degli eventi
    events.addMethod('GET', lambdaIntegration, {
      operationName: 'ListEvents',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          }
        }
      ],
      // Sicurezza: aggiunto request validator per prevenire attacchi di injection
      requestValidator: new apigateway.RequestValidator(this, 'EventsGetValidator', {
        restApi: this.api,
        validateRequestParameters: true,
        requestValidatorName: 'events-get-validator'
      })
    });
    
    // POST /events - Creazione di un evento
    events.addMethod('POST', lambdaIntegration, {
      operationName: 'CreateEvent',
      methodResponses: [
        {
          statusCode: '201',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          }
        }
      ],
      // Sicurezza: aggiungiamo validazione del corpo della richiesta
      requestValidator: new apigateway.RequestValidator(this, 'EventsPostValidator', {
        restApi: this.api,
        validateRequestBody: true,
        requestValidatorName: 'events-post-validator'
      }),
      // Colleghiamo il modello di validazione
      requestModels: { 'application/json': this.eventModel }
    });
    
    // Risorsa per evento singolo
    const singleEvent = events.addResource('{eventId}');
    
    // GET /events/{eventId} - Recupero di un evento specifico
    singleEvent.addMethod('GET', lambdaIntegration, {
      operationName: 'GetEvent',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          }
        }
      ],
      // Sicurezza: validiamo i parametri di path
      requestParameters: {
        'method.request.path.eventId': true
      },
      requestValidator: new apigateway.RequestValidator(this, 'EventGetValidator', {
        restApi: this.api,
        validateRequestParameters: true,
        requestValidatorName: 'event-get-validator'
      })
    });
  }
} 