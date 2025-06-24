import { ToolHandlerContext } from '../mcp/types/sdk-custom';
import { ServiceContainer } from './core/service-container';
import {
  IContextService,
  IEntityService,
  IGraphAnalysisService,
  IGraphQueryService,
  IMetadataService,
  IServiceContainer,
} from './core/service-container.interface';
import { MemoryBankService } from './domain/memory-bank.service';

// Import operation modules
import { loggers } from '../utils/logger';

/**
 * Service for memory bank operations
 * Refactored to use ServiceContainer pattern for dependency injection
 * Eliminates circular dependencies and provides clean initialization order
 */
export class MemoryService {
  private logger = loggers.memoryService();
  private static instance: MemoryService;

  // Service container for dependency injection
  private serviceContainer!: IServiceContainer;

  // Direct service instances (lazy-loaded through service container)
  private _memoryBank?: MemoryBankService;

  // Services property for backward compatibility
  public get services() {
    return {
      memoryBank: this.memoryBank,
      metadata: this.metadata,
      entity: this.entity,
      context: this.context,
      graphQuery: this.graphQuery,
      graphAnalysis: this.graphAnalysis,
    };
  }

  // Lazy-loaded service getters
  public get memoryBank(): MemoryBankService {
    if (!this._memoryBank) {
      this._memoryBank = new MemoryBankService(this.serviceContainer);
    }
    return this._memoryBank;
  }

  public get metadata(): Promise<IMetadataService> {
    return this.serviceContainer.getMetadataService();
  }

  public get entity(): Promise<IEntityService> {
    return this.serviceContainer.getEntityService();
  }

  public get context(): Promise<IContextService> {
    return this.serviceContainer.getContextService();
  }

  public get graphQuery(): Promise<IGraphQueryService> {
    return this.serviceContainer.getGraphQueryService();
  }

  public get graphAnalysis(): Promise<IGraphAnalysisService> {
    return this.serviceContainer.getGraphAnalysisService();
  }

  private constructor() {
    // No initialization here - will be done in initialize()
  }

  private async initialize(initialMcpContext?: ToolHandlerContext): Promise<void> {
    // Initialize the service container
    this.serviceContainer = await ServiceContainer.getInstance();

    // Use logger if available, otherwise console for this early init log
    const logger = initialMcpContext?.logger || console;
    logger.info(
      'MemoryService: Initialized with ServiceContainer - eliminates circular dependencies',
    );

    logger.info('MemoryService: All services configured with clean dependency injection');
  }

  /**
   * Get or create KuzuDB client for a project root
   * Delegates to service container
   */
  public async getKuzuClient(mcpContext: ToolHandlerContext, clientProjectRoot: string) {
    return this.serviceContainer.getKuzuClient(mcpContext, clientProjectRoot);
  }

  /**
   * Get SnapshotService for a project root
   * Delegates to service container
   */
  public async getSnapshotService(mcpContext: ToolHandlerContext, clientProjectRoot: string) {
    return this.serviceContainer.getSnapshotService(mcpContext, clientProjectRoot);
  }

  /**
   * Get singleton instance of MemoryService
   */
  static async getInstance(initialMcpContext?: ToolHandlerContext): Promise<MemoryService> {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
      await MemoryService.instance.initialize(initialMcpContext);
    }
    return MemoryService.instance;
  }

  /**
   * Shutdown method to close all connections and cleanup resources
   */
  async shutdown(): Promise<void> {
    const logger = console;
    logger.info('[MemoryService.shutdown] Starting shutdown process');

    try {
      // Delegate shutdown to service container
      if (this.serviceContainer) {
        await this.serviceContainer.shutdown();
      }

      // Clear service instances
      this._memoryBank = undefined;

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
