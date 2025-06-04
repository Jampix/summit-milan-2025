#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DevelopmentStack } from '../lib/stacks/development-stack';
import { ProductionStack } from '../lib/stacks/production-stack';
import { ComplianceAspect } from '../lib/aspects/compliance-aspect';

/**
 * Configurazione principale dell'app CDK con architettura modulare
 * 
 * Questo file dimostra best practice di configurazione come:
 * - Utilizzo di contesti per gestire diversi ambienti
 * - Stack separati per ogni ambiente
 * - Tag globali per classificazione delle risorse
 * - Documentazione chiara del codice
 * - Configurazione esplicita dell'ambiente AWS
 * - Controlli di conformità automatici tramite cdk-nag
 * - Generazione automatica di documentazione sulla conformità
 */

// Inizializzazione dell'app CDK
const app = new cdk.App();

// Recupero informazioni di contesto
const targetEnvironment = app.node.tryGetContext('environment') || 'dev';
console.log(`Target deployment environment: ${targetEnvironment}`);

// Recupero di account e regione in base all'ambiente
const awsAccount = process.env.CDK_DEFAULT_ACCOUNT;
const awsRegion = process.env.CDK_DEFAULT_REGION || 'eu-west-1';

// Configurazione di base per tutti gli stack
const envConfig = {
  env: { 
    account: awsAccount, 
    region: awsRegion 
  }
};

// Aggiunta di tag globali a livello di app
cdk.Tags.of(app).add('Presentation', 'IaC: From Keyboard to Cloud');
cdk.Tags.of(app).add('Presenter', 'Summit Milan Team');
cdk.Tags.of(app).add('Repository', 'https://github.com/pasqualemazzei/summit-milan-2025');

// Creazione degli stack in base all'ambiente target
let stack: cdk.Stack;
if (targetEnvironment === 'prod') {
  console.log('Deploying PRODUCTION stack');
  stack = new ProductionStack(app, 'SummitMilan2025ProdStack', {
    ...envConfig,
    // Aggiunta di una descrizione chiara per lo stack in CloudFormation
    description: `Stack di produzione per il Summit Milan 2025 - Ambiente: ${targetEnvironment}`
  });
} else {
  console.log('Deploying DEVELOPMENT stack');
  stack = new DevelopmentStack(app, 'SummitMilan2025DevStack', {
    ...envConfig,
    // Aggiunta di una descrizione chiara per lo stack in CloudFormation
    description: `Stack di sviluppo per il Summit Milan 2025 - Ambiente: ${targetEnvironment}`
  });
}

// Aggiungi l'aspect di compliance allo stack
new ComplianceAspect(stack, 'ComplianceChecks', {
  // In produzione, siamo più rigorosi con i controlli di conformità
  strict: targetEnvironment === 'prod',
  // Aggiungi le soppressioni specifiche per il tuo caso d'uso
  suppressions: [
    { 
      id: 'AwsSolutions-S1', 
      reason: 'Accessi di server log gestiti da policy IAM' 
    },
    { 
      id: 'AwsSolutions-IAM5', 
      reason: 'Policy con privilegi limitati per casi specifici' 
    },
    // Soppressioni TLS per CloudFront
    { 
      id: 'AwsSolutions-CFR4', 
      reason: 'Abbiamo configurato TLS_V1_2_2021 per tutte le distribuzioni CloudFront, ma questo avviso può persistere in alcuni casi con il viewer certificate predefinito' 
    },
    { 
      id: 'AwsSolutions-CFR5', 
      reason: 'Abbiamo configurato TLS_V1_2_2021 e HTTP/2 per le comunicazioni con S3, ma questo avviso può persistere con alcune configurazioni di origine' 
    },
    {
      id: 'AwsSolutions-L1',
      reason: 'Le funzioni Lambda sono configurate con i runtime appropriati per le esigenze del progetto'
    }
  ]
});

// Sintesi dello stack
app.synth();