import { Annotations, Aspects, IAspect } from 'aws-cdk-lib';
import { CfnResource, Tag, TagManager } from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';

/**
 * Interfaccia che definisce le opzioni di configurazione per DocumentationAspect
 */
export interface DocumentationAspectProps {
  /**
   * I tag richiesti che ogni risorsa deve avere
   */
  requiredTags: string[];
  
  /**
   * Se true, emette errori per risorse non conformi, altrimenti solo avvisi
   * @default false
   */
  strict?: boolean;
  
  /**
   * Tipi di risorse da escludere dal controllo
   * @default []
   */
  excludeResourceTypes?: string[];
}

/**
 * Un aspetto CDK che verifica che le risorse abbiano tag di documentazione appropriati.
 * 
 * Questo aspect può essere applicato a qualsiasi costrutto (inclusi stack) per garantire
 * che tutte le risorse abbiano la documentazione minima necessaria sotto forma di tag.
 */
export class DocumentationAspect implements IAspect {
  private readonly requiredTags: string[];
  private readonly strict: boolean;
  private readonly excludeResourceTypes: string[];
  
  constructor(props: DocumentationAspectProps) {
    this.requiredTags = props.requiredTags;
    this.strict = props.strict ?? false;
    this.excludeResourceTypes = props.excludeResourceTypes ?? [];
  }
  
  /**
   * Metodo richiesto dall'interfaccia IAspect, chiamato per ogni costrutto
   * durante la sintesi.
   */
  public visit(node: IConstruct): void {
    // Se il nodo non è una risorsa CloudFormation, ignoriamo
    if (!(node instanceof CfnResource)) {
      return;
    }
    
    // Se la risorsa è nella lista delle esclusioni, ignoriamo
    if (this.excludeResourceTypes.includes(node.cfnResourceType)) {
      return;
    }
    
    // Alcuni tipi di risorse come CfnOutput non supportano i tag, ignoriamoli
    const nonTaggableResources = [
      'AWS::CloudFormation::Output',
      'AWS::CDK::Metadata',
      'Custom::CDKBucketDeployment'
    ];
    
    if (nonTaggableResources.includes(node.cfnResourceType)) {
      return;
    }
    
    // Verifica che ogni tag richiesto sia presente
    const missingTags: string[] = [];
    const tags = this.getResourceTags(node);
    
    for (const requiredTag of this.requiredTags) {
      if (!this.hasTag(tags, requiredTag)) {
        missingTags.push(requiredTag);
      }
    }
    
    // Se mancano tag, emetti un avviso o un errore
    if (missingTags.length > 0) {
      const resourceId = node.node.path;
      const resourceType = node.cfnResourceType;
      const message = `Risorsa '${resourceId}' (${resourceType}) manca dei seguenti tag di documentazione: ${missingTags.join(', ')}`;
      
      if (this.strict) {
        Annotations.of(node).addError(message);
      } else {
        Annotations.of(node).addWarning(message);
      }
    }
  }
  
  /**
   * Controlla se una risorsa ha un tag specifico
   */
  private hasTag(tags: TagManager | undefined, tagKey: string): boolean {
    if (!tags) {
      return false;
    }
    
    // Accesso tramite reflection per verificare i tag interni
    // Questo è un workaround poiché TagManager non espone un metodo per verificare l'esistenza di un tag
    const tagsField = (tags as any).tags;
    return tagsField && Object.keys(tagsField).includes(tagKey);
  }
  
  /**
   * Ottiene i tag della risorsa se supportati
   */
  private getResourceTags(resource: CfnResource): TagManager | undefined {
    // Accesso al tag manager tramite reflection
    // Questo è necessario perché non tutte le risorse hanno una proprietà tags pubblica
    return (resource as any).tags;
  }
} 