import { KuzuDBClient } from './kuzu';
import { RepositoryFactory } from './repository-factory';
import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository,
  FileRepository,
  TagRepository,
} from '../repositories';
import * as path from 'path';
import { Mutex } from '../utils/mutex';

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
  private static lock = new Mutex();
  private repositoryFactory: RepositoryFactory;
  private initialized: boolean = false;

  // Maps to store repository instances per clientProjectRoot
  private repositoryRepositories: Map<string, RepositoryRepository> = new Map();
  private metadataRepositories: Map<string, MetadataRepository> = new Map();
  private contextRepositories: Map<string, ContextRepository> = new Map();
  private componentRepositories: Map<string, ComponentRepository> = new Map();
  private decisionRepositories: Map<string, DecisionRepository> = new Map();
  private ruleRepositories: Map<string, RuleRepository> = new Map();
  private fileRepositories: Map<string, FileRepository> = new Map();
  private tagRepositories: Map<string, TagRepository> = new Map();

  private constructor(repositoryFactory: RepositoryFactory) {
    this.repositoryFactory = repositoryFactory;
    this.initialized = true;
    console.log('RepositoryProvider: Instance created.');
  }

  /**
   * Get the singleton instance of RepositoryProvider
   * Requires an initialized RepositoryFactory
   */
  public static async getInstance(): Promise<RepositoryProvider> {
    const release = await RepositoryProvider.lock.acquire();
    try {
      if (!RepositoryProvider.instance) {
        const factory = await RepositoryFactory.getInstance();
        RepositoryProvider.instance = new RepositoryProvider(factory);
        console.log('RepositoryProvider: Singleton instance created');
      }
      return RepositoryProvider.instance;
    } finally {
      release();
    }
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

    if (!this.repositoryRepositories.has(clientProjectRoot)) {
      console.log(`RepositoryProvider: Initializing repositories for root: ${clientProjectRoot}`);
      const repoRepo = new RepositoryRepository(kuzuClient);
      this.repositoryRepositories.set(clientProjectRoot, repoRepo);
      this.metadataRepositories.set(
        clientProjectRoot,
        new MetadataRepository(kuzuClient, repoRepo),
      );
      this.contextRepositories.set(clientProjectRoot, new ContextRepository(kuzuClient, repoRepo));
      this.componentRepositories.set(
        clientProjectRoot,
        new ComponentRepository(kuzuClient, repoRepo),
      );
      this.decisionRepositories.set(
        clientProjectRoot,
        new DecisionRepository(kuzuClient, repoRepo),
      );
      this.ruleRepositories.set(clientProjectRoot, new RuleRepository(kuzuClient, repoRepo));
      // Initialize new repositories
      this.fileRepositories.set(clientProjectRoot, new FileRepository(kuzuClient, repoRepo));
      this.tagRepositories.set(clientProjectRoot, new TagRepository(kuzuClient, repoRepo));
      console.log(
        `RepositoryProvider: Repositories initialized and cached for root: ${clientProjectRoot}`,
      );
    } else {
      console.log(
        `RepositoryProvider: Repositories already initialized for root: ${clientProjectRoot}`,
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

    return this.repositoryRepositories.has(clientProjectRoot);
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

    if (!this.repositoryRepositories.has(clientProjectRoot)) {
      throw new Error(
        `Repositories not initialized for client project: ${clientProjectRoot}. Call initializeRepositories first.`,
      );
    }

    return {
      repositoryRepo: this.repositoryRepositories.get(clientProjectRoot)!,
      metadataRepo: this.metadataRepositories.get(clientProjectRoot)!,
      contextRepo: this.contextRepositories.get(clientProjectRoot)!,
      componentRepo: this.componentRepositories.get(clientProjectRoot)!,
      decisionRepo: this.decisionRepositories.get(clientProjectRoot)!,
      ruleRepo: this.ruleRepositories.get(clientProjectRoot)!,
    };
  }

  /**
   * Get RepositoryRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns RepositoryRepository instance
   */
  public getRepositoryRepository(clientProjectRoot: string): RepositoryRepository {
    console.log(`RepositoryProvider: Getting RepositoryRepository for ${clientProjectRoot}`);
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }
    console.log(`RepositoryProvider: Resolved path: ${clientProjectRoot}`);
    console.log(
      `RepositoryProvider: Has repository? ${this.repositoryRepositories.has(clientProjectRoot)}`,
    );
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
   * Get FileRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns FileRepository instance
   */
  public getFileRepository(clientProjectRoot: string): FileRepository {
    // Ensure path is absolute
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }

    if (!this.fileRepositories.has(clientProjectRoot)) {
      throw new Error(
        `FileRepository not initialized for client project: ${clientProjectRoot}. Call initializeRepositories first.`,
      );
    }

    return this.fileRepositories.get(clientProjectRoot)!;
  }

  /**
   * Get TagRepository for a client project root
   *
   * @param clientProjectRoot The client project root path
   * @throws Error if repositories are not initialized for this client
   * @returns TagRepository instance
   */
  public getTagRepository(clientProjectRoot: string): TagRepository {
    if (!path.isAbsolute(clientProjectRoot)) {
      clientProjectRoot = path.resolve(clientProjectRoot);
    }

    if (!this.tagRepositories.has(clientProjectRoot)) {
      throw new Error(
        `TagRepository not initialized for client project: ${clientProjectRoot}. Call initializeRepositories first.`,
      );
    }

    return this.tagRepositories.get(clientProjectRoot)!;
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

    this.repositoryRepositories.delete(clientProjectRoot);
    this.metadataRepositories.delete(clientProjectRoot);
    this.contextRepositories.delete(clientProjectRoot);
    this.componentRepositories.delete(clientProjectRoot);
    this.decisionRepositories.delete(clientProjectRoot);
    this.ruleRepositories.delete(clientProjectRoot);
    this.fileRepositories.delete(clientProjectRoot);
    this.tagRepositories.delete(clientProjectRoot);
    console.log(`RepositoryProvider: Cleared repositories for client: ${clientProjectRoot}`);
  }

  /**
   * Clear all repository caches
   * Useful for testing or when managing memory usage
   */
  public clearAllRepositories(): void {
    this.repositoryRepositories.clear();
    this.metadataRepositories.clear();
    this.contextRepositories.clear();
    this.componentRepositories.clear();
    this.decisionRepositories.clear();
    this.ruleRepositories.clear();
    this.fileRepositories.clear();
    this.tagRepositories.clear();
    console.log('RepositoryProvider: All repository caches cleared');
  }
}
