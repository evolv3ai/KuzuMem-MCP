import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Mutex } from '../../utils/mutex';
import { ensureAbsolutePath } from '../../utils/path.utils';
import { SnapshotService } from '../snapshot.service';
import {
  IContextService,
  IEntityService,
  IGraphAnalysisService,
  IGraphQueryService,
  IMemoryBankService,
  IMetadataService,
  IServiceContainer,
} from './service-container.interface';

/**
 * Service container implementation using lazy loading and dependency injection
 * Eliminates circular dependencies by providing services through interfaces
 */
export class ServiceContainer implements IServiceContainer {
  private static instance: ServiceContainer;
  private static lock = new Mutex();

  // Core infrastructure
  private repositoryProvider!: RepositoryProvider;
  private kuzuClients: Map<string, KuzuDBClient> = new Map();
  private snapshotServices: Map<string, SnapshotService> = new Map();

  // Lazy-loaded service instances
  private serviceInstances: Map<string, any> = new Map();
  private servicePromises: Map<string, Promise<any>> = new Map();

  private constructor() {}

  /**
   * Get singleton instance with proper initialization
   */
  static async getInstance(): Promise<ServiceContainer> {
    if (!ServiceContainer.instance) {
      const release = await ServiceContainer.lock.acquire();
      try {
        if (!ServiceContainer.instance) {
          ServiceContainer.instance = new ServiceContainer();
          await ServiceContainer.instance.initialize();
        }
      } finally {
        release();
      }
    }
    return ServiceContainer.instance;
  }

  /**
   * Initialize core infrastructure
   */
  private async initialize(): Promise<void> {
    this.repositoryProvider = await RepositoryProvider.getInstance();
  }

  /**
   * Get repository provider
   */
  getRepositoryProvider(): RepositoryProvider {
    return this.repositoryProvider;
  }

  /**
   * Get or create KuzuDB client for a project root
   */
  async getKuzuClient(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
  ): Promise<KuzuDBClient> {
    const logger = mcpContext.logger || console;
    clientProjectRoot = ensureAbsolutePath(clientProjectRoot);

    if (this.kuzuClients.has(clientProjectRoot)) {
      return this.kuzuClients.get(clientProjectRoot)!;
    }

    logger.info(
      `[ServiceContainer.getKuzuClient] Creating new KuzuDBClient for: ${clientProjectRoot}`,
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
      }

      return newClient;
    } catch (error) {
      logger.error(
        `[ServiceContainer.getKuzuClient] Failed to initialize KuzuDBClient for ${clientProjectRoot}:`,
        error,
      );
      throw new Error(
        `Failed to initialize database for project root ${clientProjectRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get SnapshotService for a project root
   */
  async getSnapshotService(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
  ): Promise<SnapshotService> {
    clientProjectRoot = ensureAbsolutePath(clientProjectRoot);

    if (!this.snapshotServices.has(clientProjectRoot)) {
      // Ensure KuzuClient exists first
      await this.getKuzuClient(mcpContext, clientProjectRoot);
    }

    return this.snapshotServices.get(clientProjectRoot)!;
  }

  /**
   * Lazy-load service with singleton pattern
   */
  private async getServiceInstance<T>(
    serviceKey: string,
    serviceFactory: () => Promise<T>,
  ): Promise<T> {
    if (this.serviceInstances.has(serviceKey)) {
      return this.serviceInstances.get(serviceKey);
    }

    // Check if service is currently being created
    if (this.servicePromises.has(serviceKey)) {
      return this.servicePromises.get(serviceKey);
    }

    // Create service promise
    const servicePromise = serviceFactory();
    this.servicePromises.set(serviceKey, servicePromise);

    try {
      const serviceInstance = await servicePromise;
      this.serviceInstances.set(serviceKey, serviceInstance);
      this.servicePromises.delete(serviceKey);
      return serviceInstance;
    } catch (error) {
      this.servicePromises.delete(serviceKey);
      throw error;
    }
  }

  /**
   * Get MemoryBankService instance (lazy-loaded)
   */
  async getMemoryBankService(): Promise<IMemoryBankService> {
    return this.getServiceInstance('memoryBank', async () => {
      const { MemoryBankService } = await import('../domain/memory-bank.service');
      return new MemoryBankService(this);
    });
  }

  /**
   * Get MetadataService instance (lazy-loaded)
   */
  async getMetadataService(): Promise<IMetadataService> {
    return this.getServiceInstance('metadata', async () => {
      const { MetadataService } = await import('../domain/metadata.service');
      return new MetadataService(this);
    });
  }

  /**
   * Get EntityService instance (lazy-loaded)
   */
  async getEntityService(): Promise<IEntityService> {
    return this.getServiceInstance('entity', async () => {
      const { EntityService } = await import('../domain/entity.service');
      return new EntityService(this);
    });
  }

  /**
   * Get ContextService instance (lazy-loaded)
   */
  async getContextService(): Promise<IContextService> {
    return this.getServiceInstance('context', async () => {
      const { ContextService } = await import('../domain/context.service');
      return new ContextService(this);
    });
  }

  /**
   * Get GraphQueryService instance (lazy-loaded)
   */
  async getGraphQueryService(): Promise<IGraphQueryService> {
    return this.getServiceInstance('graphQuery', async () => {
      const { GraphQueryService } = await import('../domain/graph-query.service');
      return new GraphQueryService(this);
    });
  }

  /**
   * Get GraphAnalysisService instance (lazy-loaded)
   */
  async getGraphAnalysisService(): Promise<IGraphAnalysisService> {
    return this.getServiceInstance('graphAnalysis', async () => {
      const { GraphAnalysisService } = await import('../domain/graph-analysis.service');
      return new GraphAnalysisService(this);
    });
  }

  /**
   * Shutdown all services and cleanup resources
   */
  async shutdown(): Promise<void> {
    // Close all KuzuDB clients
    for (const [path, client] of Array.from(this.kuzuClients.entries())) {
      try {
        await client.close();
      } catch (error) {
        console.warn(`Failed to close KuzuDB client for ${path}:`, error);
      }
    }

    this.kuzuClients.clear();
    this.snapshotServices.clear();
    this.serviceInstances.clear();
    this.servicePromises.clear();
  }
}
