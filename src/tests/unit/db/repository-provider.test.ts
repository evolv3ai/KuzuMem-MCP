import { RepositoryProvider } from '../../../db/repository-provider';
import { RepositoryFactory } from '../../../db/repository-factory';
import { KuzuDBClient } from '../../../db/kuzu';
import path from 'path';

// Mock the RepositoryFactory and KuzuDBClient
jest.mock('../../../db/repository-factory');
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

describe('RepositoryProvider', () => {
  let provider: RepositoryProvider;
  let mockFactory: jest.Mocked<RepositoryFactory>;
  let mockKuzuClient: jest.Mocked<KuzuDBClient>;

  const testClientRoot = '/test/client/root';

  // Mock repositories
  const mockRepositories = {
    repositoryRepository: { findByName: jest.fn(), create: jest.fn() },
    metadataRepository: { findMetadata: jest.fn(), upsertMetadata: jest.fn() },
    contextRepository: { getContextByDate: jest.fn(), upsertContext: jest.fn() },
    componentRepository: { find: jest.fn() },
    decisionRepository: { find: jest.fn() },
    ruleRepository: { find: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset singleton instances
    (RepositoryProvider as any).instance = undefined;
    (RepositoryFactory as any).instance = undefined;

    // Setup mock repository factory
    mockFactory = {
      getRepositoryRepository: jest.fn(),
      getMetadataRepository: jest.fn(),
      getContextRepository: jest.fn(),
      getComponentRepository: jest.fn(),
      getDecisionRepository: jest.fn(),
      getRuleRepository: jest.fn(),
      initializeRepositories: jest.fn().mockReturnValue(mockRepositories),
      clearCaches: jest.fn(),
    } as any;

    // Setup mock KuzuClient
    mockKuzuClient = new KuzuDBClient(testClientRoot) as jest.Mocked<KuzuDBClient>;
    mockKuzuClient.initialize = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(mockKuzuClient, 'dbPath', {
      get: jest.fn().mockReturnValue(path.join(testClientRoot, 'test-memory-bank.kuzu')),
    });

    // Mock RepositoryFactory.getInstance to return our mock
    (RepositoryFactory.getInstance as jest.Mock).mockResolvedValue(mockFactory);

    // Initialize provider
    provider = await RepositoryProvider.getInstance();
  });

  test('should create and maintain a singleton instance', async () => {
    const instance1 = await RepositoryProvider.getInstance();
    const instance2 = await RepositoryProvider.getInstance();

    expect(instance1).toBe(instance2);
    expect(RepositoryFactory.getInstance).toHaveBeenCalledTimes(1);
  });

  test('should initialize repositories for a client', async () => {
    await provider.initializeRepositories(testClientRoot, mockKuzuClient);

    expect(mockFactory.initializeRepositories).toHaveBeenCalledWith(mockKuzuClient);
    expect(provider.isInitialized(testClientRoot)).toBe(true);
  });

  test('should throw error if trying to get repositories before initialization', () => {
    expect(() => {
      provider.getRepositories(testClientRoot);
    }).toThrow(`Repositories not initialized for client project: ${testClientRoot}`);
  });

  test('should get all repositories for a client after initialization', async () => {
    await provider.initializeRepositories(testClientRoot, mockKuzuClient);

    const repos = provider.getRepositories(testClientRoot);

    expect(repos.repositoryRepo).toBeDefined();
    expect(repos.metadataRepo).toBeDefined();
    expect(repos.contextRepo).toBeDefined();
    expect(repos.componentRepo).toBeDefined();
    expect(repos.decisionRepo).toBeDefined();
    expect(repos.ruleRepo).toBeDefined();
  });

  test('should get specific repository types after initialization', async () => {
    await provider.initializeRepositories(testClientRoot, mockKuzuClient);

    expect(provider.getRepositoryRepository(testClientRoot)).toBe(
      mockRepositories.repositoryRepository,
    );
    expect(provider.getMetadataRepository(testClientRoot)).toBe(
      mockRepositories.metadataRepository,
    );
    expect(provider.getContextRepository(testClientRoot)).toBe(mockRepositories.contextRepository);
    expect(provider.getComponentRepository(testClientRoot)).toBe(
      mockRepositories.componentRepository,
    );
    expect(provider.getDecisionRepository(testClientRoot)).toBe(
      mockRepositories.decisionRepository,
    );
    expect(provider.getRuleRepository(testClientRoot)).toBe(mockRepositories.ruleRepository);
  });

  test('should clear repositories for a specific client', async () => {
    await provider.initializeRepositories(testClientRoot, mockKuzuClient);
    expect(provider.isInitialized(testClientRoot)).toBe(true);

    provider.clearRepositoriesForClient(testClientRoot);

    expect(provider.isInitialized(testClientRoot)).toBe(false);
    expect(() => provider.getRepositories(testClientRoot)).toThrow();
  });

  test('should clear all repositories', async () => {
    const anotherClientRoot = '/another/client/root';
    const anotherMockKuzuClient = new KuzuDBClient(anotherClientRoot) as jest.Mocked<KuzuDBClient>;

    await provider.initializeRepositories(testClientRoot, mockKuzuClient);
    await provider.initializeRepositories(anotherClientRoot, anotherMockKuzuClient);

    expect(provider.isInitialized(testClientRoot)).toBe(true);
    expect(provider.isInitialized(anotherClientRoot)).toBe(true);

    provider.clearAllRepositories();

    expect(provider.isInitialized(testClientRoot)).toBe(false);
    expect(provider.isInitialized(anotherClientRoot)).toBe(false);
    expect(mockFactory.clearCaches).toHaveBeenCalled();
  });

  test('should handle absolute and relative paths consistently', async () => {
    const relativePath = 'test/client/root';
    const absolutePath = path.resolve(relativePath);

    await provider.initializeRepositories(relativePath, mockKuzuClient);

    expect(provider.isInitialized(relativePath)).toBe(true);
    expect(provider.isInitialized(absolutePath)).toBe(true);

    const repos1 = provider.getRepositories(relativePath);
    const repos2 = provider.getRepositories(absolutePath);

    expect(repos1).toBe(repos2);
  });
});
