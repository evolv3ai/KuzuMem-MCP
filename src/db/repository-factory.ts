import { KuzuDBClient } from './kuzu';
import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository,
} from '../repositories';
import { Mutex } from '../utils/mutex';

/**
 * RepositoryFactory - Manages creation of repository instances
 *
 * This factory is responsible for:
 * 1. Creating repository instances with the correct KuzuDBClient
 * 2. Caching repositories to prevent redundant creation
 * 3. Providing a clean interface for accessing various repository types
 *
 * Implements the Singleton pattern to ensure consistent caching across the application
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private static initializationLock = new Mutex();

  // Cache maps to store repositories by database path
  private repositoryRepoCache: Map<string, RepositoryRepository> = new Map();
  private metadataRepoCache: Map<string, MetadataRepository> = new Map();
  private contextRepoCache: Map<string, ContextRepository> = new Map();
  private componentRepoCache: Map<string, ComponentRepository> = new Map();
  private decisionRepoCache: Map<string, DecisionRepository> = new Map();
  private ruleRepoCache: Map<string, RuleRepository> = new Map();

  /**
   * Private constructor to enforce Singleton pattern
   */
  private constructor() {
    console.log('RepositoryFactory: initialized');
  }

  /**
   * Get the singleton instance of RepositoryFactory
   * Creates the instance if it doesn't exist
   * Thread-safe with mutex locking
   */
  public static async getInstance(): Promise<RepositoryFactory> {
    if (!RepositoryFactory.instance) {
      const release = await RepositoryFactory.initializationLock.acquire();
      try {
        if (!RepositoryFactory.instance) {
          RepositoryFactory.instance = new RepositoryFactory();
          console.log('RepositoryFactory: Singleton instance created');
        }
      } finally {
        release();
      }
    }
    return RepositoryFactory.instance;
  }

  /**
   * Get a RepositoryRepository instance for the given KuzuDBClient
   * Uses caching to prevent redundant repository creation
   *
   * @param kuzuClient The KuzuDBClient instance
   * @returns RepositoryRepository instance
   */
  getRepositoryRepository(kuzuClient: KuzuDBClient): RepositoryRepository {
    const dbPath = kuzuClient.dbPath;
    if (!this.repositoryRepoCache.has(dbPath)) {
      console.log(`RepositoryFactory: Creating new RepositoryRepository for ${dbPath}`);
      this.repositoryRepoCache.set(dbPath, new RepositoryRepository(kuzuClient));
    }
    return this.repositoryRepoCache.get(dbPath)!;
  }

  /**
   * Get a MetadataRepository instance for the given KuzuDBClient
   * Uses caching to prevent redundant repository creation
   *
   * @param kuzuClient The KuzuDBClient instance
   * @returns MetadataRepository instance
   */
  getMetadataRepository(kuzuClient: KuzuDBClient): MetadataRepository {
    const dbPath = kuzuClient.dbPath;
    if (!this.metadataRepoCache.has(dbPath)) {
      console.log(`RepositoryFactory: Creating new MetadataRepository for ${dbPath}`);
      const repositoryRepo = this.getRepositoryRepository(kuzuClient);
      this.metadataRepoCache.set(dbPath, new MetadataRepository(kuzuClient, repositoryRepo));
    }
    return this.metadataRepoCache.get(dbPath)!;
  }

  /**
   * Get a ContextRepository instance for the given KuzuDBClient
   * Uses caching to prevent redundant repository creation
   *
   * @param kuzuClient The KuzuDBClient instance
   * @returns ContextRepository instance
   */
  getContextRepository(kuzuClient: KuzuDBClient): ContextRepository {
    const dbPath = kuzuClient.dbPath;
    if (!this.contextRepoCache.has(dbPath)) {
      console.log(`RepositoryFactory: Creating new ContextRepository for ${dbPath}`);
      const repositoryRepo = this.getRepositoryRepository(kuzuClient);
      this.contextRepoCache.set(dbPath, new ContextRepository(kuzuClient, repositoryRepo));
    }
    return this.contextRepoCache.get(dbPath)!;
  }

  /**
   * Get a ComponentRepository instance for the given KuzuDBClient
   * Uses caching to prevent redundant repository creation
   *
   * @param kuzuClient The KuzuDBClient instance
   * @returns ComponentRepository instance
   */
  getComponentRepository(kuzuClient: KuzuDBClient): ComponentRepository {
    const dbPath = kuzuClient.dbPath;
    if (!this.componentRepoCache.has(dbPath)) {
      console.log(`RepositoryFactory: Creating new ComponentRepository for ${dbPath}`);
      const repositoryRepo = this.getRepositoryRepository(kuzuClient);
      this.componentRepoCache.set(dbPath, new ComponentRepository(kuzuClient, repositoryRepo));
    }
    return this.componentRepoCache.get(dbPath)!;
  }

  /**
   * Get a DecisionRepository instance for the given KuzuDBClient
   * Uses caching to prevent redundant repository creation
   *
   * @param kuzuClient The KuzuDBClient instance
   * @returns DecisionRepository instance
   */
  getDecisionRepository(kuzuClient: KuzuDBClient): DecisionRepository {
    const dbPath = kuzuClient.dbPath;
    if (!this.decisionRepoCache.has(dbPath)) {
      console.log(`RepositoryFactory: Creating new DecisionRepository for ${dbPath}`);
      const repositoryRepo = this.getRepositoryRepository(kuzuClient);
      this.decisionRepoCache.set(dbPath, new DecisionRepository(kuzuClient, repositoryRepo));
    }
    return this.decisionRepoCache.get(dbPath)!;
  }

  /**
   * Get a RuleRepository instance for the given KuzuDBClient
   * Uses caching to prevent redundant repository creation
   *
   * @param kuzuClient The KuzuDBClient instance
   * @returns RuleRepository instance
   */
  getRuleRepository(kuzuClient: KuzuDBClient): RuleRepository {
    const dbPath = kuzuClient.dbPath;
    if (!this.ruleRepoCache.has(dbPath)) {
      console.log(`RepositoryFactory: Creating new RuleRepository for ${dbPath}`);
      const repositoryRepo = this.getRepositoryRepository(kuzuClient);
      this.ruleRepoCache.set(dbPath, new RuleRepository(kuzuClient, repositoryRepo));
    }
    return this.ruleRepoCache.get(dbPath)!;
  }

  /**
   * Initialize all repositories for a given KuzuDBClient
   * This creates and caches all repositories at once
   *
   * @param kuzuClient The KuzuDBClient instance
   * @returns Object containing all repository instances
   */
  initializeRepositories(kuzuClient: KuzuDBClient): {
    repositoryRepository: RepositoryRepository;
    metadataRepository: MetadataRepository;
    contextRepository: ContextRepository;
    componentRepository: ComponentRepository;
    decisionRepository: DecisionRepository;
    ruleRepository: RuleRepository;
  } {
    return {
      repositoryRepository: this.getRepositoryRepository(kuzuClient),
      metadataRepository: this.getMetadataRepository(kuzuClient),
      contextRepository: this.getContextRepository(kuzuClient),
      componentRepository: this.getComponentRepository(kuzuClient),
      decisionRepository: this.getDecisionRepository(kuzuClient),
      ruleRepository: this.getRuleRepository(kuzuClient),
    };
  }

  /**
   * Clear all repository caches
   * Useful for testing or when managing memory usage
   */
  clearCaches(): void {
    this.repositoryRepoCache.clear();
    this.metadataRepoCache.clear();
    this.contextRepoCache.clear();
    this.componentRepoCache.clear();
    this.decisionRepoCache.clear();
    this.ruleRepoCache.clear();
    console.log('RepositoryFactory: All repository caches cleared');
  }
}
