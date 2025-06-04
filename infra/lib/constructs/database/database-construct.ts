import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * Proprietà per il costrutto DatabaseConstruct.
 * Questi parametri permettono di configurare il costrutto in modo flessibile.
 */
export interface DatabaseConstructProps {
  /**
   * Prefisso per il nome delle risorse
   */
  appName: string;
  
  /**
   * Ambiente di deployment (dev, test, prod)
   */
  environment: string;
  
  /**
   * Se true, abilita il point-in-time recovery per la tabella
   * @default false
   */
  enablePointInTimeRecovery?: boolean;
  
  /**
   * Se true, la tabella viene preservata anche dopo la distruzione dello stack
   * @default false per ambienti non di produzione
   */
  preserveTableOnDelete?: boolean;
  
  /**
   * Tag aggiuntivi da applicare alla tabella
   */
  tags?: {[key: string]: string};
}

/**
 * Costrutto per la creazione e configurazione del layer di database.
 * 
 * Questo costrutto incapsula tutta la logica relativa al database, permettendo
 * una chiara separazione delle responsabilità e una maggiore riusabilità.
 */
export class DatabaseConstruct extends Construct {
  /**
   * La tabella DynamoDB creata dal costrutto
   */
  public readonly eventsTable: dynamodb.Table;
  
  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);
    
    const isProd = props.environment === 'prod';
    
    // Creiamo la tabella DynamoDB con le configurazioni appropriate
    this.eventsTable = new dynamodb.Table(this, 'EventsTable', {
      tableName: `${props.appName}-events-${props.environment}`,
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: isProd || props.preserveTableOnDelete 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: isProd || props.enablePointInTimeRecovery,
    });
    
    // Aggiungiamo tag standard e personalizzati alla tabella
    cdk.Tags.of(this.eventsTable).add('Purpose', 'Stores event data');
    cdk.Tags.of(this.eventsTable).add('DataClassification', 'Non-sensitive');
    cdk.Tags.of(this.eventsTable).add('DataRetention', isProd ? 'Retained' : 'Temporary');
    
    // Aggiungiamo tag personalizzati se presenti
    if (props.tags) {
      Object.entries(props.tags).forEach(([key, value]) => {
        cdk.Tags.of(this.eventsTable).add(key, value);
      });
    }
  }
} 