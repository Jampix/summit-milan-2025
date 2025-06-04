import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { DatabaseConstruct } from '../constructs/database/database-construct';
import { BackendConstruct } from '../constructs/backend/backend-construct';
import { FrontendConstruct } from '../constructs/frontend/frontend-construct';

/**
 * Stack di produzione per l'applicazione.
 * 
 * Questo stack è ottimizzato per l'ambiente di produzione, con configurazioni di
 * alta affidabilità, sicurezza rafforzata e ottimizzazioni per le prestazioni.
 */
export class ProductionStack extends cdk.Stack {
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
      description: 'Stack di produzione per il Summit Milan 2025'
    });
    
    // Configurazioni comuni
    const appName = 'summit-milan-demo';
    const environment = 'prod';
    
    // Applicazione dei tag comuni a tutto lo stack
    this.applyCommonTags();
    
    // Creazione del layer database
    const database = new DatabaseConstruct(this, 'Database', {
      appName,
      environment,
      // Configurazioni ottimizzate per la produzione
      enablePointInTimeRecovery: true,  // Importante per il disaster recovery
      preserveTableOnDelete: true,      // Previene la cancellazione accidentale in produzione
      tags: {
        DataProtection: 'High',
        BackupFrequency: 'Daily'
      }
    });
    
    // Creazione del layer backend
    const backend = new BackendConstruct(this, 'Backend', {
      appName,
      environment,
      eventsTable: database.eventsTable,
      lambda: {
        // Configurazioni ottimizzate per la produzione
        memorySize: 512,  // Più memoria per gestire maggior carico
        timeout: 30,
        logLevel: 'INFO'  // Solo log necessari in produzione
      },
      api: {
        enableTracing: false  // Disabilitato in produzione per prestazioni migliori
      }
    });
    
    // Creazione del layer frontend
    const frontend = new FrontendConstruct(this, 'Frontend', {
      appName,
      environment,
      s3: {
        // Configurazioni ottimizzate per la produzione
        autoDeleteObjects: false,
        preserveBucketOnDelete: true  // Previene la cancellazione accidentale in produzione
      },
      cloudfront: {
        enableCompression: true,
        enableLogging: true,
        // Utilizziamo il protocollo più recente e sicuro per TLS
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
    cdk.Tags.of(this).add('Environment', 'Production');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Documentation', 'https://github.com/pasqualemazzei/summit-milan-2025');
    cdk.Tags.of(this).add('Presentation', 'IaC: From Keyboard to Cloud');
    cdk.Tags.of(this).add('Presenter', 'Summit Milan Team');
    cdk.Tags.of(this).add('Purpose', 'Production');
    cdk.Tags.of(this).add('CostCenter', 'CloudInfrastructure');
    cdk.Tags.of(this).add('BusinessUnit', 'Engineering');
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