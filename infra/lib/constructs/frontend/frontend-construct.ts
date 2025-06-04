import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

/**
 * Proprietà per il costrutto FrontendConstruct
 */
export interface FrontendConstructProps {
  /**
   * Prefisso per il nome delle risorse
   */
  appName: string;
  
  /**
   * Ambiente di deployment (dev, test, prod)
   */
  environment: string;
  
  /**
   * Configurazione del bucket S3
   */
  s3?: {
    /**
     * Se true, il bucket e i suoi oggetti vengono eliminati quando lo stack viene distrutto
     * @default true in ambienti non di produzione
     */
    autoDeleteObjects?: boolean;
    
    /**
     * Se true, il bucket viene preservato quando lo stack viene distrutto
     * @default true in produzione
     */
    preserveBucketOnDelete?: boolean;
  };
  
  /**
   * Configurazione CloudFront
   */
  cloudfront?: {
    /**
     * Abilita la compressione dei contenuti
     * @default true
     */
    enableCompression?: boolean;
    
    /**
     * Abilita il logging delle richieste
     * @default true
     */
    enableLogging?: boolean;
    
    /**
     * Versione minima del protocollo TLS per le connessioni client
     * @default TLS_V1_2_2021
     */
    minimumProtocolVersion?: cloudfront.SecurityPolicyProtocol;
  };
}

/**
 * Costrutto per la creazione e configurazione dell'infrastruttura frontend.
 * 
 * Questo costrutto gestisce:
 * - Bucket S3 per l'hosting del sito statico
 * - Distribuzione CloudFront
 * - Configurazioni di sicurezza appropriate
 */
export class FrontendConstruct extends Construct {
  /**
   * Il bucket S3 che ospita il sito statico
   */
  public readonly websiteBucket: s3.Bucket;
  
  /**
   * La distribuzione CloudFront
   */
  public readonly distribution: cloudfront.Distribution;
  
  /**
   * L'URL del frontend
   */
  public readonly frontendUrl: string;
  
  constructor(scope: Construct, id: string, props: FrontendConstructProps) {
    super(scope, id);
    
    const isProd = props.environment === 'prod';
    const s3Config = props.s3 || {};
    const cloudfrontConfig = props.cloudfront || {};
    
    // Bucket S3 per il frontend statico
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: (isProd || s3Config.preserveBucketOnDelete) 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: s3Config.autoDeleteObjects !== undefined 
        ? s3Config.autoDeleteObjects 
        : !isProd,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true
    });
    
    // Aggiungiamo una policy di bucket esplicita per forzare HTTPS
    const secureTransportPolicy = new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['s3:*'],
      resources: [
        this.websiteBucket.bucketArn,
        `${this.websiteBucket.bucketArn}/*`
      ],
      principals: [new iam.AnyPrincipal()],
      conditions: {
        'Bool': {
          'aws:SecureTransport': 'false'
        }
      }
    });
    this.websiteBucket.addToResourcePolicy(secureTransportPolicy);
    
    // Origin Access Identity per sicurezza CloudFront
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for ${props.appName} website`
    });
    
    // Concessione dei permessi di lettura all'OAI
    this.websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [this.websiteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(
        originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
      )]
    }));
    
    // Creazione di una cache policy personalizzata per la corretta gestione delle richieste
    const cachePolicy = new cloudfront.CachePolicy(this, 'SecureCachePolicy', {
      comment: `Secure Cache Policy for ${props.appName}`,
      defaultTtl: cdk.Duration.days(1),
      minTtl: cdk.Duration.hours(1),
      maxTtl: cdk.Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      cachePolicyName: `${props.appName}-secure-cache-policy-${props.environment}`
    });
    
    // Creazione di una policy per gli header di risposta con impostazioni di sicurezza
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `${props.appName}-security-headers-${props.environment}`,
      comment: 'Security headers policy for enhanced security',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; object-src 'none';",
          override: true
        },
        contentTypeOptions: {
          override: true
        },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(63072000),
          includeSubdomains: true,
          preload: true,
          override: true
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true
        }
      }
    });
    
    // Protocollo TLS minimo (TLS 1.2 è il più sicuro supportato universalmente)
    const securityPolicy = cloudfrontConfig.minimumProtocolVersion || 
      cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021;
    
    // Distribuzione CloudFront con impostazioni di sicurezza avanzate
    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket, {
          originAccessIdentity,
          connectionAttempts: 3,
          connectionTimeout: cdk.Duration.seconds(10),
          customHeaders: {
            'Strict-Transport-Security': 'max-age=63072000; includeSubdomains; preload'
          }
        }),
        compress: cloudfrontConfig.enableCompression !== undefined 
          ? cloudfrontConfig.enableCompression 
          : true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cachePolicy,
        responseHeadersPolicy: responseHeadersPolicy,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        }
      ],
      // Impostiamo TLS 1.2 come versione minima del protocollo
      minimumProtocolVersion: securityPolicy,
      // Configurazioni di sicurezza aggiuntive
      enableLogging: cloudfrontConfig.enableLogging !== undefined 
        ? cloudfrontConfig.enableLogging 
        : true,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      comment: `${props.appName} website distribution - ${props.environment}`
    });
    
    // URL del frontend
    this.frontendUrl = `https://${this.distribution.distributionDomainName}`;
    
    // Aggiunta di tag per la documentazione
    cdk.Tags.of(this.websiteBucket).add('Purpose', 'Static website hosting');
    cdk.Tags.of(this.distribution).add('Purpose', 'Content delivery');
    
    // Tag relativi alla sicurezza 
    cdk.Tags.of(this.distribution).add('Security:TLSMinVersion', securityPolicy.toString());
    cdk.Tags.of(this.distribution).add('Security:HttpsEnforced', 'true');
    cdk.Tags.of(this.distribution).add('Security:HttpVersion', 'HTTP2');
    cdk.Tags.of(this.distribution).add('Security:ContentSecurityPolicy', 'Enabled');
  }
} 