import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository,
} from '../repositories';
import {
  Repository,
  Metadata,
  Context,
  Component,
  Decision,
  Rule,
  ComponentStatus,
  ComponentInput,
} from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';
import { RepositoryProvider } from '../db';
import * as path from 'path';

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
 *
 * Refactored to use RepositoryProvider for repository management
 */
export class MemoryService {
  private static instance: MemoryService;
  private static lock = new Mutex();

  // Multi-root support
  private kuzuClients: Map<string, KuzuDBClient> = new Map();

  // Repository provider for managing repository instances
  private repositoryProvider: RepositoryProvider | null = null;

  private constructor() {
    // No initialization here - will be done in initialize()
  }

  private async initialize(): Promise<void> {
    // Initialize repository provider
    this.repositoryProvider = await RepositoryProvider.getInstance();
    console.log('MemoryService: Initialized with RepositoryProvider');
  }

  /**
   * Get a KuzuDBClient for the given client project root
   * Also initializes all repositories for this client if not already initialized
   *
   * @param clientProjectRoot The absolute path to the client project root
   * @returns Initialized KuzuDBClient instance
   */
  public async getKuzuClient(clientProjectRoot: string): Promise<KuzuDBClient> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure path is absolute
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }

    // Return existing client if available
    if (this.kuzuClients.has(clientProjectRoot)) {
      return this.kuzuClients.get(clientProjectRoot)!;
    }

    // Create and initialize new client
    const newClient = new KuzuDBClient(clientProjectRoot);
    await newClient.initialize();
    this.kuzuClients.set(clientProjectRoot, newClient);

    // Initialize repositories for this client using repository provider
    await this.repositoryProvider.initializeRepositories(clientProjectRoot, newClient);

    return newClient;
  }

  static async getInstance(): Promise<MemoryService> {
    const release = await MemoryService.lock.acquire();
    try {
      if (!MemoryService.instance) {
        MemoryService.instance = new MemoryService();
        await MemoryService.instance.initialize();
      }
      return MemoryService.instance;
    } finally {
      release();
    }
  }

  /**
   * Initialize memory bank for a repository
   * Creates metadata with stub values if it doesn't exist
   */
  async initMemoryBank(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<void> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

    const repository =
      (await repositoryRepo.findByName(repositoryName, branch)) ||
      (await repositoryRepo.create({ name: repositoryName, branch }));

    if (!repository || !repository.id) {
      throw new Error(`Repository ${repositoryName}:${branch} could not be found or created.`);
    }

    const existingMetadata = await metadataRepo.findMetadata(repositoryName, branch, 'meta');
    if (!existingMetadata) {
      const today = new Date().toISOString().split('T')[0];
      await metadataRepo.upsertMetadata({
        repository: repository.id,
        branch: branch,
        id: 'meta',
        name: repositoryName,
        content: {
          id: 'meta',
          project: { name: repositoryName, created: today },
          tech_stack: { language: 'Unknown', framework: 'Unknown', datastore: 'Unknown' },
          architecture: 'unknown',
          memory_spec_version: '3.0.0',
        },
      } as Metadata);
    }
  }

  /**
   * Get or create a repository by name
   */
  async getOrCreateRepository(
    clientProjectRoot: string,
    name: string,
    branch: string = 'main',
  ): Promise<Repository | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repository from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

    // First try to find existing repository with name and branch
    const existingRepo = await repositoryRepo.findByName(name, branch);
    if (existingRepo) {
      return existingRepo;
    }

    // Create new repository with specified branch if it doesn't exist
    try {
      return await repositoryRepo.create({
        name,
        branch,
      });
    } catch (error) {
      console.error(`Failed to create repository ${name}/${branch}:`, error);
      return null;
    }
  }

  /**
   * Get metadata for a repository
   */
  async getMetadata(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Metadata | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repository from provider
    const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

    return metadataRepo.findMetadata(repositoryName, branch, 'meta');
  }

  /**
   * Update metadata for a repository
   */
  async updateMetadata(
    clientProjectRoot: string,
    repositoryName: string,
    metadata: Partial<Metadata['content']>,
    branch: string = 'main',
  ): Promise<Metadata | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

    return metadataOps.updateMetadataOp(
      repositoryName,
      branch,
      metadata,
      repositoryRepo,
      metadataRepo,
    );
  }

  /**
   * Get today's context or create it if it doesn't exist
   */
  async getTodayContext(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Context | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);

    return contextOps.getTodayContextOp(repositoryName, branch, repositoryRepo, contextRepo);
  }

  /**
   * Update today's context
   */
  async updateTodayContext(
    clientProjectRoot: string,
    repositoryName: string,
    contextUpdate: Partial<Omit<Context, 'repository' | 'id' | 'iso_date' | 'branch'>>,
    branch: string = 'main',
  ): Promise<Context | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);

    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      console.warn(`Repository ${repositoryName}:${branch} not found in updateTodayContext.`);
      return null;
    }
    const todayIsoDate = new Date().toISOString().split('T')[0];
    const context = await contextRepo.getContextByDate(repositoryName, branch, todayIsoDate);

    if (!context) {
      console.warn(
        `No context found for ${repositoryName}:${branch} on ${todayIsoDate} to update.`,
      );
      return null;
    }

    const updatedContextObject: Context = {
      ...context,
      ...contextUpdate,
      name: contextUpdate.name || context.name,
      summary: contextUpdate.summary || context.summary,
      repository: context.repository,
      branch: context.branch,
      id: context.id,
    };

    const updated = await contextRepo.upsertContext(updatedContextObject);
    return updated ?? null;
  }

  /**
   * Get latest contexts
   */
  async getLatestContexts(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    limit?: number,
  ): Promise<Context[]> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);

    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      console.warn(`Repository ${repositoryName}:${branch} not found in getLatestContexts.`);
      return [];
    }
    return contextOps.getLatestContextsOp(
      repository.id,
      branch,
      limit,
      repositoryRepo,
      contextRepo,
    );
  }

  /**
   * Update today's context for a repository/branch (MCP tool compatibility)
   * Accepts summary, agent, decision, issue, observation. Merges with existing.
   */
  async updateContext(
    clientProjectRoot: string,
    params: {
      repository: string;
      branch?: string;
      summary?: string;
      agent?: string;
      decision?: string;
      issue?: string;
      observation?: string;
      id?: string;
    },
  ): Promise<Context | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);

    return contextOps.updateContextOp(
      { repositoryName: params.repository, ...params },
      repositoryRepo,
      contextRepo,
    );
  }

  /**
   * Create or update a rule for a repository
   */
  async upsertRule(
    clientProjectRoot: string,
    repositoryName: string,
    rule: Omit<Rule, 'repository' | 'branch' | 'id'> & { id: string },
    branch: string = 'main',
  ): Promise<Rule | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

    return ruleOps.upsertRuleOp(repositoryName, branch, rule as Rule, repositoryRepo, ruleRepo);
  }

  // Add new methods for tools, delegating to Ops
  async upsertComponent(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentData: {
      id: string;
      name: string;
      kind?: string;
      status?: ComponentStatus;
      depends_on?: string[];
    },
  ): Promise<Component | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return componentOps.upsertComponentOp(
      repositoryName,
      branch,
      {
        id: componentData.id,
        name: componentData.name,
        kind: componentData.kind,
        // Ensure status is not undefined by defaulting to 'active'
        status: componentData.status || 'active',
        depends_on: componentData.depends_on,
      } as ComponentInput, // Cast to ComponentInput with required status
      repositoryRepo,
      componentRepo,
    );
  }

  async upsertDecision(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionData: {
      id: string;
      name: string;
      date: string;
      context?: string;
    },
  ): Promise<Decision | null> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

    return decisionOps.upsertDecisionOp(
      repositoryName,
      branch,
      decisionData,
      repositoryRepo,
      decisionRepo,
    );
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON)
   */
  async getComponentDependencies(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component[]> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return componentOps.getComponentDependenciesOp(
      repositoryName,
      branch,
      componentId,
      repositoryRepo,
      componentRepo,
    );
  }

  async getActiveComponents(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Component[]> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      console.warn(`Repository ${repositoryName}:${branch} not found in getActiveComponents.`);
      return [];
    }
    return componentOps.getActiveComponentsOp(repository.id, branch, repositoryRepo, componentRepo);
  }

  async getComponentDependents(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component[]> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return componentOps.getComponentDependentsOp(
      repositoryName,
      branch,
      componentId,
      repositoryRepo,
      componentRepo,
    );
  }

  async getItemContextualHistory(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    console.error(
      `DEBUG: memory.service.ts: getItemContextualHistory received itemType = >>>${itemType}<<<`,
    );
    return graphOps.getItemContextualHistoryOp(
      repositoryName,
      branch,
      itemId,
      itemType,
      repositoryRepo,
      componentRepo,
    );
  }

  async getGoverningItemsForComponent(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.getGoverningItemsForComponentOp(
      repositoryName,
      branch,
      componentId,
      repositoryRepo,
      componentRepo,
    );
  }

  async getRelatedItems(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    params: {
      relationshipTypes?: string[];
      depth?: number;
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
    },
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.getRelatedItemsOp(
      repositoryName,
      branch,
      itemId,
      params,
      repositoryRepo,
      componentRepo,
    );
  }

  async kCoreDecomposition(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    k?: number,
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.kCoreDecompositionOp(repositoryName, branch, k, repositoryRepo, componentRepo);
  }

  async louvainCommunityDetection(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.louvainCommunityDetectionOp(
      repositoryName,
      branch,
      repositoryRepo,
      componentRepo,
    );
  }

  async pageRank(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    dampingFactor?: number,
    iterations?: number,
    tolerance?: number,
    normalizeInitial?: boolean,
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.pageRankOp(
      repositoryName,
      branch,
      dampingFactor,
      iterations,
      tolerance,
      normalizeInitial,
      repositoryRepo,
      componentRepo,
    );
  }

  async getStronglyConnectedComponents(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    maxIterations?: number,
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.stronglyConnectedComponentsOp(
      repositoryName,
      branch,
      maxIterations,
      repositoryRepo,
      componentRepo,
    );
  }

  async getWeaklyConnectedComponents(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    maxIterations?: number,
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.weaklyConnectedComponentsOp(
      repositoryName,
      branch,
      maxIterations,
      repositoryRepo,
      componentRepo,
    );
  }

  async shortestPath(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    startNodeId: string,
    endNodeId: string,
    params: {
      relationshipTypes?: string[];
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
      algorithm?: string;
      projectedGraphName?: string;
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
    },
  ): Promise<any> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    return graphOps.shortestPathOp(
      repositoryName,
      branch,
      startNodeId,
      endNodeId,
      params,
      repositoryRepo,
      componentRepo,
    );
  }

  async getDecisionsByDateRange(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    startDate: string,
    endDate: string,
  ): Promise<Decision[]> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    // Get repositories from provider
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

    return decisionOps.getDecisionsByDateRangeOp(
      repositoryName,
      branch,
      startDate,
      endDate,
      repositoryRepo,
      decisionRepo,
    );
  }

  async getActiveRules(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Rule[]> {
    // Get repositories for this client
    const { repositoryRepo, ruleRepo } = await this.getRepositoriesForClient(clientProjectRoot);

    return ruleOps.getActiveRulesOp(repositoryName, branch, repositoryRepo, ruleRepo);
  }

  /**
   * Helper method to get repositories for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @returns Object containing repository instances
   */
  private async getRepositoriesForClient(clientProjectRoot: string): Promise<{
    repositoryRepo: RepositoryRepository;
    metadataRepo: MetadataRepository;
    contextRepo: ContextRepository;
    componentRepo: ComponentRepository;
    decisionRepo: DecisionRepository;
    ruleRepo: RuleRepository;
  }> {
    if (!this.repositoryProvider) {
      throw new Error('RepositoryProvider not initialized');
    }

    // Ensure KuzuClient is initialized
    await this.getKuzuClient(clientProjectRoot);

    return {
      repositoryRepo: this.repositoryProvider.getRepositoryRepository(clientProjectRoot),
      metadataRepo: this.repositoryProvider.getMetadataRepository(clientProjectRoot),
      contextRepo: this.repositoryProvider.getContextRepository(clientProjectRoot),
      componentRepo: this.repositoryProvider.getComponentRepository(clientProjectRoot),
      decisionRepo: this.repositoryProvider.getDecisionRepository(clientProjectRoot),
      ruleRepo: this.repositoryProvider.getRuleRepository(clientProjectRoot),
    };
  }
}
