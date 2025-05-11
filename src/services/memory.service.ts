import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository,
} from '../repositories';
import { YamlService } from './yaml.service';
import { Repository, Metadata, Context, Component, Decision, Rule, MemoryType } from '../types';
import { Mutex } from '../utils/mutex';
import { initializeKuzuDB } from '../db/kuzu';

// Import operation modules
import * as metadataOps from './memory-operations/metadata.ops';
import * as contextOps from './memory-operations/context.ops';
import * as componentOps from './memory-operations/component.ops';
import * as decisionOps from './memory-operations/decision.ops';
import * as ruleOps from './memory-operations/rule.ops';
import * as graphOps from './memory-operations/graph.ops';

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
    // Initialize KuzuDB schema first if not already done
    // initializeKuzuDB is idempotent (uses IF NOT EXISTS)
    try {
      await initializeKuzuDB();
      console.error('MemoryService: KuzuDB schema initialization attempted/verified.');
    } catch (schemaError) {
      console.error(
        'MemoryService: CRITICAL ERROR during KuzuDB schema initialization:',
        schemaError,
      );
      // Decide if we should throw and prevent service instantiation
      throw schemaError;
    }

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
  /**
   * Get existing repository by name and branch, or create it if it doesn't exist
   * @param name Repository name
   * @param branch Repository branch (defaults to 'main')
   * @returns Repository or null if creation fails
   */
  async getOrCreateRepository(name: string, branch: string = 'main'): Promise<Repository | null> {
    // First try to find existing repository with name and branch
    const existingRepo = await this.repositoryRepo.findByName(name, branch);
    if (existingRepo) {
      return existingRepo;
    }

    // Create new repository with specified branch if it doesn't exist
    try {
      return await this.repositoryRepo.create({
        name,
        branch,
      });
    } catch (error) {
      console.error(`Failed to create repository ${name}/${branch}:`, error);
      return null;
    }
  }

  /**
   * Initialize memory bank for a repository
   * Creates metadata with stub values if it doesn't exist
   */
  async initMemoryBank(repositoryName: string, branch: string = 'main'): Promise<void> {
    const repository = await this.getOrCreateRepository(repositoryName, branch);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Check if metadata exists
    const existingMetadata = await this.metadataRepo.getMetadataForRepository(
      String(repository.id!),
    );

    if (!existingMetadata) {
      // Create stub metadata using upsert
      const today = new Date().toISOString().split('T')[0];
      await this.metadataRepo.upsertMetadata({
        repository: String(repository.id!),
        yaml_id: 'meta',
        name: repositoryName,
        branch,
        content: {
          id: 'meta',
          project: {
            name: repositoryName,
            created: today,
          },
          tech_stack: {
            language: 'Unknown',
            framework: 'Unknown',
            datastore: 'Unknown',
          },
          architecture: 'unknown',
          memory_spec_version: '3.0.0',
        },
      });
    }
  }

  /**
   * Get metadata for a repository
   */
  async getMetadata(repositoryName: string, branch: string = 'main'): Promise<Metadata | null> {
    return metadataOps.getMetadataOp(
      repositoryName,
      branch,
      this.repositoryRepo,
      this.metadataRepo,
    );
  }

  /**
   * Update metadata for a repository
   */
  async updateMetadata(
    repositoryName: string,
    metadata: Partial<Metadata['content']>,
    branch: string = 'main',
  ): Promise<Metadata | null> {
    return metadataOps.updateMetadataOp(
      repositoryName,
      branch,
      metadata,
      this.repositoryRepo,
      this.metadataRepo,
    );
  }

  /**
   * Get today's context or create it if it doesn't exist
   */
  async getTodayContext(repositoryName: string, branch: string = 'main'): Promise<Context | null> {
    return contextOps.getTodayContextOp(
      repositoryName,
      branch,
      this.repositoryRepo,
      this.contextRepo,
    );
  }

  /**
   * Update today's context
   */
  async updateTodayContext(
    repositoryName: string,
    contextUpdate: Partial<Omit<Context, 'repository_id' | 'yaml_id' | 'iso_date'>>,
    branch: string = 'main',
  ): Promise<Context | null> {
    const repository = await this.repositoryRepo.findByName(repositoryName, branch);
    if (!repository) {
      return null;
    }
    const today = new Date().toISOString().split('T')[0];
    const context = await this.contextRepo.getTodayContext(String(repository.id!), today);
    if (!context) {
      return null;
    }

    const updatedContextObject: Context = {
      ...context,
      ...contextUpdate,
      repository: String(repository.id!),
      branch: branch,
      name: (contextUpdate as any).name || context.name,
    };

    const updated = await this.contextRepo.upsertContext(updatedContextObject);
    return updated ?? null;
  }

  /**
   * Get latest contexts
   */
  async getLatestContexts(
    repositoryName: string,
    branch: string = 'main',
    limit?: number,
  ): Promise<Context[]> {
    return contextOps.getLatestContextsOp(
      repositoryName,
      branch,
      limit,
      this.repositoryRepo,
      this.contextRepo,
    );
  }

  /**
   * Update today's context for a repository/branch (MCP tool compatibility)
   * Accepts summary, agent, decision, issue, observation. Merges with existing.
   */
  async updateContext(params: {
    repository: string;
    branch?: string;
    summary?: string;
    agent?: string;
    decision?: string;
    issue?: string;
    observation?: string;
  }): Promise<Context | null> {
    // The params for updateContextOp are slightly different (repositoryName instead of repository)
    return contextOps.updateContextOp(
      { repositoryName: params.repository, ...params },
      this.repositoryRepo,
      this.contextRepo,
    );
  }

  /**
   * Create or update a rule for a repository
   */
  async upsertRule(
    repositoryName: string,
    rule: Omit<Rule, 'repository' | 'branch'>,
    branch: string = 'main',
  ): Promise<Rule | null> {
    return ruleOps.upsertRuleOp(repositoryName, branch, rule, this.repositoryRepo, this.ruleRepo);
  }

  // Add new methods for tools, delegating to Ops
  async upsertComponent(
    repositoryName: string,
    branch: string,
    componentData: {
      yaml_id: string;
      name: string;
      kind?: string;
      status?: 'active' | 'deprecated' | 'planned';
      depends_on?: string[];
    },
  ): Promise<Component | null> {
    return componentOps.upsertComponentOp(
      repositoryName,
      branch,
      componentData,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  async upsertDecision(
    repositoryName: string,
    branch: string,
    decisionData: {
      yaml_id: string;
      name: string;
      date: string;
      context?: string;
    },
  ): Promise<Decision | null> {
    return decisionOps.upsertDecisionOp(
      repositoryName,
      branch,
      decisionData,
      this.repositoryRepo,
      this.decisionRepo,
    );
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON)
   */
  async getComponentDependencies(
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component[]> {
    return componentOps.getComponentDependenciesOp(
      repositoryName,
      branch,
      componentId,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  async getActiveComponents(repositoryName: string, branch: string = 'main'): Promise<Component[]> {
    return componentOps.getActiveComponentsOp(
      repositoryName,
      branch,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for getComponentDependents - to be implemented via componentOps
  async getComponentDependents(
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component[]> {
    return componentOps.getComponentDependentsOp(
      repositoryName,
      branch,
      componentId,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for getItemContextualHistory - to be implemented via graphOps
  async getItemContextualHistory(
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<any> {
    console.error(
      `DEBUG: memory.service.ts: getItemContextualHistory received itemType = >>>${itemType}<<<`,
    );
    return graphOps.getItemContextualHistoryOp(
      repositoryName,
      branch,
      itemId,
      itemType,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for getGoverningItemsForComponent - to be implemented via graphOps
  async getGoverningItemsForComponent(
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any> {
    return graphOps.getGoverningItemsForComponentOp(
      repositoryName,
      branch,
      componentId,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for getRelatedItems - to be implemented via graphOps
  async getRelatedItems(
    repositoryName: string,
    branch: string,
    itemId: string,
    params: {
      relationshipTypes?: string[];
      depth?: number;
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
    },
  ): Promise<any> {
    return graphOps.getRelatedItemsOp(
      repositoryName,
      branch,
      itemId,
      params,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for kCoreDecomposition - to be implemented via graphOps
  async kCoreDecomposition(repositoryName: string, branch: string, k?: number): Promise<any> {
    return graphOps.kCoreDecompositionOp(
      repositoryName,
      branch,
      k,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for louvainCommunityDetection - to be implemented via graphOps
  async louvainCommunityDetection(repositoryName: string, branch: string): Promise<any> {
    return graphOps.louvainCommunityDetectionOp(
      repositoryName,
      branch,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for pageRank - to be implemented via graphOps
  async pageRank(
    repositoryName: string,
    branch: string,
    dampingFactor?: number,
    iterations?: number,
    tolerance?: number,
    normalizeInitial?: boolean,
  ): Promise<any> {
    return graphOps.pageRankOp(
      repositoryName,
      branch,
      dampingFactor,
      iterations,
      tolerance,
      normalizeInitial,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for stronglyConnectedComponents - to be implemented via graphOps
  async getStronglyConnectedComponents(
    repositoryName: string,
    branch: string,
    maxIterations?: number,
  ): Promise<any> {
    return graphOps.stronglyConnectedComponentsOp(
      repositoryName,
      branch,
      maxIterations,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // In src/services/memory.service.ts, inside MemoryService class
  async getWeaklyConnectedComponents(
    repositoryName: string,
    branch: string,
    maxIterations?: number,
  ): Promise<any> {
    return graphOps.weaklyConnectedComponentsOp(
      repositoryName,
      branch,
      maxIterations,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  // Placeholder for shortestPath - to be implemented via graphOps
  async shortestPath(
    repositoryName: string,
    branch: string,
    startNodeId: string,
    endNodeId: string,
    params: {
      relationshipTypes?: string[];
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
      algorithm?: string;
    },
  ): Promise<any> {
    return graphOps.shortestPathOp(
      repositoryName,
      branch,
      startNodeId,
      endNodeId,
      params,
      this.repositoryRepo,
      this.componentRepo,
    );
  }

  async getDecisionsByDateRange(
    repositoryName: string,
    branch: string = 'main',
    startDate: string,
    endDate: string,
  ): Promise<Decision[]> {
    return decisionOps.getDecisionsByDateRangeOp(
      repositoryName,
      branch,
      startDate,
      endDate,
      this.repositoryRepo,
      this.decisionRepo,
    );
  }

  async getActiveRules(repositoryName: string, branch: string = 'main'): Promise<Rule[]> {
    return ruleOps.getActiveRulesOp(repositoryName, branch, this.repositoryRepo, this.ruleRepo);
  }
}
