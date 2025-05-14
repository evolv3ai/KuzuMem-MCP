import { RepositoryFactory } from '../../../db/repository-factory';
import { KuzuDBClient } from '../../../db/kuzu';
import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository,
} from '../../../repositories';

// Mock the repositories and KuzuDBClient
jest.mock('../../../repositories/repository.repository');
jest.mock('../../../repositories/metadata.repository');
jest.mock('../../../repositories/context.repository');
jest.mock('../../../repositories/component.repository');
jest.mock('../../../repositories/decision.repository');
jest.mock('../../../repositories/rule.repository');
jest.mock('../../../db/kuzu');
jest.mock('../../../utils/mutex', () => {
  return {
    Mutex: jest.fn().mockImplementation(() => {
      return {
        acquire: jest.fn().mockResolvedValue(() => {}),
      };
    }),
  };
});

describe('RepositoryFactory', () => {
  let factory: RepositoryFactory;
  let mockKuzuClient: jest.Mocked<KuzuDBClient>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset the Singleton instance between tests
    // This is a hack to access and reset the private static instance
    (RepositoryFactory as any).instance = undefined;

    // Get the Singleton instance
    factory = await RepositoryFactory.getInstance();

    // Create a mock KuzuDBClient with a predictable dbPath
    mockKuzuClient = new KuzuDBClient('/mock/path') as jest.Mocked<KuzuDBClient>;
    Object.defineProperty(mockKuzuClient, 'dbPath', {
      get: jest.fn().mockReturnValue('/mock/path/test-memory-bank.kuzu'),
    });
  });

  test('should create and maintain a singleton instance', async () => {
    const instance1 = await RepositoryFactory.getInstance();
    const instance2 = await RepositoryFactory.getInstance();

    // Should return the same instance
    expect(instance1).toBe(instance2);
  });

  test('should create and return RepositoryRepository', () => {
    const repo1 = factory.getRepositoryRepository(mockKuzuClient);
    const repo2 = factory.getRepositoryRepository(mockKuzuClient);

    expect(RepositoryRepository).toHaveBeenCalledTimes(1);
    expect(RepositoryRepository).toHaveBeenCalledWith(mockKuzuClient);
    expect(repo1).toBe(repo2); // Should return cached instance
  });

  test('should create and return MetadataRepository', () => {
    const repo1 = factory.getMetadataRepository(mockKuzuClient);
    const repo2 = factory.getMetadataRepository(mockKuzuClient);

    expect(MetadataRepository).toHaveBeenCalledTimes(1);
    expect(MetadataRepository).toHaveBeenCalledWith(mockKuzuClient);
    expect(repo1).toBe(repo2); // Should return cached instance
  });

  test('should create and return ContextRepository', () => {
    const repo1 = factory.getContextRepository(mockKuzuClient);
    const repo2 = factory.getContextRepository(mockKuzuClient);

    expect(ContextRepository).toHaveBeenCalledTimes(1);
    expect(ContextRepository).toHaveBeenCalledWith(mockKuzuClient);
    expect(repo1).toBe(repo2); // Should return cached instance
  });

  test('should create and return ComponentRepository', () => {
    const repo1 = factory.getComponentRepository(mockKuzuClient);
    const repo2 = factory.getComponentRepository(mockKuzuClient);

    expect(ComponentRepository).toHaveBeenCalledTimes(1);
    expect(ComponentRepository).toHaveBeenCalledWith(mockKuzuClient);
    expect(repo1).toBe(repo2); // Should return cached instance
  });

  test('should create and return DecisionRepository', () => {
    const repo1 = factory.getDecisionRepository(mockKuzuClient);
    const repo2 = factory.getDecisionRepository(mockKuzuClient);

    expect(DecisionRepository).toHaveBeenCalledTimes(1);
    expect(DecisionRepository).toHaveBeenCalledWith(mockKuzuClient);
    expect(repo1).toBe(repo2); // Should return cached instance
  });

  test('should create and return RuleRepository', () => {
    const repo1 = factory.getRuleRepository(mockKuzuClient);
    const repo2 = factory.getRuleRepository(mockKuzuClient);

    expect(RuleRepository).toHaveBeenCalledTimes(1);
    expect(RuleRepository).toHaveBeenCalledWith(mockKuzuClient);
    expect(repo1).toBe(repo2); // Should return cached instance
  });

  test('should initialize all repositories at once', () => {
    const allRepos = factory.initializeRepositories(mockKuzuClient);

    // Should create one of each repository
    expect(RepositoryRepository).toHaveBeenCalledTimes(1);
    expect(MetadataRepository).toHaveBeenCalledTimes(1);
    expect(ContextRepository).toHaveBeenCalledTimes(1);
    expect(ComponentRepository).toHaveBeenCalledTimes(1);
    expect(DecisionRepository).toHaveBeenCalledTimes(1);
    expect(RuleRepository).toHaveBeenCalledTimes(1);

    // Verify all repositories are returned
    expect(allRepos.repositoryRepository).toBeDefined();
    expect(allRepos.metadataRepository).toBeDefined();
    expect(allRepos.contextRepository).toBeDefined();
    expect(allRepos.componentRepository).toBeDefined();
    expect(allRepos.decisionRepository).toBeDefined();
    expect(allRepos.ruleRepository).toBeDefined();
  });

  test('should create different repository instances for different KuzuDBClients', () => {
    // Create a second mock KuzuDBClient with a different dbPath
    const mockKuzuClient2 = new KuzuDBClient('/another/path') as jest.Mocked<KuzuDBClient>;
    Object.defineProperty(mockKuzuClient2, 'dbPath', {
      get: jest.fn().mockReturnValue('/another/path/test-memory-bank.kuzu'),
    });

    // Get repositories for both clients
    const repo1 = factory.getRepositoryRepository(mockKuzuClient);
    const repo2 = factory.getRepositoryRepository(mockKuzuClient2);

    // Should create two different repository instances
    expect(RepositoryRepository).toHaveBeenCalledTimes(2);
    expect(repo1).not.toBe(repo2);
  });

  test('should clear all repository caches', () => {
    // Create some repositories
    factory.getRepositoryRepository(mockKuzuClient);
    factory.getMetadataRepository(mockKuzuClient);
    factory.getContextRepository(mockKuzuClient);
    factory.getComponentRepository(mockKuzuClient);
    factory.getDecisionRepository(mockKuzuClient);
    factory.getRuleRepository(mockKuzuClient);

    // Clear caches
    factory.clearCaches();

    // Create repositories again
    factory.getRepositoryRepository(mockKuzuClient);
    factory.getMetadataRepository(mockKuzuClient);
    factory.getContextRepository(mockKuzuClient);
    factory.getComponentRepository(mockKuzuClient);
    factory.getDecisionRepository(mockKuzuClient);
    factory.getRuleRepository(mockKuzuClient);

    // Should create new instances after clearing cache
    expect(RepositoryRepository).toHaveBeenCalledTimes(2);
    expect(MetadataRepository).toHaveBeenCalledTimes(2);
    expect(ContextRepository).toHaveBeenCalledTimes(2);
    expect(ComponentRepository).toHaveBeenCalledTimes(2);
    expect(DecisionRepository).toHaveBeenCalledTimes(2);
    expect(RuleRepository).toHaveBeenCalledTimes(2);
  });
});
