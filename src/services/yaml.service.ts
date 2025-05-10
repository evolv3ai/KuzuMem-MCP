import YAML from 'yaml';
import { 
  Metadata, 
  Context, 
  Component, 
  Decision, 
  Rule 
} from '../types';
import { Mutex } from '../utils/mutex';

/**
 * Service for YAML serialization and deserialization
 * Follows the singleton pattern for resource management
 */
export class YamlService {
  private static instance: YamlService;
  private static lock = new Mutex();

  private constructor() {}

  static async getInstance(): Promise<YamlService> {
    // Acquire lock for thread safety
    const release = await YamlService.lock.acquire();
    
    try {
      if (!YamlService.instance) {
        YamlService.instance = new YamlService();
      }
      
      return YamlService.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  /**
   * Serializes metadata to YAML format
   */
  serializeMetadata(metadata: Metadata): string {
    return `--- !Metadata\n${YAML.stringify(metadata.content)}`;
  }

  /**
   * Serializes context to YAML format
   */
  serializeContext(context: Context): string {
    // Extract fields from context, format decisions and observations
    const yamlObj = {
      id: context.yaml_id,
      iso_date: context.iso_date,
      agent: context.agent,
      related_issue: context.related_issue,
      summary: context.summary,
      decisions: context.decisions,
      observations: context.observations
    };
    
    return `--- !Context\n${YAML.stringify(yamlObj)}`;
  }

  /**
   * Serializes component to YAML format
   */
  serializeComponent(component: Component): string {
    const yamlObj = {
      id: component.yaml_id,
      name: component.name,
      kind: component.kind,
      depends_on: component.depends_on,
      status: component.status
    };
    
    return `--- !Component\n${YAML.stringify(yamlObj)}`;
  }

  /**
   * Serializes decision to YAML format
   */
  serializeDecision(decision: Decision): string {
    const yamlObj = {
      id: decision.yaml_id,
      name: decision.name,
      context: decision.context,
      date: decision.date
    };
    
    return `--- !Decision\n${YAML.stringify(yamlObj)}`;
  }

  /**
   * Serializes rule to YAML format
   */
  serializeRule(rule: Rule): string {
    const yamlObj = {
      id: rule.yaml_id,
      name: rule.name,
      created: rule.created,
      triggers: rule.triggers,
      content: rule.content,
      status: rule.status
    };
    
    return `--- !Rule\n${YAML.stringify(yamlObj)}`;
  }

  /**
   * Parses YAML string and determines the type
   */
  parseYaml(yamlString: string): { type: string; data: any } {
    // Extract the YAML type from the first line (e.g., "--- !Metadata")
    const firstLine = yamlString.split('\n')[0];
    const match = firstLine.match(/---\s+!(\w+)/);
    
    if (!match) {
      throw new Error('Invalid YAML format: missing type declaration');
    }
    
    const type = match[1].toLowerCase();
    const content = YAML.parse(yamlString.substring(firstLine.length));
    
    return {
      type,
      data: content
    };
  }
}
