import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { DatabaseConstruct } from '../constructs/database/database-construct';
import { BackendConstruct } from '../constructs/backend/backend-construct';
import { FrontendConstruct } from '../constructs/frontend/frontend-construct';

/**
 * Stack di sviluppo per l'applicazione.
 * 
 * Questo stack è ottimizzato per l'ambiente di sviluppo, con configurazioni appropriate
 * come auto-delete degli oggetti, logging esteso e altre impostazioni utili per il debug.
 */
export class DevelopmentStack extends cdk.Stack {
  /**
   * L'endpoint dell'API Gateway
   */
  public readonly apiEndpoint: string;
  
  /**
   * L'URL del frontend
   */
  public readonly frontendUrl: string;
  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      description: 'Stack di sviluppo per il Summit Milan 2025'
    });
    
    // Configurazioni comuni
    const appName = 'summit-milan-demo';
    const environment = 'dev';
    
    // Applicazione dei tag comuni a tutto lo stack
    this.applyCommonTags();
    
    // Creazione del layer database
    const database = new DatabaseConstruct(this, 'Database', {
      appName,
      environment,
      enablePointInTimeRecovery: false, // Disabilitato in sviluppo per ridurre i costi
      // In sviluppo, eliminiamo la tabella quando distruggiamo lo stack
      preserveTableOnDelete: false
    });
    
    // Creazione del layer backend
    const backend = new BackendConstruct(this, 'Backend', {
      appName,
      environment,
      eventsTable: database.eventsTable,
      lambda: {
        // Configurazioni ottimizzate per lo sviluppo
        memorySize: 256,
        timeout: 30,
        logLevel: 'DEBUG' // Log verbose in sviluppo
      },
      api: {
        enableTracing: true // Abilita il tracciamento dettagliato in sviluppo
      }
    });
    
    // Creazione del layer frontend
    const frontend = new FrontendConstruct(this, 'Frontend', {
      appName,
      environment,
      s3: {
        // In sviluppo, eliminiamo il bucket e i suoi oggetti quando distruggiamo lo stack
        autoDeleteObjects: true,
        preserveBucketOnDelete: false
      },
      cloudfront: {
        enableLogging: true,
        // Specifichiamo esplicitamente TLS 1.2 per evitare errori di sicurezza
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021
      }
    });
    
    // Esposizione degli output necessari
    this.apiEndpoint = backend.apiEndpoint;
    this.frontendUrl = frontend.frontendUrl;
    
    // CloudFormation outputs per facilitare l'accesso alle risorse
    this.exportOutputs(appName, environment, {
      apiEndpoint: backend.apiEndpoint,
      frontendUrl: frontend.frontendUrl,
      tableName: database.eventsTable.tableName,
      bucketName: frontend.websiteBucket.bucketName
    });
  }
  
  /**
   * Applica i tag comuni a tutto lo stack
   */
  private applyCommonTags(): void {
    cdk.Tags.of(this).add('Project', 'SummitMilan2025');
    cdk.Tags.of(this).add('Environment', 'Development');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Documentation', 'https://github.com/pasqualemazzei/summit-milan-2025');
    cdk.Tags.of(this).add('Presentation', 'IaC: From Keyboard to Cloud');
    cdk.Tags.of(this).add('Presenter', 'Summit Milan Team');
    cdk.Tags.of(this).add('Purpose', 'Demo');
  }
  
  /**
   * Crea e esporta gli output CloudFormation
   */
  private exportOutputs(appName: string, environment: string, outputs: {
    apiEndpoint: string;
    frontendUrl: string;
    tableName: string;
    bucketName: string;
  }): void {
    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      description: 'URL dell\'API Gateway',
      value: outputs.apiEndpoint,
      exportName: `${appName}-api-endpoint-${environment}`
    });
    
    new cdk.CfnOutput(this, 'FrontendUrlOutput', {
      description: 'URL del frontend',
      value: outputs.frontendUrl,
      exportName: `${appName}-frontend-url-${environment}`
    });
    
    new cdk.CfnOutput(this, 'WebsiteBucketNameOutput', {
      description: 'Nome del bucket S3 per il frontend',
      value: outputs.bucketName,
      exportName: `${appName}-website-bucket-${environment}`
    });
    
    new cdk.CfnOutput(this, 'DynamoDBTableNameOutput', {
      description: 'Nome della tabella DynamoDB',
      value: outputs.tableName,
      exportName: `${appName}-dynamodb-table-${environment}`
    });
  }
} 