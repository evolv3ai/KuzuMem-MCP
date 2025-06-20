import { KuzuDBClient } from '../db/kuzu';
import { RepositoryProvider } from '../db/repository-provider';
import { ToolHandlerContext } from '../mcp/types/sdk-custom';
import { Mutex } from '../utils/mutex';
import { ensureAbsolutePath } from '../utils/path.utils';
import { ServiceRegistry } from './core/service-registry.service';
import { SnapshotService } from './snapshot.service';

// Import operation modules
import { loggers } from '../utils/logger';

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
  public services: ServiceRegistry | null = null;

  // Snapshot services for each client project root
  private snapshotServices: Map<string, SnapshotService> = new Map();

  private constructor() {
    // No initialization here - will be done in initialize()
  }

  private async initialize(initialMcpContext?: ToolHandlerContext): Promise<void> {
    // Do not attempt any database initialization in the initial setup
    // This will make the MemoryService lightweight during creation
    // The real database work will be done on-demand when specific methods are called with valid clientProjectRoot
    this.repositoryProvider = await RepositoryProvider.getInstance();

    // Use logger if available, otherwise console for this early init log
    const logger = initialMcpContext?.logger || console;
    logger.info(
      'MemoryService: Initialized with RepositoryProvider - database access deferred until needed',
    );
    this.services = new ServiceRegistry(
      this.repositoryProvider,
      this.getKuzuClient.bind(this),
      this.getSnapshotService.bind(this),
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
    mcpContext: ToolHandlerContext,
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
    clientProjectRoot = ensureAbsolutePath(clientProjectRoot);
    logger.info(
      `[MemoryService.getKuzuClient] Using absolute clientProjectRoot: ${clientProjectRoot}`,
    );

    // Check repository provider
    if (!this.repositoryProvider) {
      logger.error('[MemoryService.getKuzuClient] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    // Correct Caching Logic: Reuse existing client if available
    if (this.kuzuClients.has(clientProjectRoot)) {
      logger.info(
        `[MemoryService.getKuzuClient] Reusing cached KuzuDBClient for: ${clientProjectRoot}`,
      );
      return this.kuzuClients.get(clientProjectRoot)!;
    }

    // Create new client only if it doesn't exist
    logger.info(
      `[MemoryService.getKuzuClient] No cached client found. Creating new KuzuDBClient for: ${clientProjectRoot}`,
    );

    try {
      const newClient = new KuzuDBClient(clientProjectRoot);
      await newClient.initialize(mcpContext);
      this.kuzuClients.set(clientProjectRoot, newClient);

      await this.repositoryProvider.initializeRepositories(clientProjectRoot, newClient);

      // Initialize SnapshotService for this new client
      if (!this.snapshotServices.has(clientProjectRoot)) {
        const snapshotService = new SnapshotService(newClient);
        this.snapshotServices.set(clientProjectRoot, snapshotService);
        logger.info(
          `[MemoryService.getKuzuClient] SnapshotService initialized for: ${clientProjectRoot}`,
        );
      }

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

  /**
   * Get SnapshotService for a project root
   * @param mcpContext MCP context for progress notifications and logging
   * @param clientProjectRoot Client project root directory
   * @returns SnapshotService instance
   */
  public async getSnapshotService(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
  ): Promise<SnapshotService> {
    const logger = mcpContext.logger || console;

    // Ensure absolute path
    clientProjectRoot = ensureAbsolutePath(clientProjectRoot);

    // Ensure KuzuDB client is initialized (this also initializes SnapshotService)
    await this.getKuzuClient(mcpContext, clientProjectRoot);

    // Get cached SnapshotService
    const snapshotService = this.snapshotServices.get(clientProjectRoot);
    if (!snapshotService) {
      logger.error(
        `[MemoryService.getSnapshotService] SnapshotService not found for project root: ${clientProjectRoot}`,
      );
      throw new Error(
        `SnapshotService not available for project root: ${clientProjectRoot}. This may be due to initialization failure during KuzuDB client setup.`,
      );
    }

    logger.debug(
      `[MemoryService.getSnapshotService] Retrieved SnapshotService for: ${clientProjectRoot}`,
    );
    return snapshotService;
  }

  static async getInstance(initialMcpContext?: ToolHandlerContext): Promise<MemoryService> {
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

  // This method has been moved to MemoryBankService

  // This method has been moved to MemoryBankService.

  // Metadata methods moved to MetadataService

  // Context methods moved to ContextService

  // Entity upsert methods moved to EntityService

  // Entity get methods moved to EntityService

  // Get methods moved to EntityService

  // Graph Query methods moved to GraphQueryService

  // ------------------------------------------------------------------------
  // REFINED STUB METHODS FOR FILE AND TAGGING TOOLS - WITH LOGGING
  // ------------------------------------------------------------------------

  // All file and tag methods have been moved to EntityService

  // Delete methods moved to EntityService

  // Bulk delete methods moved to EntityService

  // Entity update methods moved to EntityService

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
