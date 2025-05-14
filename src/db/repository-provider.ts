import { KuzuDBClient } from './kuzu';
import { RepositoryFactory } from './repository-factory';
import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository,
} from '../repositories';
import * as path from 'path';

/**
 * Repository Provider class
 *
 * Maintains and provides access to repositories for specific client project roots,
 * ensuring proper initialization and validation.
 *
 * This class acts as an intermediary between services and repositories,
 * abstracting repository access and ensuring consistent initialization.
 */
export class RepositoryProvider {
  private static instance: RepositoryProvider;
  private repositoryFactory: RepositoryFactory;
  private initialized: boolean = false;

  // Cache of repositories by client project root path
  private repositoriesByClient: Map<
    string,
    {
      repositoryRepo: RepositoryRepository;
      metadataRepo: MetadataRepository;
      contextRepo: ContextRepository;
      componentRepo: ComponentRepository;
      decisionRepo: DecisionRepository;
      ruleRepo: RuleRepository;
    }
  > = new Map();

  private constructor(repositoryFactory: RepositoryFactory) {
    this.repositoryFactory = repositoryFactory;
    this.initialized = true;
  }

  /**
   * Get the singleton instance of RepositoryProvider
   * Requires an initialized RepositoryFactory
   */
  public static async getInstance(): Promise<RepositoryProvider> {
    if (!RepositoryProvider.instance) {
      const factory = await RepositoryFactory.getInstance();
      RepositoryProvider.instance = new RepositoryProvider(factory);
      console.log('RepositoryProvider: Singleton instance created');
    }
    return RepositoryProvider.instance;
  }

  /**
   * Initialize repositories for a client project root
   *
   * @param clientProjectRoot The absolute path to the client project root
   * @param kuzuClient The initialized KuzuDBClient for this project
   * @throws Error if repositories cannot be initialized
   */
  public async initializeRepositories(
    clientProjectRoot: string,
    kuzuClient: KuzuDBClient,
  ): Promise<void> {
    // Ensure path is absolute
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }

    // Skip if repositories already initialized for this client
    if (this.repositoriesByClient.has(clientProjectRoot)) {
      return;
    }

    try {
      // Initialize repositories using factory
      const repositories = this.repositoryFactory.initializeRepositories(kuzuClient);

      // Map to our internal property names
      this.repositoriesByClient.set(clientProjectRoot, {
        repositoryRepo: repositories.repositoryRepository,
        metadataRepo: repositories.metadataRepository,
        contextRepo: repositories.contextRepository,
        componentRepo: repositories.componentRepository,
        decisionRepo: repositories.decisionRepository,
        ruleRepo: repositories.ruleRepository,
      });

      console.log(`RepositoryProvider: Initialized repositories for client: ${clientProjectRoot}`);
    } catch (error) {
      console.error(
        `RepositoryProvider: Failed to initialize repositories for ${clientProjectRoot}:`,
        error,
      );
      throw new Error(
        `Failed to initialize repositories for ${clientProjectRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if repositories are initialized for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @returns True if repositories are initialized, false otherwise
   */
  public isInitialized(clientProjectRoot: string): boolean {
    // Ensure path is absolute
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }

    return this.repositoriesByClient.has(clientProjectRoot);
  }

  /**
   * Get repositories for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns Object containing all repository instances
   */
  public getRepositories(clientProjectRoot: string): {
    repositoryRepo: RepositoryRepository;
    metadataRepo: MetadataRepository;
    contextRepo: ContextRepository;
    componentRepo: ComponentRepository;
    decisionRepo: DecisionRepository;
    ruleRepo: RuleRepository;
  } {
    // Ensure path is absolute
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }

    if (!this.repositoriesByClient.has(clientProjectRoot)) {
      throw new Error(
        `Repositories not initialized for client project: ${clientProjectRoot}. Call initializeRepositories first.`,
      );
    }

    return this.repositoriesByClient.get(clientProjectRoot)!;
  }

  /**
   * Get RepositoryRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns RepositoryRepository instance
   */
  public getRepositoryRepository(clientProjectRoot: string): RepositoryRepository {
    return this.getRepositories(clientProjectRoot).repositoryRepo;
  }

  /**
   * Get MetadataRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns MetadataRepository instance
   */
  public getMetadataRepository(clientProjectRoot: string): MetadataRepository {
    return this.getRepositories(clientProjectRoot).metadataRepo;
  }

  /**
   * Get ContextRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns ContextRepository instance
   */
  public getContextRepository(clientProjectRoot: string): ContextRepository {
    return this.getRepositories(clientProjectRoot).contextRepo;
  }

  /**
   * Get ComponentRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns ComponentRepository instance
   */
  public getComponentRepository(clientProjectRoot: string): ComponentRepository {
    return this.getRepositories(clientProjectRoot).componentRepo;
  }

  /**
   * Get DecisionRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns DecisionRepository instance
   */
  public getDecisionRepository(clientProjectRoot: string): DecisionRepository {
    return this.getRepositories(clientProjectRoot).decisionRepo;
  }

  /**
   * Get RuleRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns RuleRepository instance
   */
  public getRuleRepository(clientProjectRoot: string): RuleRepository {
    return this.getRepositories(clientProjectRoot).ruleRepo;
  }

  /**
   * Clear repositories for a specific client project root
   * Useful for testing or when cleaning up resources
   *
   * @param clientProjectRoot The client project root path
   */
  public clearRepositoriesForClient(clientProjectRoot: string): void {
    // Ensure path is absolute
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }

    this.repositoriesByClient.delete(clientProjectRoot);
    console.log(`RepositoryProvider: Cleared repositories for client: ${clientProjectRoot}`);
  }

  /**
   * Clear all repository caches
   * Useful for testing or when managing memory usage
   */
  public clearAllRepositories(): void {
    this.repositoriesByClient.clear();
    this.repositoryFactory.clearCaches();
    console.log('RepositoryProvider: All repository caches cleared');
  }
}
