import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Proprietà di configurazione per il DocumentedBucket
 */
export interface DocumentedBucketProps {
  /**
   * Nome del bucket (opzionale, se non specificato sarà generato automaticamente)
   */
  bucketName?: string;
  
  /**
   * Scopo del bucket, utilizzato per documentazione e tag
   */
  purpose: string;
  
  /**
   * Proprietario o team responsabile del bucket
   */
  owner: string;
  
  /**
   * Classificazione dei dati archiviati nel bucket
   * @default 'Non-sensitive'
   */
  dataClassification?: string;
  
  /**
   * Contesto di business o dominio a cui appartiene questa risorsa
   * @default 'General'
   */
  businessContext?: string;
  
  /**
   * Livello di criticità della risorsa
   * @default 'Medium'
   */
  criticality?: 'High' | 'Medium' | 'Low';
  
  /**
   * Progetto associato alla risorsa
   */
  project?: string;
  
  /**
   * Ambiente (dev, test, prod, etc.)
   */
  environment: string;
  
  /**
   * Ulteriori proprietà di configurazione del bucket
   */
  bucketProps?: Omit<s3.BucketProps, 'bucketName'>;
  
  /**
   * URL della documentazione esterna per questa risorsa
   */
  documentationUrl?: string;
  
  /**
   * Genera un output CloudFormation con la documentazione
   * @default true
   */
  generateDocumentationOutput?: boolean;
}

/**
 * Un costrutto avanzato per bucket S3 con documentazione integrata.
 * 
 * Questo costrutto estende le funzionalità standard del bucket S3 aggiungendo:
 * - Tagging semantico automatico
 * - Output di documentazione
 * - Metadati estesi
 * - Parametri di sicurezza standard
 */
export class DocumentedBucket extends Construct {
  /**
   * Il bucket S3 creato dal costrutto
   */
  public readonly bucket: s3.Bucket;
  
  /**
   * Lo scopo del bucket, per documentazione
   */
  public readonly purpose: string;
  
  /**
   * Il proprietario del bucket
   */
  public readonly owner: string;
  
  /**
   * La classificazione dei dati nel bucket
   */
  public readonly dataClassification: string;
  
  constructor(scope: Construct, id: string, props: DocumentedBucketProps) {
    super(scope, id);
    
    this.purpose = props.purpose;
    this.owner = props.owner;
    this.dataClassification = props.dataClassification || 'Non-sensitive';
    
    const isProd = props.environment === 'prod';
    
    // Creazione del bucket con impostazioni predefinite sicure
    this.bucket = new s3.Bucket(this, 'Resource', {
      bucketName: props.bucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
      ...props.bucketProps
    });
    
    // Applica tag semantici al bucket
    this.applySemanticTags(props);
    
    // Genera output di documentazione se richiesto
    if (props.generateDocumentationOutput !== false) {
      this.generateDocumentation(props);
    }
  }
  
  /**
   * Applica tag semantici per documentare la risorsa
   */
  private applySemanticTags(props: DocumentedBucketProps): void {
    // Applica i tag base al bucket
    cdk.Tags.of(this.bucket).add('Purpose', props.purpose);
    cdk.Tags.of(this.bucket).add('Owner', props.owner);
    cdk.Tags.of(this.bucket).add('DataClassification', this.dataClassification);
    cdk.Tags.of(this.bucket).add('Environment', props.environment);
    cdk.Tags.of(this.bucket).add('BusinessContext', props.businessContext || 'General');
    cdk.Tags.of(this.bucket).add('Criticality', props.criticality || 'Medium');
    cdk.Tags.of(this.bucket).add('ManagedBy', 'CDK');
    cdk.Tags.of(this.bucket).add('CreatedBy', 'DocumentedBucket');
    
    // Aggiungi tag di progetto se specificato
    if (props.project) {
      cdk.Tags.of(this.bucket).add('Project', props.project);
    }
    
    // Aggiungi URL della documentazione se specificato
    if (props.documentationUrl) {
      cdk.Tags.of(this.bucket).add('DocumentationUrl', props.documentationUrl);
    }
  }
  
  /**
   * Genera output di documentazione CloudFormation
   */
  private generateDocumentation(props: DocumentedBucketProps): void {
    // Genera un output CloudFormation con la documentazione in formato Markdown
    new cdk.CfnOutput(this, 'Documentation', {
      description: 'Documentazione del bucket',
      value: this.generateMarkdownDocumentation(props)
    });
  }
  
  /**
   * Genera documentazione in formato Markdown
   */
  private generateMarkdownDocumentation(props: DocumentedBucketProps): string {
    const bucketName = props.bucketName || `<Nome generato automaticamente>`;
    const isProd = props.environment === 'prod';
    
    return [
      `# Bucket S3: ${bucketName}`,
      '',
      `## Informazioni generali`,
      `- **Scopo**: ${props.purpose}`,
      `- **Proprietario**: ${props.owner}`,
      `- **Classificazione dati**: ${this.dataClassification}`,
      `- **Ambiente**: ${props.environment}`,
      `- **Criticità**: ${props.criticality || 'Media'}`,
      `- **Contesto di business**: ${props.businessContext || 'Generale'}`,
      '',
      `## Configurazione`,
      `- **Crittografia**: ${props.bucketProps?.encryption || 'S3-Managed'}`,
      `- **Accesso pubblico**: Bloccato`,
      `- **Versioning**: ${isProd ? 'Abilitato' : 'Disabilitato'}`,
      `- **SSL**: Obbligatorio`,
      '',
      `## Link utili`,
      `- **Documentazione**: ${props.documentationUrl || 'N/A'}`,
    ].join('\n');
  }
} 