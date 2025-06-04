import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';

/**
 * Questo stack dimostra le best practice per l'IaC utilizzando AWS CDK.
 * È stato progettato per il talk "IaC: From Keyboard to Cloud" per il Summit Milan 2025.
 * 
 * L'architettura implementa:
 * - Frontend statico hostato su S3 e distribuito tramite CloudFront
 * - API RESTful serverless con API Gateway e Lambda
 * - Storage persistente con DynamoDB
 * - Configurazione IAM con privilegi minimi
 * 
 * Ogni risorsa è completamente taggata e documentata per migliorare la manutenibilità.
 */
export class SummitMilan2025Stack extends cdk.Stack {
  // Proprietà pubbliche per consentire l'accesso agli altri costrutti
  public readonly apiEndpoint: string;
  public readonly frontendUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Configurazione di variabili e costanti per l'intera applicazione ---
    const appName = 'summit-milan-demo';
    const environment = props?.tags?.environment || 'dev';
    
    // Applichiamo tag comuni a tutto lo stack per facilitare la gestione dei costi e delle risorse
    cdk.Tags.of(this).add('Project', 'SummitMilan2025');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Documentation', 'https://github.com/pasqualemazzei/summit-milan-2025');

    // --- Database Layer ---
    
    /**
     * Tabella DynamoDB per archiviare i dati degli eventi
     * Utilizziamo il modello on-demand per il piano di capacità per ottimizzare i costi
     * e configuriamo la chiave primaria in base ai pattern di accesso previsti
     */
    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      tableName: `${appName}-events-${environment}`,
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: environment === 'prod',
    });
    
    // Aggiungiamo tag alla tabella per auto-documentazione
    cdk.Tags.of(eventsTable).add('Purpose', 'Stores event data');
    cdk.Tags.of(eventsTable).add('DataClassification', 'Non-sensitive');
    cdk.Tags.of(eventsTable).add('DataRetention', environment === 'prod' ? 'Retained' : 'Temporary');
    
    // --- Backend Layer ---
    
    /**
     * Funzione Lambda per gestire gli eventi
     * Utilizziamo il pattern di organizzazione del codice per funzione che è 
     * un'ottima pratica per la manutenibilità
     */
    const eventHandlerLambda = new lambda.Function(this, 'EventHandlerFunction', {
      functionName: `${appName}-event-handler-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/event-handler')),
      environment: {
        TABLE_NAME: eventsTable.tableName,
        ENVIRONMENT: environment,
        LOG_LEVEL: environment === 'prod' ? 'INFO' : 'DEBUG'
      },
      // Buona pratica: impostare timeout e memoria in base alle necessità dell'applicazione
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE, // Abilita X-Ray per il debug e il monitoraggio
      description: 'Processes event data and stores it in DynamoDB'
    });
    
    // Permessi con principio del privilegio minimo
    eventsTable.grantReadWriteData(eventHandlerLambda);
    
    /**
     * API Gateway che espone la funzione Lambda
     * Usiamo il tipo REST per una maggiore flessibilità nella definizione delle API
     */
    const api = new apigateway.RestApi(this, 'EventsApi', {
      restApiName: `${appName}-api-${environment}`,
      description: 'API for managing events data',
      deployOptions: {
        stageName: environment,
        // Abilita il logging delle richieste API per il debug e l'audit
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: environment !== 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS
      }
    });
    
    // Definiamo un modello di integrazione riutilizzabile
    const lambdaIntegration = new apigateway.LambdaIntegration(eventHandlerLambda);
    
    // Creiamo la risorsa /events
    const events = api.root.addResource('events');
    
    // GET /events
    events.addMethod('GET', lambdaIntegration, {
      operationName: 'ListEvents',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          }
        }
      ]
    });
    
    // POST /events
    events.addMethod('POST', lambdaIntegration, {
      operationName: 'CreateEvent',
      methodResponses: [
        {
          statusCode: '201',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          }
        }
      ]
    });
    
    // Risorsa singolo evento con path parameter
    const singleEvent = events.addResource('{eventId}');
    
    // GET /events/{eventId}
    singleEvent.addMethod('GET', lambdaIntegration, {
      operationName: 'GetEvent',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          }
        }
      ]
    });
    
    // --- Frontend Layer ---
    
    /**
     * Bucket S3 per l'hosting del frontend statico
     * Configuriamo la policy di accesso pubblico per CloudFront
     */
    // Usiamo un nome generato automaticamente per il bucket S3 invece di specificarlo
    // Questo evita errori di validazione con i token
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      // Non specifichiamo bucketName così CDK genererà un nome valido automaticamente
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true
    });
    
    /**
     * OAI (Origin Access Identity) per sicurezza CloudFront
     * Consente solo a CloudFront di accedere al bucket S3
     */
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for ${appName} website`
    });
    
    // Concediamo i permessi di lettura all'OAI
    websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [websiteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(
        originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
      )]
    }));
    
    /**
     * Distribuzione CloudFront
     * Configuriamo SSL, caching e restrizioni geografiche secondo best practice
     */
    const distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity
        }),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        }
      ],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enableLogging: true,
      comment: `${appName} website distribution - ${environment}`
    });
    
    // --- Outputs ---
    
    // Esportiamo gli output per semplificare il recupero di informazioni importanti
    this.apiEndpoint = api.url;
    this.frontendUrl = `https://${distribution.distributionDomainName}`;
    
    // CloudFormation Outputs sono un ottimo modo per documentare gli endpoint
    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      description: 'URL dell\'API Gateway',
      value: this.apiEndpoint,
      exportName: `${appName}-api-endpoint-${environment}`
    });
    
    new cdk.CfnOutput(this, 'FrontendUrlOutput', {
      description: 'URL del frontend',
      value: this.frontendUrl,
      exportName: `${appName}-frontend-url-${environment}`
    });
    
    new cdk.CfnOutput(this, 'WebsiteBucketNameOutput', {
      description: 'Nome del bucket S3 per il frontend',
      value: websiteBucket.bucketName,
      exportName: `${appName}-website-bucket-${environment}`
    });
    
    new cdk.CfnOutput(this, 'DynamoDBTableNameOutput', {
      description: 'Nome della tabella DynamoDB',
      value: eventsTable.tableName,
      exportName: `${appName}-dynamodb-table-${environment}`
    });
  }
}
