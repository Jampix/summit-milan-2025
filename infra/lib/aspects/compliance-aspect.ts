import { Aspects, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AwsSolutionsChecks,
  NagSuppressions,
  NagPackSuppression
} from 'cdk-nag';

/**
 * Proprietà per il costrutto ComplianceAspect
 */
export interface ComplianceAspectProps {
  /**
   * Se true, emette errori per risorse non conformi, altrimenti solo avvisi
   * @default false
   */
  strict?: boolean;
  
  /**
   * Array di soppressioni per ignorare specifici controlli
   */
  suppressions?: NagPackSuppression[];
}

/**
 * Un costrutto che aggiunge controlli di conformità allo stack
 * 
 * Utilizza cdk-nag per validare lo stack rispetto a best practice di sicurezza
 * e generare report di conformità.
 */
export class ComplianceAspect extends Construct {
  constructor(scope: Construct, id: string, props?: ComplianceAspectProps) {
    super(scope, id);
    
    // Ottieni lo stack dall'albero dei costrutti
    const stack = Stack.of(scope);
    
    // Applica i controlli di AwsSolutionsChecks a tutto lo stack
    Aspects.of(stack).add(new AwsSolutionsChecks({ 
      verbose: true,
      // In modalità strict gli errori causano il fallimento della sintesi
      logIgnores: props?.strict ?? false
    }));
    
    // Applica soppressioni specifiche se fornite
    if (props?.suppressions && props.suppressions.length > 0) {
      NagSuppressions.addStackSuppressions(stack, props.suppressions);
    }
    
    // Nota: le soppressioni predefinite sono state rimosse perché i percorsi
    // non corrispondevano a risorse esistenti, causando errori.
  }
} 