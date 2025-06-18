import * as path from 'path';
import { z } from 'zod';
import { KuzuDBClient } from '../db/kuzu';
import { RepositoryProvider } from '../db/repository-provider';
import * as toolSchemas from '../mcp/schemas/unified-tool-schemas';
import { EnrichedRequestHandlerExtra } from '../mcp/types/sdk-custom';
import {
  Component,
  ComponentStatus,
  Context,
  Decision,
  Metadata,
  Repository,
  Rule,
} from '../types';
import { Mutex } from '../utils/mutex';

// Import operation modules
import * as componentOps from './memory-operations/component.ops';
import * as contextOps from './memory-operations/context.ops';
import * as decisionOps from './memory-operations/decision.ops';
import * as fileOps from './memory-operations/file.ops';
import * as graphOps from './memory-operations/graph.ops';
import * as metadataOps from './memory-operations/metadata.ops';
import * as ruleOps from './memory-operations/rule.ops';
import * as tagOps from './memory-operations/tag.ops';
import { loggers } from '../utils/logger';

// Type definitions (temporary until proper types are created)
type FileRecord = any;
type Tag = any;

/**
 * Service for memory bank operations
 * Implements the singleton pattern as per best practices
 *
 * Refactored to use RepositoryProvider for repository management
 */
export class MemoryService {
  private logger = loggers.memoryService();
  private static instance: MemoryService;
  private static lock = new Mutex();

  // Multi-root support
  private kuzuClients: Map<string, KuzuDBClient> = new Map();

  // Repository provider for managing repository instances
  private repositoryProvider: RepositoryProvider | null = null;

  private constructor() {
    // No initialization here - will be done in initialize()
  }

  private async initialize(initialMcpContext?: EnrichedRequestHandlerExtra): Promise<void> {
    // Do not attempt any database initialization in the initial setup
    // This will make the MemoryService lightweight during creation
    // The real database work will be done on-demand when specific methods are called with valid clientProjectRoot
    this.repositoryProvider = await RepositoryProvider.getInstance();

    // Use logger if available, otherwise console for this early init log
    const logger = initialMcpContext?.logger || console;
    logger.info(
      'MemoryService: Initialized with RepositoryProvider - database access deferred until needed',
    );
  }

  /**
   * Get or create KuzuDB client for a project root
   * Uses singleton pattern to prevent multiple connections to the same database
   * @param mcpContext MCP context for progress notifications and logging
   * @param clientProjectRoot Client project root directory for database isolation
   * @returns Initialized KuzuDBClient instance
   */
  public async getKuzuClient(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
  ): Promise<KuzuDBClient> {
    const logger = mcpContext.logger || console; // Fallback for safety, though context should always have logger

    // Write debug information using structured logging
    logger.debug(
      { clientProjectRoot },
      'MemoryService.getKuzuClient ENTERED with clientProjectRoot',
    );

    // Validate clientProjectRoot - this is critical for correct operation
    if (!clientProjectRoot) {
      const error = new Error('clientProjectRoot is required but was undefined or empty');
      logger.error(
        '[MemoryService.getKuzuClient] CRITICAL ERROR: clientProjectRoot is missing',
        error,
      );
      throw error;
    }

    // Ensure path is absolute
    clientProjectRoot = this.ensureAbsoluteRoot(clientProjectRoot);
    logger.info(
      `[MemoryService.getKuzuClient] Using absolute clientProjectRoot: ${clientProjectRoot}`,
    );

    // Check repository provider
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getKuzuClient] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    // Return cached client if available
    if (this.kuzuClients.has(clientProjectRoot)) {
      logger.info(
        `[MemoryService.getKuzuClient] Found cached KuzuDBClient for: ${clientProjectRoot}`,
      );
      const cachedClient = this.kuzuClients.get(clientProjectRoot)!;
      return cachedClient;
    }

    // Create new client if needed
    logger.info(
      `[MemoryService.getKuzuClient] Creating new KuzuDBClient for: ${clientProjectRoot}`,
    );

    try {
      const newClient = new KuzuDBClient(clientProjectRoot); // KuzuDBClient constructor handles path joining for db file
      // Pass the mcpContext to allow for progress notifications during initialization
      await newClient.initialize(mcpContext); // This now also handles schema init
      this.kuzuClients.set(clientProjectRoot, newClient);
      await this.repositoryProvider.initializeRepositories(clientProjectRoot, newClient);
      logger.info(
        `[MemoryService.getKuzuClient] KuzuDBClient and repositories initialized for: ${clientProjectRoot}`,
      );
      return newClient;
    } catch (error) {
      logger.error(
        `[MemoryService.getKuzuClient] Failed to initialize KuzuDBClient for ${clientProjectRoot}:`,
        error,
      );
      throw new Error(
        `Failed to initialize database for project root ${clientProjectRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async getInstance(
    initialMcpContext?: EnrichedRequestHandlerExtra,
  ): Promise<MemoryService> {
    const release = await MemoryService.lock.acquire();
    try {
      if (!MemoryService.instance) {
        MemoryService.instance = new MemoryService();
        await MemoryService.instance.initialize(initialMcpContext);
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
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.InitMemoryBankOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryService.initMemoryBank] ENTERED. Repo: ${repositoryName}:${branch}, CPR: ${clientProjectRoot}`,
    );
    clientProjectRoot = this.ensureAbsoluteRoot(clientProjectRoot);
    logger.info(`[MemoryService.initMemoryBank] Absolute CPR: ${clientProjectRoot}`);

    // Send progress update for path validation
    await mcpContext.sendProgress({
      status: 'in_progress',
      message: `Validating database path for ${repositoryName}:${branch}...`,
      percent: 25,
    });

    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryService.initMemoryBank] CRITICAL: RepositoryProvider is NOT INITIALIZED before getKuzuClient call.',
      );
      return {
        success: false,
        message: 'Critical error: RepositoryProvider not initialized in MemoryService',
      };
    }
    logger.info(
      '[MemoryService.initMemoryBank] RepositoryProvider appears to be initialized. Proceeding.',
    );

    try {
      logger.debug('MemoryService.initMemoryBank ENTERING TRY BLOCK');
      logger.info(
        `[MemoryService.initMemoryBank] Attempting to call this.getKuzuClient for CPR: ${clientProjectRoot}`,
      );

      // Send progress update for database client initialization
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Creating Kuzu database client for ${repositoryName}:${branch}...`,
        percent: 45,
      });

      logger.debug('MemoryService.initMemoryBank ABOUT TO CALL getKuzuClient');
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      logger.debug(
        { kuzuClientExists: !!kuzuClient },
        'MemoryService.initMemoryBank getKuzuClient RETURNED',
      );
      logger.info(
        `[MemoryService.initMemoryBank] Successfully RETURNED from this.getKuzuClient for CPR: ${clientProjectRoot}`,
      );

      // Send progress update for repository initialization
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Initializing repository structure...`,
        percent: 60,
      });

      logger.info(`[MemoryService.initMemoryBank] Getting repository instances...`);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

      logger.info(
        `[MemoryService.initMemoryBank] Attempting to find repository ${repositoryName}:${branch}...`,
      );
      let repository = await repositoryRepo.findByName(repositoryName, branch);
      logger.info(`[MemoryService.initMemoryBank] findByName result:`, repository);

      // Send progress update for repository creation/verification
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `${repository ? 'Found' : 'Creating'} repository node for ${repositoryName}:${branch}...`,
        percent: 70,
      });

      if (!repository) {
        logger.info(`Repository ${repositoryName}:${branch} not found, creating...`);
        repository = await repositoryRepo.create({ name: repositoryName, branch });
        logger.info(`[MemoryService.initMemoryBank] create result:`, repository);
      }
      if (!repository || !repository.id) {
        logger.error(`Repository ${repositoryName}:${branch} could not be found or created.`);
        return {
          success: false,
          message: `Repository ${repositoryName}:${branch} could not be found or created.`,
        };
      }
      logger.info(`Repository node ID for ${repositoryName}:${branch} is ${repository.id}`);

      // Send progress update for metadata initialization
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Looking for existing metadata for ${repositoryName}:${branch}...`,
        percent: 80,
      });

      const existingMetadata = await metadataRepo.findMetadata(
        mcpContext,
        repositoryName,
        branch,
        'meta',
      );
      if (!existingMetadata) {
        await mcpContext.sendProgress({
          status: 'in_progress',
          message: `Creating initial metadata for ${repositoryName}:${branch}...`,
          percent: 85,
        });

        logger.info(`No existing metadata for ${repositoryName}:${branch}, creating stub...`);
        const today = new Date().toISOString().split('T')[0];
        const metadataToCreate = {
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
        } as Metadata;
        const createdMetadata = await metadataRepo.upsertMetadata(mcpContext, metadataToCreate);
        if (!createdMetadata) {
          throw new Error(`Failed to create metadata for ${repositoryName}:${branch}`);
        }
        logger.info(`Stub metadata created for ${repositoryName}:${branch}`);
      } else {
        logger.info(`Existing metadata found for ${repositoryName}:${branch}`);
      }

      // Send progress update for completion
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Finalizing memory bank initialization for ${repositoryName}:${branch}...`,
        percent: 90,
      });

      return {
        success: true,
        message: `Memory bank initialized for ${repositoryName} (branch: ${branch})`,
        path: clientProjectRoot, // Changed from dbPath to path
      };
    } catch (error: any) {
      logger.error(
        { error: error.message, stack: error.stack },
        'MemoryService.initMemoryBank CAUGHT EXCEPTION',
      );
      logger.error(`Error in initMemoryBank for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack,
      });

      // Send error progress notification
      try {
        await mcpContext.sendProgress({
          status: 'error',
          message: `Error initializing memory bank: ${error.message || 'Unknown error'}`,
          error: {
            message: error.message || 'Failed to initialize memory bank',
            details: error.stack,
          },
        });
      } catch (progressError: any) {
        logger.error(`Failed to send error progress: ${String(progressError)}`);
      }

      return { success: false, message: error.message || 'Failed to initialize memory bank' };
    }
  }

  /**
   * Get or create a repository by name
   */
  async getOrCreateRepository(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    name: string,
    branch: string = 'main',
  ): Promise<Repository | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in getOrCreateRepository');
      throw new Error('RepositoryProvider not initialized');
    }
    await this.getKuzuClient(mcpContext, clientProjectRoot); // Pass mcpContext
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const existingRepo = await repositoryRepo.findByName(name, branch);
    if (existingRepo) {
      return existingRepo;
    }
    try {
      logger.info(`Creating new repository ${name}/${branch} at root ${clientProjectRoot}`);
      return await repositoryRepo.create({ name, branch });
    } catch (error: any) {
      logger.error(`Failed to create repository ${name}/${branch}: ${error.message}`, {
        error: error.toString(),
      });
      return null;
    }
  }

  /**
   * Get metadata for a repository
   */
  async getMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.GetMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in getMetadata');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

      const metadataContent = await metadataOps.getMetadataOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
      );

      if (!metadataContent) {
        logger.warn(
          `[MemoryService.getMetadata] No metadata found for ${repositoryName}:${branch}`,
        );
        return null;
      }
      const metadataResult = {
        id: metadataContent.id,
        project: {
          name: metadataContent.content?.project?.name || repositoryName,
          created: metadataContent.content?.project?.created || new Date().toISOString(),
          description: metadataContent.content?.project?.description,
        },
        tech_stack: metadataContent.content?.tech_stack || {},
        architecture: metadataContent.content?.architecture || '',
        memory_spec_version: metadataContent.content?.memory_spec_version || '1.0',
      };
      logger.info(`[MemoryService.getMetadata] Metadata retrieved for ${repositoryName}:${branch}`);
      return metadataResult;
    } catch (error: any) {
      logger.error(`Error in getMetadata for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
      });
      return null;
    }
  }

  /**
   * Update metadata for a repository
   */
  async updateMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    metadataContentChanges: any, // Remove schema reference
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.UpdateMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in updateMetadata');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

      const updatedContent = await metadataOps.updateMetadataOp(
        mcpContext,
        repositoryName,
        branch,
        metadataContentChanges,
        repositoryRepo,
      );

      if (!updatedContent) {
        logger.warn(
          `Failed to update metadata for ${repositoryName}:${branch}. updateMetadataOp returned null.`,
        );
        return null;
      }
      logger.info(`Metadata updated successfully for ${repositoryName}:${branch}.`);
      return {
        success: true,
        message: `Metadata updated successfully`,
      };
    } catch (error: any) {
      logger.error(`Error in updateMetadata for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  }

  /**
   * Get today's context or create it if it doesn't exist
   */
  async getTodayContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Context | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getTodayContext] RepositoryProvider not initialized');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const todayIsoDate = new Date().toISOString().split('T')[0];
      const context = await contextRepo.getContextByDate(
        mcpContext,
        repositoryName,
        branch,
        todayIsoDate,
      );
      if (!context) {
        logger.info(
          `[MemoryService.getTodayContext] No context found for today for ${repositoryName}:${branch}`,
        );
        return null;
      }
      logger.info(
        `[MemoryService.getTodayContext] Retrieved today's context for ${repositoryName}:${branch}`,
      );
      return context;
    } catch (error: any) {
      logger.error(
        `[MemoryService.getTodayContext] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return null;
    }
  }

  /**
   * Update today's context
   */
  async updateTodayContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    contextUpdate: Partial<
      Omit<Context, 'repository' | 'id' | 'iso_date' | 'branch' | 'created_at' | 'updated_at'>
    > & {
      // Allow these to be passed directly for convenience, maps to Context fields
      issue?: string;
      decision?: string;
      observation?: string;
    },
    branch: string = 'main',
  ): Promise<Context | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateTodayContext] RepositoryProvider not initialized');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.updateTodayContext] Repository ${repositoryName}:${branch} not found.`,
        );
        return null;
      }
      const todayIsoDate = new Date().toISOString().split('T')[0];
      let currentContextInternal = await contextRepo.getContextByDate(
        mcpContext,
        repositoryName,
        branch,
        todayIsoDate,
      );
      const effectiveName =
        contextUpdate.name ||
        contextUpdate.summary ||
        currentContextInternal?.name ||
        `context-${todayIsoDate}`;

      if (!currentContextInternal) {
        logger.info(
          `[MemoryService.updateTodayContext] No context for today, creating new one for ${repositoryName}:${branch}`,
        );
        const contextToCreate: Context = {
          repository: repository.id,
          branch: branch,
          id: `context-${todayIsoDate}`,
          name: effectiveName,
          iso_date: todayIsoDate,
          summary: contextUpdate.summary || '',
          agent: contextUpdate.agent,
          related_issue: contextUpdate.issue,
          decisions: contextUpdate.decision ? [contextUpdate.decision] : [],
          observations: contextUpdate.observation ? [contextUpdate.observation] : [],
          created_at: new Date(),
          updated_at: new Date(),
        } as Context;
        currentContextInternal = await contextRepo.upsertContext(mcpContext, contextToCreate);
      } else {
        logger.info(
          `[MemoryService.updateTodayContext] Updating existing context for today for ${repositoryName}:${branch}`,
        );
        const updatedData: Context = {
          ...currentContextInternal,
          name: effectiveName,
          summary:
            contextUpdate.summary !== undefined
              ? contextUpdate.summary
              : currentContextInternal.summary,
          agent:
            contextUpdate.agent !== undefined ? contextUpdate.agent : currentContextInternal.agent,
          related_issue:
            contextUpdate.issue !== undefined
              ? contextUpdate.issue
              : currentContextInternal.related_issue,
          decisions:
            contextUpdate.decision && currentContextInternal.decisions
              ? Array.from(new Set([...currentContextInternal.decisions, contextUpdate.decision]))
              : contextUpdate.decision
                ? [contextUpdate.decision]
                : currentContextInternal.decisions || [],
          observations:
            contextUpdate.observation && currentContextInternal.observations
              ? Array.from(
                  new Set([...currentContextInternal.observations, contextUpdate.observation]),
                )
              : contextUpdate.observation
                ? [contextUpdate.observation]
                : currentContextInternal.observations || [],
          updated_at: new Date(),
        };
        currentContextInternal = await contextRepo.upsertContext(mcpContext, updatedData);
      }
      if (!currentContextInternal) {
        logger.error(
          `[MemoryService.updateTodayContext] Failed to upsert context for ${repositoryName}:${branch}`,
        );
        return null;
      }
      logger.info(
        `[MemoryService.updateTodayContext] Context for today updated/created for ${repositoryName}:${branch}`,
      );
      return currentContextInternal;
    } catch (error: any) {
      logger.error(
        `[MemoryService.updateTodayContext] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return null;
    }
  }

  /**
   * Get latest contexts
   */
  async getLatestContexts(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    limit?: number,
  ): Promise<Context[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getLatestContexts] RepositoryProvider not initialized');
      return [];
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.getLatestContexts] Repository ${repositoryName}:${branch} not found.`,
        );
        return [];
      }
      const contexts = await contextOps.getLatestContextsOp(
        mcpContext,
        repositoryName,
        branch,
        limit || 10, // Provide default value
        repositoryRepo,
        contextRepo,
      );
      logger.info(
        `[MemoryService.getLatestContexts] Retrieved ${contexts.length} latest contexts for ${repositoryName}:${branch}`,
      );
      return contexts;
    } catch (error: any) {
      logger.error(
        `[MemoryService.getLatestContexts] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  /**
   * Update today's context for a repository/branch (MCP tool compatibility)
   * Accepts summary, agent, decision, issue, observation. Merges with existing.
   */
  async updateContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.ContextInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.ContextUpdateOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateContext] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);

      const updatedCtxNode = await contextOps.updateContextOp(
        mcpContext,
        params.repository,
        params.branch,
        params,
        repositoryRepo,
        contextRepo,
      );

      if (!updatedCtxNode) {
        logger.warn(
          `[MemoryService.updateContext] Failed to update context for ${params.repository}:${params.branch}. Ops function returned null.`,
        );
        return { success: false, message: 'Context not found or not updated', context: undefined };
      }
      logger.info(
        `[MemoryService.updateContext] Context updated successfully for ${params.repository}:${params.branch}`,
      );
      return {
        success: true,
        message: 'Context updated successfully',
        context: updatedCtxNode as any,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.updateContext] Error for ${params.repository}:${params.branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  /**
   * Create or update a rule for a repository
   */
  async upsertRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    rule: Omit<Rule, 'repository' | 'branch' | 'id'> & { id: string },
    branch: string = 'main',
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.upsertRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

    // Ensure content is not null for RuleInput
    const ruleForOps = {
      ...rule,
      content: rule.content === null ? undefined : rule.content,
      triggers: rule.triggers === null ? undefined : rule.triggers,
    };

    return ruleOps.upsertRuleOp(
      mcpContext,
      repositoryName,
      branch,
      ruleForOps as any,
      repositoryRepo,
      ruleRepo,
    ) as Promise<Rule | null>;
  }

  // Add new methods for tools, delegating to Ops
  async upsertComponent(
    mcpContext: EnrichedRequestHandlerExtra,
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
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.upsertComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    // Construct the data object expected by componentOps.upsertComponentOp
    const componentOpData = {
      ...componentData,
      repository: repositoryName,
      branch: branch,
    };

    return componentOps.upsertComponentOp(
      mcpContext,
      repositoryName,
      branch,
      componentOpData,
      repositoryRepo,
      componentRepo,
    ) as Promise<Component | null>;
  }

  async upsertDecision(
    mcpContext: EnrichedRequestHandlerExtra,
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
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.upsertDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

    // Construct the data object expected by decisionOps.upsertDecisionOp
    const decisionOpData = {
      ...decisionData,
      repository: repositoryName,
      branch: branch,
    };

    return decisionOps.upsertDecisionOp(
      mcpContext,
      repositoryName,
      branch,
      decisionOpData as any,
      repositoryRepo,
      decisionRepo,
    ) as Promise<Decision | null>;
  }

  // Get methods for individual entities
  async getComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const component = await componentRepo.findByIdAndBranch(repositoryName, componentId, branch);
      return component;
    } catch (error: any) {
      logger.error(`[MemoryService.getComponent] Error getting component ${componentId}:`, error);
      throw error;
    }
  }

  async getDecision(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);
      const decision = await decisionRepo.findByIdAndBranch(repositoryName, decisionId, branch);
      return decision;
    } catch (error: any) {
      logger.error(`[MemoryService.getDecision] Error getting decision ${decisionId}:`, error);
      throw error;
    }
  }

  async getRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);
      const rule = await ruleRepo.findByIdAndBranch(repositoryName, ruleId, branch);
      return rule;
    } catch (error: any) {
      logger.error(`[MemoryService.getRule] Error getting rule ${ruleId}:`, error);
      throw error;
    }
  }

  async getFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<FileRecord | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository node ID
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(`[MemoryService.getFile] Repository ${repositoryName}:${branch} not found.`);
        return null;
      }

      const file = await fileRepo.findFileById(repository.id, branch, fileId);
      return file as FileRecord | null;
    } catch (error: any) {
      logger.error(`[MemoryService.getFile] Error getting file ${fileId}:`, error);
      throw error;
    }
  }

  async getTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<Tag | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);
      const tag = await tagRepo.findTagById(tagId);
      return tag;
    } catch (error: any) {
      logger.error(`[MemoryService.getTag] Error getting tag ${tagId}:`, error);
      throw error;
    }
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON)
   */
  async getComponentDependencies(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<{ componentId: string; dependencies: Component[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getComponentDependencies] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const dependencies = await componentOps.getComponentDependenciesOp(
        mcpContext,
        repositoryName,
        branch,
        componentId,
        repositoryRepo,
        componentRepo,
      );

      logger.info(
        `[MemoryService.getComponentDependencies] Retrieved ${dependencies.length} dependencies for ${componentId} in ${repositoryName}:${branch}`,
      );
      return {
        componentId,
        dependencies: dependencies,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getComponentDependencies] Error for ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getActiveComponents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Component[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getActiveComponents] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(
        `[MemoryService.getActiveComponents] Repository ${repositoryName}:${branch} not found.`,
      );
      return [];
    }
    return componentOps.getActiveComponentsOp(
      mcpContext,
      repository.id,
      branch,
      repositoryRepo,
      componentRepo,
    ) as Promise<Component[]>;
  }

  async getComponentDependents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<{ componentId: string; dependents: Component[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getComponentDependents] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const dependents = await componentOps.getComponentDependentsOp(
        mcpContext,
        repositoryName,
        branch,
        componentId,
        repositoryRepo,
        componentRepo,
      );

      logger.info(
        `[MemoryService.getComponentDependents] Retrieved ${dependents.length} dependents for ${componentId} in ${repositoryName}:${branch}`,
      );
      return {
        componentId,
        dependents: dependents,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getComponentDependents] Error for ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getItemContextualHistory(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<{ itemId: string; itemType: string; contextHistory: any[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getItemContextualHistory] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot,
        repository: repositoryName,
        branch,
        itemId,
        itemType,
      };

      const result = await graphOps.getItemContextualHistoryOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        `[MemoryService.getItemContextualHistory] Retrieved history for ${itemType} ${itemId} in ${repositoryName}:${branch}`,
      );
      return {
        itemId,
        itemType,
        contextHistory: result || [],
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getItemContextualHistory] Error for ${itemType} ${itemId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getGoverningItemsForComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<{ componentId: string; rules: any[]; decisions: any[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryService.getGoverningItemsForComponent] RepositoryProvider not initialized',
      );
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot,
        repository: repositoryName,
        branch,
        componentId,
      };

      const result = await graphOps.getGoverningItemsForComponentOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        `[MemoryService.getGoverningItemsForComponent] Retrieved governing items for ${componentId} in ${repositoryName}:${branch}`,
      );
      return {
        componentId,
        rules: result.rules || [],
        decisions: result.decisions || [],
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getGoverningItemsForComponent] Error for ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getRelatedItems(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    opParams: {
      projectedGraphName?: string;
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
      depth?: number;
      relationshipFilter?: string;
      targetNodeTypeFilter?: string;
    },
  ): Promise<{ startItemId: string; relatedItems: any[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getRelatedItems] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot,
        repository: repositoryName,
        branch,
        startItemId: itemId,
        ...opParams,
      };

      const result = await graphOps.getRelatedItemsOp(mcpContext, kuzuClient, graphOpsParams);

      logger.info(
        `[MemoryService.getRelatedItems] Retrieved related items for ${itemId} in ${repositoryName}:${branch}`,
      );
      return {
        startItemId: itemId,
        relatedItems: result.relatedItems || [],
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getRelatedItems] Error for ${itemId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // --- ALGORITHM METHODS (Corrected calls to NEW ops signatures) ---

  async kCoreDecomposition(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.KCoreOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.kCoreDecomposition] RepositoryProvider not initialized');
      return {
        type: 'k-core' as const, // Fix type literal
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.kCoreDecomposition] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
        k: params.k || 2, // Provide default value
      };

      logger.debug(
        '[MemoryService.kCoreDecomposition] Calling graphOps.kCoreDecompositionOp with params:',
        {
          graphOpsParams,
        },
      );

      const algorithmResults = await graphOps.kCoreDecompositionOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info('[MemoryService.kCoreDecomposition] Algorithm completed successfully');
      return {
        type: 'k-core' as const, // Fix type literal
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        nodes: algorithmResults.components.map((c) => ({ id: c.nodeId, coreNumber: c.coreness })),
        message: 'K-Core decomposition completed successfully',
      };
    } catch (error: any) {
      logger.error('[MemoryService.kCoreDecomposition] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'k-core' as const, // Fix type literal
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: error.message || 'K-Core failed in MemoryService',
      };
    }
  }

  async louvainCommunityDetection(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.LouvainOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.louvainCommunityDetection] RepositoryProvider not initialized');
      return {
        type: 'louvain' as const,
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.louvainCommunityDetection] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
      };

      const algorithmResults = await graphOps.louvainCommunityDetectionOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info('[MemoryService.louvainCommunityDetection] Algorithm completed successfully');
      return {
        type: 'louvain' as const,
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        nodes: algorithmResults.communities.map((c) => ({
          id: c.nodeId,
          communityId: c.communityId,
        })),
        message: 'Louvain community detection completed successfully',
      };
    } catch (error: any) {
      logger.error('[MemoryService.louvainCommunityDetection] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'louvain' as const,
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: error.message || 'Louvain failed in MemoryService',
      };
    }
  }

  async pageRank(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.PageRankOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.pageRank] RepositoryProvider not initialized');
      return {
        type: 'pagerank',
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
        dampingFactor: params.damping,
        maxIterations: params.maxIterations,
      };

      logger.debug('[MemoryService.pageRank] Calling graphOps.pageRankOp with params:', {
        graphOpsParams,
      });

      const algorithmResults = await graphOps.pageRankOp(mcpContext, kuzuClient, graphOpsParams);

      logger.info('[MemoryService.pageRank] Algorithm completed successfully');
      return {
        type: 'pagerank',
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        nodes: algorithmResults.ranks.map((r) => ({ id: r.nodeId, pagerank: r.score })),
        message: 'PageRank algorithm completed successfully',
      };
    } catch (error: any) {
      logger.error('[MemoryService.pageRank] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'pagerank',
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: error.message || 'Failed to compute PageRank',
      };
    }
  }

  async getStronglyConnectedComponents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.DetectInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.DetectOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryService.getStronglyConnectedComponents] RepositoryProvider not initialized',
      );
      return {
        type: 'strongly-connected' as const, // Fix type literal
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.getStronglyConnectedComponents] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
      };

      const algorithmResults = await graphOps.stronglyConnectedComponentsOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        '[MemoryService.getStronglyConnectedComponents] Algorithm completed successfully',
      );
      return {
        type: 'strongly-connected' as const, // Fix type literal
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        components: this.groupComponentsByComponentId(algorithmResults.components),
        totalComponents: algorithmResults.components.length,
        message: 'Strongly Connected Components found successfully',
      };
    } catch (error: any) {
      logger.error('[MemoryService.getStronglyConnectedComponents] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'strongly-connected' as const, // Fix type literal
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: error.message || 'SCC failed in MemoryService',
      };
    }
  }

  async getWeaklyConnectedComponents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.DetectInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.DetectOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryService.getWeaklyConnectedComponents] RepositoryProvider not initialized',
      );
      return {
        type: 'weakly-connected' as const, // Fix type literal
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[MemoryService.getWeaklyConnectedComponents] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
      };

      const algorithmResults = await graphOps.weaklyConnectedComponentsOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info('[MemoryService.getWeaklyConnectedComponents] Algorithm completed successfully');
      return {
        type: 'weakly-connected' as const, // Fix type literal
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        components: this.groupComponentsByComponentId(algorithmResults.components),
        totalComponents: algorithmResults.components.length,
        message: 'Weakly Connected Components found successfully',
      };
    } catch (error: any) {
      logger.error('[MemoryService.getWeaklyConnectedComponents] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'weakly-connected' as const, // Fix type literal
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: error.message || 'WCC failed in MemoryService',
      };
    }
  }

  async shortestPath(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.ShortestPathOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.shortestPath] RepositoryProvider not initialized');
      return {
        type: 'shortest-path',
        status: 'error',
        pathFound: false,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
        startNodeId: params.startNodeId || '',
        endNodeId: params.endNodeId || '',
      };

      logger.debug('[MemoryService.shortestPath] Calling graphOps.shortestPathOp with params:', {
        graphOpsParams,
      });

      const algorithmResults = await graphOps.shortestPathOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info('[MemoryService.shortestPath] Algorithm completed successfully');
      return {
        type: 'shortest-path',
        status: 'complete',
        pathFound: algorithmResults.pathFound,
        path: algorithmResults.path,
        pathLength: algorithmResults.pathLength,
        message: algorithmResults.pathFound ? 'Shortest path found.' : 'Shortest path not found.',
      };
    } catch (error: any) {
      logger.error('[MemoryService.shortestPath] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'shortest-path',
        status: 'error',
        pathFound: false,
        message: error.message || 'Failed to compute shortest path',
      };
    }
  }

  async getDecisionsByDateRange(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    startDate: string,
    endDate: string,
  ): Promise<Decision[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getDecisionsByDateRange] RepositoryProvider not initialized');
      return [];
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

      // Get all decisions and filter by date range
      const allDecisions = await decisionOps.getActiveDecisionsOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        decisionRepo,
      );

      // Filter by date range
      const decisions = allDecisions.filter((d) => {
        if (!d.date) {
          return false;
        }
        const decisionDate = new Date(d.date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return decisionDate >= start && decisionDate <= end;
      });

      logger.info(
        `[MemoryService.getDecisionsByDateRange] Retrieved ${decisions.length} decisions for ${repositoryName}:${branch}`,
      );
      return decisions.map((d: Decision) => ({ ...d, repository: repositoryName, branch }));
    } catch (error: any) {
      logger.error(
        `[MemoryService.getDecisionsByDateRange] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  async getActiveRules(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Rule[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getActiveRules] RepositoryProvider not initialized');
      return [];
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

      const rules = await ruleOps.getActiveRulesOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        ruleRepo,
      );

      logger.info(
        `[MemoryService.getActiveRules] Retrieved ${rules.length} active rules for ${repositoryName}:${branch}`,
      );
      return rules.map((r) => ({ ...r, repository: repositoryName, branch }));
    } catch (error: any) {
      logger.error(
        `[MemoryService.getActiveRules] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  // ------------------------------------------------------------------------
  // REFINED STUB METHODS FOR GRAPH INTROSPECTION TOOLS - WITH LOGGING
  // ------------------------------------------------------------------------

  async countNodesByLabel(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.CountOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.countNodesByLabel] RepositoryProvider not initialized');
      return { label, count: 0, message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repoId = `${repositoryName}:${branch}`;

      const query = `
        MATCH (n:${label})
        WHERE n.repository = $repoId AND n.branch = $branch
        RETURN COUNT(n) AS count
      `;

      const result = await kuzuClient.executeQuery(query, { repoId, branch });
      const count = result[0]?.count || 0;

      logger.info(
        `[MemoryService.countNodesByLabel] Counted ${count} nodes with label ${label} in ${repositoryName}:${branch}`,
      );
      return { label, count: Number(count), message: `Found ${count} ${label} nodes` };
    } catch (error: any) {
      logger.error(
        `[MemoryService.countNodesByLabel] Error counting ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return { label, count: 0, message: error.message || 'Failed to count nodes' };
    }
  }

  async listNodesByLabel(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<z.infer<typeof toolSchemas.EntitiesQueryOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.listNodesByLabel] RepositoryProvider not initialized');
      return {
        type: 'entities',
        label,
        entities: [],
        limit,
        offset,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repoId = `${repositoryName}:${branch}`;

      const query = `
        MATCH (n:${label})
        WHERE n.repository = $repoId AND n.branch = $branch
        RETURN n
        ORDER BY n.name, n.id
        SKIP $offset
        LIMIT $limit
      `;

      const results = await kuzuClient.executeQuery(query, { repoId, branch, limit, offset });
      const entities = results.map((row: any) => {
        const node = row.n.properties || row.n;
        return { ...node, repository: repositoryName, branch };
      });

      logger.info(
        `[MemoryService.listNodesByLabel] Retrieved ${entities.length} ${label} nodes in ${repositoryName}:${branch}`,
      );
      return {
        type: 'entities',
        label,
        entities,
        limit,
        offset,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.listNodesByLabel] Error listing ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return {
        type: 'entities',
        label,
        entities: [],
        limit,
        offset,
      };
    }
  }

  async getNodeProperties(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.PropertiesOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getNodeProperties] RepositoryProvider not initialized');
      return { label, properties: [] };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repoId = `${repositoryName}:${branch}`;

      // Get a sample node to inspect properties
      const sampleQuery = `
        MATCH (n:${label})
        WHERE n.repository = $repoId AND n.branch = $branch
        RETURN n
        LIMIT 1
      `;

      const sampleResults = await kuzuClient.executeQuery(sampleQuery, { repoId, branch });
      if (sampleResults.length === 0) {
        return { label, properties: [] };
      }

      const sampleNode = sampleResults[0].n.properties || sampleResults[0].n;
      const properties = Object.keys(sampleNode).map((key) => ({
        name: key,
        type: typeof sampleNode[key],
      }));

      logger.info(
        `[MemoryService.getNodeProperties] Retrieved ${properties.length} properties for ${label} in ${repositoryName}:${branch}`,
      );
      return { label, properties };
    } catch (error: any) {
      logger.error(
        `[MemoryService.getNodeProperties] Error getting properties for ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return { label, properties: [] };
    }
  }

  async listAllIndexes(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label?: string,
  ): Promise<z.infer<typeof toolSchemas.IndexesOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.listAllIndexes] RepositoryProvider not initialized');
      return { indexes: [] };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Note: Kuzu doesn't have a direct way to list indexes via Cypher
      // This is a placeholder that returns empty array
      logger.info(
        `[MemoryService.listAllIndexes] Index introspection not fully implemented for Kuzu`,
      );
      return {
        indexes: [],
      };
    } catch (error: any) {
      logger.error(`[MemoryService.listAllIndexes] Error listing indexes: ${error.message}`, {
        error: error.toString(),
      });
      return { indexes: [] };
    }
  }

  // ------------------------------------------------------------------------
  // REFINED STUB METHODS FOR FILE AND TAGGING TOOLS - WITH LOGGING
  // ------------------------------------------------------------------------

  async addFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileData: any, // Remove schema reference
  ): Promise<z.infer<typeof toolSchemas.EntityCreateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.addFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);

    const fileOpData = {
      ...fileData,
      repository: repositoryName,
      branch: branch,
    };

    const createdFile = await fileOps.addFileOp(
      mcpContext,
      repositoryName,
      branch,
      fileOpData,
      repositoryRepo,
      fileRepo,
    );

    if (!createdFile || !createdFile.success || !createdFile.file) {
      logger.warn(`[MemoryService.addFile] Failed to add file ${fileData.id}`);
      return {
        success: false,
        message: createdFile?.message || 'Failed to add file',
        entity: {},
      };
    }

    logger.info(`[MemoryService.addFile] File ${createdFile.file.id} added successfully`);
    return {
      success: true,
      message: 'File added successfully',
      entity: createdFile.file,
    };
  }

  async associateFileWithComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    fileId: string,
  ): Promise<z.infer<typeof toolSchemas.AssociateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.associateFileWithComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);

    const success = await fileOps.associateFileWithComponentOp(
      mcpContext,
      repositoryName,
      branch,
      componentId,
      fileId,
      repositoryRepo,
      fileRepo,
    );

    if (!success || !success.success) {
      logger.warn(
        `[MemoryService.associateFileWithComponent] Failed to associate ${fileId} with ${componentId}`,
      );
      return {
        type: 'file-component',
        success: false,
        message: success?.message || 'Failed to associate file with component',
        association: {
          from: fileId,
          to: componentId,
          relationship: 'IMPLEMENTS',
        },
      };
    }

    logger.info(
      `[MemoryService.associateFileWithComponent] Associated ${fileId} with ${componentId}`,
    );
    return {
      type: 'file-component',
      success: true,
      message: 'File associated with component successfully',
      association: {
        from: fileId,
        to: componentId,
        relationship: 'IMPLEMENTS',
      },
    };
  }

  async addTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagData: any, // Remove schema reference
  ): Promise<z.infer<typeof toolSchemas.EntityCreateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.addTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

    const tagOpData = {
      ...tagData,
      repository: repositoryName,
      branch: branch,
    };

    const createdTag = await tagOps.addTagOp(
      mcpContext,
      repositoryName,
      branch,
      tagOpData,
      repositoryRepo,
      tagRepo,
    );

    if (!createdTag || !createdTag.success || !createdTag.tag) {
      logger.warn(`[MemoryService.addTag] Failed to add tag ${tagData.id}`);
      return {
        success: false,
        message: createdTag?.message || 'Failed to add tag',
        entity: {},
      };
    }

    logger.info(`[MemoryService.addTag] Tag ${createdTag.tag.id} added successfully`);
    return {
      success: true,
      message: 'Tag added successfully',
      entity: createdTag.tag,
    };
  }

  async tagItem(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context',
    tagId: string,
  ): Promise<z.infer<typeof toolSchemas.AssociateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.tagItem] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

    const success = await tagOps.tagItemOp(
      mcpContext,
      repositoryName,
      branch,
      itemId,
      itemType,
      tagId,
      repositoryRepo,
      tagRepo,
    );

    if (!success || !success.success) {
      logger.warn(`[MemoryService.tagItem] Failed to tag ${itemType} ${itemId} with ${tagId}`);
      return {
        type: 'tag-item',
        success: false,
        message: success?.message || 'Failed to tag item',
        association: {
          from: tagId,
          to: itemId,
          relationship: 'TAGS',
        },
      };
    }

    logger.info(`[MemoryService.tagItem] Tagged ${itemType} ${itemId} with ${tagId}`);
    return {
      type: 'tag-item',
      success: true,
      message: `${itemType} tagged successfully`,
      association: {
        from: tagId,
        to: itemId,
        relationship: 'TAGS',
      },
    };
  }

  async findItemsByTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    itemTypeFilter?: string,
  ): Promise<z.infer<typeof toolSchemas.TagsQueryOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.findItemsByTag] RepositoryProvider not initialized');
      return { type: 'tags', tagId, items: [] };
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

    const items = await tagOps.findItemsByTagOp(
      mcpContext,
      repositoryName,
      branch,
      tagId,
      repositoryRepo,
      tagRepo,
      itemTypeFilter as any,
    );

    logger.info(
      `[MemoryService.findItemsByTag] Found ${items.items?.length || 0} items with tag ${tagId}`,
    );
    return { type: 'tags', tagId, items: items.items || [] };
  }

  async listAllNodeLabels(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
  ): Promise<z.infer<typeof toolSchemas.LabelsOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.listAllNodeLabels] RepositoryProvider not initialized');
      return { labels: [], status: 'error', message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Get node table names from Kuzu
      const result = await kuzuClient.executeQuery('CALL show_tables() RETURN *');
      const labels = result.filter((row: any) => row.type === 'NODE').map((row: any) => row.name);

      logger.info(`[MemoryService.listAllNodeLabels] Found ${labels.length} node labels`);
      return {
        labels,
        status: 'complete',
        message: `Found ${labels.length} node labels`,
      };
    } catch (error: any) {
      logger.error(`[MemoryService.listAllNodeLabels] Error: ${error.message}`, {
        error: error.toString(),
      });
      return {
        labels: [],
        status: 'error',
        message: error.message || 'Failed to list node labels',
      };
    }
  }

  private ensureAbsoluteRoot(clientProjectRoot: string): string {
    if (!path.isAbsolute(clientProjectRoot)) {
      return path.resolve(clientProjectRoot);
    }
    return clientProjectRoot;
  }

  // Delete methods for entities
  async deleteComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.deleteComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository to ensure it exists
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.deleteComponent] Repository ${repositoryName}:${branch} not found.`,
        );
        return false;
      }

      // Format the graph unique ID
      const graphUniqueId = `${repositoryName}:${branch}:${componentId}`;

      // Delete all relationships and the component node
      const deleteQuery = `
        MATCH (c:Component {graph_unique_id: $graphUniqueId})
        OPTIONAL MATCH (c)-[r]-()
        DELETE r, c
        RETURN count(c) as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
      const deletedCount = result[0]?.deletedCount || 0;

      logger.info(
        `[MemoryService.deleteComponent] Deleted ${deletedCount} component(s) with ID ${componentId}`,
      );
      return deletedCount > 0;
    } catch (error: any) {
      logger.error(
        `[MemoryService.deleteComponent] Error deleting component ${componentId}:`,
        error,
      );
      throw error;
    }
  }

  async deleteDecision(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.deleteDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository to ensure it exists
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.deleteDecision] Repository ${repositoryName}:${branch} not found.`,
        );
        return false;
      }

      // Format the graph unique ID
      const graphUniqueId = `${repositoryName}:${branch}:${decisionId}`;

      // Delete all relationships and the decision node
      const deleteQuery = `
        MATCH (d:Decision {graph_unique_id: $graphUniqueId})
        OPTIONAL MATCH (d)-[r]-()
        DELETE r, d
        RETURN count(d) as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
      const deletedCount = result[0]?.deletedCount || 0;

      logger.info(
        `[MemoryService.deleteDecision] Deleted ${deletedCount} decision(s) with ID ${decisionId}`,
      );
      return deletedCount > 0;
    } catch (error: any) {
      logger.error(`[MemoryService.deleteDecision] Error deleting decision ${decisionId}:`, error);
      throw error;
    }
  }

  async deleteRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.deleteRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository to ensure it exists
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(`[MemoryService.deleteRule] Repository ${repositoryName}:${branch} not found.`);
        return false;
      }

      // Format the graph unique ID
      const graphUniqueId = `${repositoryName}:${branch}:${ruleId}`;

      // Delete all relationships and the rule node
      const deleteQuery = `
        MATCH (r:Rule {graph_unique_id: $graphUniqueId})
        OPTIONAL MATCH (r)-[rel]-()
        DELETE rel, r
        RETURN count(r) as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
      const deletedCount = result[0]?.deletedCount || 0;

      logger.info(`[MemoryService.deleteRule] Deleted ${deletedCount} rule(s) with ID ${ruleId}`);
      return deletedCount > 0;
    } catch (error: any) {
      logger.error(`[MemoryService.deleteRule] Error deleting rule ${ruleId}:`, error);
      throw error;
    }
  }

  async deleteFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.deleteFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository to ensure it exists
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(`[MemoryService.deleteFile] Repository ${repositoryName}:${branch} not found.`);
        return false;
      }

      // Format the graph unique ID
      const graphUniqueId = `${repositoryName}:${branch}:${fileId}`;

      // Delete all relationships and the file node
      const deleteQuery = `
        MATCH (f:File {graph_unique_id: $graphUniqueId})
        OPTIONAL MATCH (f)-[r]-()
        DELETE r, f
        RETURN count(f) as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
      const deletedCount = result[0]?.deletedCount || 0;

      logger.info(`[MemoryService.deleteFile] Deleted ${deletedCount} file(s) with ID ${fileId}`);
      return deletedCount > 0;
    } catch (error: any) {
      logger.error(`[MemoryService.deleteFile] Error deleting file ${fileId}:`, error);
      throw error;
    }
  }

  async deleteTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.deleteTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Tags are global and not scoped to repository/branch, so we just need the ID
      // Delete all relationships and the tag node
      const deleteQuery = `
        MATCH (t:Tag {id: $tagId})
        OPTIONAL MATCH (t)-[r]-()
        DELETE r, t
        RETURN count(t) as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { tagId });
      const deletedCount = result[0]?.deletedCount || 0;

      logger.info(`[MemoryService.deleteTag] Deleted ${deletedCount} tag(s) with ID ${tagId}`);
      return deletedCount > 0;
    } catch (error: any) {
      logger.error(`[MemoryService.deleteTag] Error deleting tag ${tagId}:`, error);
      throw error;
    }
  }

  async deleteContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    contextId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.deleteContext] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository to ensure it exists
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.deleteContext] Repository ${repositoryName}:${branch} not found.`,
        );
        return false;
      }

      // Format the graph unique ID
      const graphUniqueId = `${repositoryName}:${branch}:${contextId}`;

      // Delete all relationships and the context node
      const deleteQuery = `
        MATCH (c:Context {graph_unique_id: $graphUniqueId})
        OPTIONAL MATCH (c)-[r]-()
        DELETE r, c
        RETURN count(c) as deletedCount
      `;

      const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
      const deletedCount = result[0]?.deletedCount || 0;

      logger.info(
        `[MemoryService.deleteContext] Deleted ${deletedCount} context(s) with ID ${contextId}`,
      );
      return deletedCount > 0;
    } catch (error: any) {
      logger.error(`[MemoryService.deleteContext] Error deleting context ${contextId}:`, error);
      throw error;
    }
  }

  // Bulk delete methods
  async bulkDeleteByType(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityType: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context' | 'all',
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.bulkDeleteByType] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository to ensure it exists
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[MemoryService.bulkDeleteByType] Repository ${repositoryName}:${branch} not found.`,
        );
        return {
          count: 0,
          entities: [],
          warnings: [`Repository ${repositoryName}:${branch} not found`],
        };
      }

      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Define entity types to process
      const entityTypes =
        entityType === 'all'
          ? ['Component', 'Decision', 'Rule', 'File', 'Context']
          : [entityType.charAt(0).toUpperCase() + entityType.slice(1)];

      // Special handling for tags (they're not scoped to repository/branch)
      if (entityType === 'tag' || entityType === 'all') {
        if (options.dryRun) {
          // For dry run, get tag details
          const tagQuery = `MATCH (t:Tag) RETURN t.id as id, t.name as name`;
          const tagResults = await kuzuClient.executeQuery(tagQuery, {});

          for (const row of tagResults) {
            deletedEntities.push({ type: 'tag', id: row.id, name: row.name });
            totalCount++;
          }
        } else {
          // For actual deletion, use bulk delete
          const tagDeleteQuery = `
            MATCH (t:Tag)
            OPTIONAL MATCH (t)-[r]-()
            DELETE r, t
            RETURN count(t) as deletedCount
          `;

          const tagDeleteResult = await kuzuClient.executeQuery(tagDeleteQuery, {});
          const deletedCount = tagDeleteResult[0]?.deletedCount || 0;
          totalCount += deletedCount;

          // For actual deletion, we can't get individual tag details after deletion
          for (let i = 0; i < deletedCount; i++) {
            deletedEntities.push({ type: 'tag', id: `tag-${i}`, name: 'Deleted Tag' });
          }
        }
      }

      // Process repository-scoped entities
      for (const type of entityTypes) {
        if (type === 'Tag') {
          continue;
        } // Already handled above

        if (options.dryRun) {
          // For dry run, get entity details
          const query = `MATCH (n:${type} {repository: $repositoryName, branch: $branch}) RETURN n.id as id, n.name as name`;
          const results = await kuzuClient.executeQuery(query, { repositoryName, branch });

          for (const row of results) {
            deletedEntities.push({ type: type.toLowerCase(), id: row.id, name: row.name });
            totalCount++;
          }
        } else {
          // For actual deletion, use bulk delete
          const deleteQuery = `
            MATCH (n:${type} {repository: $repositoryName, branch: $branch})
            OPTIONAL MATCH (n)-[r]-()
            DELETE r, n
            RETURN count(n) as deletedCount
          `;

          const deleteResult = await kuzuClient.executeQuery(deleteQuery, {
            repositoryName,
            branch,
          });
          const deletedCount = deleteResult[0]?.deletedCount || 0;
          totalCount += deletedCount;

          // For actual deletion, we can't get individual entity details after deletion
          // So we'll just record the count
          for (let i = 0; i < deletedCount; i++) {
            deletedEntities.push({
              type: type.toLowerCase(),
              id: `${type.toLowerCase()}-${i}`,
              name: `Deleted ${type}`,
            });
          }
        }
      }

      logger.info(
        `[MemoryService.bulkDeleteByType] ${options.dryRun ? 'Would delete' : 'Deleted'} ${totalCount} ${entityType} entities in ${repositoryName}:${branch}`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(`[MemoryService.bulkDeleteByType] Error bulk deleting ${entityType}:`, error);
      throw error;
    }
  }

  async bulkDeleteByTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.bulkDeleteByTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Find all entities tagged with the specified tag
      const findQuery = `
        MATCH (t:Tag {id: $tagId})-[:TAGGED_WITH]-(n)
        WHERE n.repository = $repositoryName AND n.branch = $branch
        RETURN labels(n) as nodeLabels, n.id as id, n.name as name
      `;

      const findResults = await kuzuClient.executeQuery(findQuery, {
        tagId,
        repositoryName,
        branch,
      });

      if (options.dryRun) {
        for (const row of findResults) {
          const nodeLabels = row.nodeLabels || [];
          const entityType =
            nodeLabels
              .find((label: string) =>
                ['Component', 'Decision', 'Rule', 'File', 'Context'].includes(label),
              )
              ?.toLowerCase() || 'unknown';

          deletedEntities.push({ type: entityType, id: row.id, name: row.name });
          totalCount++;
        }
      } else {
        // Delete entities found with the tag
        for (const row of findResults) {
          const nodeLabels = row.nodeLabels || [];
          const entityType = nodeLabels.find((label: string) =>
            ['Component', 'Decision', 'Rule', 'File', 'Context'].includes(label),
          );

          if (entityType) {
            const deleteQuery = `
              MATCH (n:${entityType} {id: $entityId, repository: $repositoryName, branch: $branch})
              OPTIONAL MATCH (n)-[r]-()
              DELETE r, n
              RETURN count(n) as deletedCount
            `;

            const deleteResult = await kuzuClient.executeQuery(deleteQuery, {
              entityId: row.id,
              repositoryName,
              branch,
            });

            const deletedCount = deleteResult[0]?.deletedCount || 0;
            if (deletedCount > 0) {
              deletedEntities.push({
                type: entityType.toLowerCase(),
                id: row.id,
                name: row.name,
              });
              totalCount += deletedCount;
            }
          }
        }
      }

      logger.info(
        `[MemoryService.bulkDeleteByTag] ${options.dryRun ? 'Would delete' : 'Deleted'} ${totalCount} entities tagged with ${tagId} in ${repositoryName}:${branch}`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(`[MemoryService.bulkDeleteByTag] Error bulk deleting by tag ${tagId}:`, error);
      throw error;
    }
  }

  async bulkDeleteByBranch(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    targetBranch: string,
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.bulkDeleteByBranch] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Entity types that are scoped to repository/branch
      const entityTypes = ['Component', 'Decision', 'Rule', 'File', 'Context'];

      for (const entityType of entityTypes) {
        if (options.dryRun) {
          // For dry run, get entity details
          const query = `MATCH (n:${entityType} {repository: $repositoryName, branch: $targetBranch}) RETURN n.id as id, n.name as name`;
          const results = await kuzuClient.executeQuery(query, { repositoryName, targetBranch });

          for (const row of results) {
            deletedEntities.push({ type: entityType.toLowerCase(), id: row.id, name: row.name });
            totalCount++;
          }
        } else {
          // For actual deletion, use bulk delete
          const deleteQuery = `
            MATCH (n:${entityType} {repository: $repositoryName, branch: $targetBranch})
            OPTIONAL MATCH (n)-[r]-()
            DELETE r, n
            RETURN count(n) as deletedCount
          `;

          const deleteResult = await kuzuClient.executeQuery(deleteQuery, {
            repositoryName,
            targetBranch,
          });
          const deletedCount = deleteResult[0]?.deletedCount || 0;
          totalCount += deletedCount;

          // For actual deletion, we can't get individual entity details after deletion
          for (let i = 0; i < deletedCount; i++) {
            deletedEntities.push({
              type: entityType.toLowerCase(),
              id: `${entityType.toLowerCase()}-${i}`,
              name: `Deleted ${entityType}`,
            });
          }
        }
      }

      // Also delete the repository record for this branch if not dry run
      if (!options.dryRun) {
        const repoDeleteQuery = `
          MATCH (r:Repository {name: $repositoryName, branch: $targetBranch})
          DELETE r
          RETURN count(r) as deletedCount
        `;

        const repoResult = await kuzuClient.executeQuery(repoDeleteQuery, {
          repositoryName,
          targetBranch,
        });
        const repoDeletedCount = repoResult[0]?.deletedCount || 0;
        if (repoDeletedCount > 0) {
          deletedEntities.push({
            type: 'repository',
            id: `${repositoryName}:${targetBranch}`,
            name: repositoryName,
          });
          totalCount += repoDeletedCount;
        }
      }

      logger.info(
        `[MemoryService.bulkDeleteByBranch] ${options.dryRun ? 'Would delete' : 'Deleted'} ${totalCount} entities from branch ${targetBranch} in repository ${repositoryName}`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.bulkDeleteByBranch] Error bulk deleting branch ${targetBranch}:`,
        error,
      );
      throw error;
    }
  }

  async bulkDeleteByRepository(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.bulkDeleteByRepository] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Entity types that are scoped to repository
      const entityTypes = ['Component', 'Decision', 'Rule', 'File', 'Context'];

      for (const entityType of entityTypes) {
        if (options.dryRun) {
          // For dry run, get entity details
          const query = `MATCH (n:${entityType} {repository: $repositoryName}) RETURN n.id as id, n.name as name, n.branch as branch`;
          const results = await kuzuClient.executeQuery(query, { repositoryName });

          for (const row of results) {
            deletedEntities.push({
              type: entityType.toLowerCase(),
              id: row.id,
              name: row.name ? `${row.name} (${row.branch})` : `${row.id} (${row.branch})`,
            });
            totalCount++;
          }
        } else {
          // For actual deletion, use bulk delete
          const deleteQuery = `
            MATCH (n:${entityType} {repository: $repositoryName})
            OPTIONAL MATCH (n)-[r]-()
            DELETE r, n
            RETURN count(n) as deletedCount
          `;

          const deleteResult = await kuzuClient.executeQuery(deleteQuery, { repositoryName });
          const deletedCount = deleteResult[0]?.deletedCount || 0;
          totalCount += deletedCount;

          // For actual deletion, we can't get individual entity details after deletion
          for (let i = 0; i < deletedCount; i++) {
            deletedEntities.push({
              type: entityType.toLowerCase(),
              id: `${entityType.toLowerCase()}-${i}`,
              name: `Deleted ${entityType}`,
            });
          }
        }
      }

      // Delete all repository records for this repository (all branches)
      if (!options.dryRun) {
        const repoDeleteQuery = `
          MATCH (r:Repository {name: $repositoryName})
          DELETE r
          RETURN count(r) as deletedCount, collect(r.branch) as branches
        `;

        const repoResult = await kuzuClient.executeQuery(repoDeleteQuery, { repositoryName });
        const repoDeletedCount = repoResult[0]?.deletedCount || 0;
        const branches = repoResult[0]?.branches || [];

        if (repoDeletedCount > 0) {
          for (const branch of branches) {
            deletedEntities.push({
              type: 'repository',
              id: `${repositoryName}:${branch}`,
              name: `${repositoryName} (${branch})`,
            });
          }
          totalCount += repoDeletedCount;
        }
      }

      logger.info(
        `[MemoryService.bulkDeleteByRepository] ${options.dryRun ? 'Would delete' : 'Deleted'} ${totalCount} entities from repository ${repositoryName} (all branches)`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryService.bulkDeleteByRepository] Error bulk deleting repository ${repositoryName}:`,
        error,
      );
      throw error;
    }
  }

  // Update methods for entities (distinct from upsert - only update existing)
  async updateComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    updates: Partial<Omit<Component, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      // First check if component exists
      const existing = await this.getComponent(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        componentId,
      );
      if (!existing) {
        logger.warn(`[MemoryService.updateComponent] Component ${componentId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        id: componentId,
        name: existing.name,
        kind:
          updates.kind !== undefined
            ? updates.kind === null
              ? undefined
              : updates.kind
            : existing.kind === null
              ? undefined
              : existing.kind,
        depends_on:
          updates.depends_on !== undefined
            ? updates.depends_on === null
              ? undefined
              : updates.depends_on
            : existing.depends_on === null
              ? undefined
              : existing.depends_on,
        status:
          updates.status !== undefined
            ? updates.status === null
              ? undefined
              : updates.status
            : existing.status === null
              ? undefined
              : existing.status,
      };

      return await this.upsertComponent(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData,
      );
    } catch (error: any) {
      logger.error(
        `[MemoryService.updateComponent] Error updating component ${componentId}:`,
        error,
      );
      throw error;
    }
  }

  async updateDecision(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
    updates: Partial<Omit<Decision, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      // First check if decision exists
      const existing = await this.getDecision(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        decisionId,
      );
      if (!existing) {
        logger.warn(`[MemoryService.updateDecision] Decision ${decisionId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        ...existing,
        ...updates,
        // Convert null to undefined
        context: updates.context === null ? undefined : updates.context,
      };

      // Use upsert method to update
      return await this.upsertDecision(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData,
      );
    } catch (error: any) {
      logger.error(`[MemoryService.updateDecision] Error updating decision ${decisionId}:`, error);
      throw error;
    }
  }

  async updateRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
    updates: Partial<Omit<Rule, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      // First check if rule exists
      const existing = await this.getRule(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        ruleId,
      );
      if (!existing) {
        logger.warn(`[MemoryService.updateRule] Rule ${ruleId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        ...existing,
        ...updates,
        // Convert null to undefined
        content: updates.content === null ? undefined : updates.content,
        triggers: updates.triggers === null ? undefined : updates.triggers,
      };

      // Use upsert method to update
      return await this.upsertRule(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        updatedData,
        branch,
      );
    } catch (error: any) {
      logger.error(`[MemoryService.updateRule] Error updating rule ${ruleId}:`, error);
      throw error;
    }
  }

  async updateFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
    updates: Partial<Omit<FileRecord, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<FileRecord | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const existing = await this.getFile(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        fileId,
      );
      if (!existing) {
        logger.warn(`[MemoryService.updateFile] File ${fileId} not found`);
        return null;
      }

      // For now, we'll just use addFile to update since it acts as upsert
      const updatedData = {
        ...existing,
        ...updates,
      };

      const result = await this.addFile(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData,
      );

      // Return the file entity from the result
      if (result.success && result.entity) {
        return result.entity as FileRecord;
      }

      return null;
    } catch (error: any) {
      logger.error(`[MemoryService.updateFile] Error updating file ${fileId}:`, error);
      throw error;
    }
  }

  async updateTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    updates: Partial<Omit<Tag, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Tag | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.updateTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const existing = await this.getTag(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        tagId,
      );
      if (!existing) {
        logger.warn(`[MemoryService.updateTag] Tag ${tagId} not found`);
        return null;
      }

      // For now, we'll just use addTag to update since it acts as upsert
      const updatedData = {
        ...existing,
        ...updates,
        // Convert null to undefined
        description: updates.description === null ? undefined : updates.description,
      };

      const result = await this.addTag(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData as any,
      );

      // Return the tag entity from the result
      if (result.success && result.entity) {
        return result.entity as Tag;
      }

      return null;
    } catch (error: any) {
      logger.error(`[MemoryService.updateTag] Error updating tag ${tagId}:`, error);
      throw error;
    }
  }

  /**
   * Shutdown method to close all KuzuDB connections
   */
  async shutdown(): Promise<void> {
    const logger = console;
    logger.info('[MemoryService.shutdown] Starting shutdown process');

    try {
      // Close all KuzuDB clients
      for (const [clientProjectRoot, client] of this.kuzuClients.entries()) {
        try {
          await client.close();
          logger.info(`[MemoryService.shutdown] Closed KuzuDB client for ${clientProjectRoot}`);
        } catch (error: any) {
          logger.error(
            `[MemoryService.shutdown] Error closing KuzuDB client for ${clientProjectRoot}:`,
            error,
          );
        }
      }

      // Clear the clients map
      this.kuzuClients.clear();

      // Reset repository provider
      this.repositoryProvider = null;

      logger.info('[MemoryService.shutdown] Shutdown completed successfully');
    } catch (error: any) {
      logger.error('[MemoryService.shutdown] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Groups algorithm results by componentId to create proper node arrays
   */
  private groupComponentsByComponentId(
    components: Array<{ nodeId: string; componentId: number }>,
  ): Array<{ componentId: number; nodes: string[] }> {
    const grouped = new Map<number, string[]>();

    for (const component of components) {
      if (!grouped.has(component.componentId)) {
        grouped.set(component.componentId, []);
      }
      grouped.get(component.componentId)!.push(component.nodeId);
    }

    return Array.from(grouped.entries()).map(([componentId, nodes]) => ({
      componentId,
      nodes,
    }));
  }
}

// -----------------------------------------------------------------------------
// Ensure that any accidental console.log calls inside runtime paths emit to
// stderr instead of stdout so that the MCP JSON channel remains clean.
// We do it once here because MemoryService is loaded by all runtime servers
// very early on.
// -----------------------------------------------------------------------------
/* eslint-disable no-global-assign */
console.log = (...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.error(...args);
};
/* eslint-enable no-global-assign */
