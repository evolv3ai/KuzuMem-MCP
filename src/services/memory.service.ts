import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository
} from '../repositories';
import { YamlService } from './yaml.service';
import {
  Repository,
  Metadata,
  Context,
  Component,
  Decision,
  Rule,
  MemoryType
} from '../types';
import { Mutex } from '../utils/mutex';

/**
 * Service for memory bank operations
 * Implements the singleton pattern as per best practices
 */
export class MemoryService {
  private static instance: MemoryService;
  private static lock = new Mutex();
  private repositoryRepo!: RepositoryRepository;
  private metadataRepo!: MetadataRepository;
  private contextRepo!: ContextRepository;
  private componentRepo!: ComponentRepository;
  private decisionRepo!: DecisionRepository;
  private ruleRepo!: RuleRepository;
  private yamlService!: YamlService;

  private constructor() {}

  /**
   * Initialize the repositories asynchronously
   * This ensures proper lazy initialization of dependencies
   */
  private async initialize(): Promise<void> {
    this.repositoryRepo = await RepositoryRepository.getInstance();
    this.metadataRepo = await MetadataRepository.getInstance();
    this.contextRepo = await ContextRepository.getInstance();
    this.componentRepo = await ComponentRepository.getInstance();
    this.decisionRepo = await DecisionRepository.getInstance();
    this.ruleRepo = await RuleRepository.getInstance();
    this.yamlService = await YamlService.getInstance();
  }

  static async getInstance(): Promise<MemoryService> {
    // Acquire lock for thread safety
    const release = await MemoryService.lock.acquire();
    
    try {
      if (!MemoryService.instance) {
        MemoryService.instance = new MemoryService();
        await MemoryService.instance.initialize();
      }
      
      return MemoryService.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  /**
   * Get or create a repository by name
   */
  async getOrCreateRepository(name: string): Promise<Repository> {
    const existingRepo = await this.repositoryRepo.findByName(name);
    
    if (existingRepo) {
      return existingRepo;
    }
    
    return this.repositoryRepo.create({ name });
  }

  /**
   * Initialize memory bank for a repository
   * Creates metadata with stub values if it doesn't exist
   */
  async initMemoryBank(repositoryName: string): Promise<void> {
    const repository = await this.getOrCreateRepository(repositoryName);
    
    // Check if metadata exists
    const existingMetadata = await this.metadataRepo.getMetadataForRepository(repository.id!);
    
    if (!existingMetadata) {
      // Create stub metadata
      const today = new Date().toISOString().split('T')[0];
      
      await this.metadataRepo.create({
        repository_id: repository.id!,
        yaml_id: 'meta',
        content: {
          id: 'meta',
          project: {
            name: repositoryName,
            created: today
          },
          tech_stack: {
            language: 'Unknown',
            framework: 'Unknown',
            datastore: 'Unknown'
          },
          architecture: 'unknown',
          memory_spec_version: '3.0.0'
        }
      });
    }
  }

  /**
   * Get metadata for a repository
   */
  async getMetadata(repositoryName: string): Promise<Metadata | null> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return null;
    }
    
    return this.metadataRepo.getMetadataForRepository(repository.id!);
  }

  /**
   * Update metadata for a repository
   */
  async updateMetadata(repositoryName: string, metadata: Partial<Metadata['content']>): Promise<Metadata | null> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return null;
    }
    
    const existingMetadata = await this.metadataRepo.getMetadataForRepository(repository.id!);
    
    if (!existingMetadata) {
      return null;
    }
    
    const updatedContent = { 
      ...existingMetadata.content,
      ...metadata
    };
    
    return this.metadataRepo.upsertMetadata({
      ...existingMetadata,
      content: updatedContent as Metadata['content']
    });
  }

  /**
   * Get today's context or create it if it doesn't exist
   */
  async getTodayContext(repositoryName: string): Promise<Context | null> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return null;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toISOString().split('.')[0].replace(/:/g, '-');
    const contextId = `ctx-${time}`;
    
    const existingContext = await this.contextRepo.getTodayContext(repository.id!, today);
    
    if (existingContext) {
      return existingContext;
    }
    
    // Create new context for today
    return this.contextRepo.create({
      repository_id: repository.id!,
      yaml_id: contextId,
      iso_date: today,
      agent: 'system',
      summary: 'Daily context',
      decisions: [],
      observations: []
    });
  }

  /**
   * Update today's context
   */
  async updateTodayContext(
    repositoryName: string, 
    contextUpdate: Partial<Omit<Context, 'repository_id' | 'yaml_id' | 'iso_date'>>
  ): Promise<Context | null> {
    const context = await this.getTodayContext(repositoryName);
    
    if (!context) {
      return null;
    }
    
    const updatedContext: Context = {
      ...context,
      ...contextUpdate,
      // Ensure these fields aren't overwritten
      repository_id: context.repository_id,
      yaml_id: context.yaml_id,
      iso_date: context.iso_date
    };
    
    return this.contextRepo.upsertContext(updatedContext);
  }

  /**
   * Get latest contexts
   */
  async getLatestContexts(repositoryName: string, limit: number = 10): Promise<Context[]> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return [];
    }
    
    return this.contextRepo.getLatestContexts(repository.id!, limit);
  }

  /**
   * Create or update a component
   */
  async upsertComponent(
    repositoryName: string,
    componentId: string,
    component: Omit<Component, 'repository_id' | 'yaml_id'>
  ): Promise<Component | null> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return null;
    }
    
    return this.componentRepo.upsertComponent({
      repository_id: repository.id!,
      yaml_id: componentId,
      ...component
    });
  }

  /**
   * Get all active components
   */
  async getActiveComponents(repositoryName: string): Promise<Component[]> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return [];
    }
    
    return this.componentRepo.getActiveComponents(repository.id!);
  }

  /**
   * Create or update a decision
   */
  async upsertDecision(
    repositoryName: string,
    decisionId: string,
    decision: Omit<Decision, 'repository_id' | 'yaml_id'>
  ): Promise<Decision | null> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return null;
    }
    
    return this.decisionRepo.upsertDecision({
      repository_id: repository.id!,
      yaml_id: decisionId,
      ...decision
    });
  }

  /**
   * Get decisions by date range
   */
  async getDecisionsByDateRange(
    repositoryName: string,
    startDate: string,
    endDate: string
  ): Promise<Decision[]> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return [];
    }
    
    return this.decisionRepo.getDecisionsByDateRange(repository.id!, startDate, endDate);
  }

  /**
   * Create or update a rule
   */
  async upsertRule(
    repositoryName: string,
    ruleId: string,
    rule: Omit<Rule, 'repository_id' | 'yaml_id'>
  ): Promise<Rule | null> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return null;
    }
    
    return this.ruleRepo.upsertRule({
      repository_id: repository.id!,
      yaml_id: ruleId,
      ...rule
    });
  }

  /**
   * Get all active rules
   */
  async getActiveRules(repositoryName: string): Promise<Rule[]> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return [];
    }
    
    return this.ruleRepo.getActiveRules(repository.id!);
  }

  /**
   * Export memory bank as YAML files
   * Returns an object with file paths and content
   */
  async exportMemoryBank(repositoryName: string): Promise<Record<string, string>> {
    const repository = await this.repositoryRepo.findByName(repositoryName);
    
    if (!repository) {
      return {};
    }
    
    const files: Record<string, string> = {};
    
    // Export metadata
    const metadata = await this.metadataRepo.getMetadataForRepository(repository.id!);
    if (metadata) {
      files['memory/metadata.yaml'] = this.yamlService.serializeMetadata(metadata);
    }
    
    // Export contexts
    const contexts = await this.contextRepo.findByRepositoryId(repository.id!);
    for (const context of contexts) {
      files[`memory/context/${context.yaml_id}.yaml`] = this.yamlService.serializeContext(context);
    }
    
    // Export components
    const components = await this.componentRepo.findByRepositoryId(repository.id!);
    for (const component of components) {
      files[`memory/graph/components/${component.yaml_id}.yaml`] = this.yamlService.serializeComponent(component);
    }
    
    // Export decisions
    const decisions = await this.decisionRepo.findByRepositoryId(repository.id!);
    for (const decision of decisions) {
      files[`memory/graph/decisions/${decision.yaml_id}.yaml`] = this.yamlService.serializeDecision(decision);
    }
    
    // Export rules
    const rules = await this.ruleRepo.findByRepositoryId(repository.id!);
    for (const rule of rules) {
      files[`memory/graph/rules/${rule.yaml_id}.yaml`] = this.yamlService.serializeRule(rule);
    }
    
    return files;
  }

  /**
   * Import memory bank from YAML content
   */
  async importMemoryBank(repositoryName: string, yamlContent: string, type: MemoryType, id: string): Promise<boolean> {
    const repository = await this.getOrCreateRepository(repositoryName);
    
    try {
      const { data } = this.yamlService.parseYaml(yamlContent);
      
      switch (type) {
        case 'metadata':
          await this.metadataRepo.upsertMetadata({
            repository_id: repository.id!,
            yaml_id: id,
            content: data
          });
          break;
          
        case 'context':
          await this.contextRepo.upsertContext({
            repository_id: repository.id!,
            yaml_id: id,
            iso_date: data.iso_date,
            agent: data.agent,
            related_issue: data.related_issue,
            summary: data.summary,
            decisions: data.decisions,
            observations: data.observations
          });
          break;
          
        case 'component':
          await this.componentRepo.upsertComponent({
            repository_id: repository.id!,
            yaml_id: id,
            name: data.name,
            kind: data.kind,
            depends_on: data.depends_on,
            status: data.status || 'active'
          });
          break;
          
        case 'decision':
          await this.decisionRepo.upsertDecision({
            repository_id: repository.id!,
            yaml_id: id,
            name: data.name,
            context: data.context,
            date: data.date
          });
          break;
          
        case 'rule':
          await this.ruleRepo.upsertRule({
            repository_id: repository.id!,
            yaml_id: id,
            name: data.name,
            created: data.created,
            triggers: data.triggers,
            content: data.content,
            status: data.status || 'active'
          });
          break;
          
        default:
          return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error importing memory bank:', error);
      return false;
    }
  }
}
