import { MemoryService } from '../../../services/memory.service';
import { RepositoryProvider } from '../../../db/repository-provider';
import { KuzuDBClient } from '../../../db/kuzu';
import path from 'path';

// Mock the RepositoryProvider and KuzuDBClient
jest.mock('../../../db/repository-provider');
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

describe('MemoryService', () => {
  let memoryService: MemoryService;
  let mockRepositoryProvider: jest.Mocked<RepositoryProvider>;
  let mockKuzuClient: jest.Mocked<KuzuDBClient>;
  let mockMcpContext: any;

  const testClientRoot = '/test/client/root';

  // Mock repositories
  const mockRepositories = {
    repositoryRepo: { findByName: jest.fn(), create: jest.fn() },
    metadataRepo: { findMetadata: jest.fn(), upsertMetadata: jest.fn() },
    contextRepo: { getContextByDate: jest.fn(), upsertContext: jest.fn() },
    componentRepo: { find: jest.fn() },
    decisionRepo: { find: jest.fn() },
    ruleRepo: { find: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset singleton instances
    (MemoryService as any).instance = undefined;
    (RepositoryProvider as any).instance = undefined;

    // Setup mock MCP context
    mockMcpContext = {
      logger: console,
      session: {},
      sendProgress: jest.fn(),
      signal: new AbortController().signal,
      requestId: 'test-request-id',
      sendNotification: jest.fn(),
      sendRequest: jest.fn(),
      memoryService: null,
    };

    // Setup mock repository provider
    mockRepositoryProvider = {
      initializeRepositories: jest.fn().mockResolvedValue(undefined),
      isInitialized: jest.fn().mockReturnValue(true),
      getRepositories: jest.fn().mockReturnValue(mockRepositories),
      getRepositoryRepository: jest.fn().mockReturnValue(mockRepositories.repositoryRepo),
      getMetadataRepository: jest.fn().mockReturnValue(mockRepositories.metadataRepo),
      getContextRepository: jest.fn().mockReturnValue(mockRepositories.contextRepo),
      getComponentRepository: jest.fn().mockReturnValue(mockRepositories.componentRepo),
      getDecisionRepository: jest.fn().mockReturnValue(mockRepositories.decisionRepo),
      getRuleRepository: jest.fn().mockReturnValue(mockRepositories.ruleRepo),
      clearRepositoriesForClient: jest.fn(),
      clearAllRepositories: jest.fn(),
    } as any;

    // Setup mock KuzuClient
    mockKuzuClient = {
      initialize: jest.fn().mockResolvedValue(undefined),
      executeQuery: jest.fn(),
      close: jest.fn(),
      dbPath: path.join(testClientRoot, 'test-memory-bank.kuzu'),
    } as unknown as jest.Mocked<KuzuDBClient>;

    // Mock KuzuClient constructor
    (KuzuDBClient as unknown as jest.Mock).mockImplementation(() => mockKuzuClient);

    // Mock RepositoryProvider.getInstance to return our mock
    (RepositoryProvider.getInstance as jest.Mock).mockResolvedValue(mockRepositoryProvider);

    // Initialize service
    memoryService = await MemoryService.getInstance();
  });

  test('should create and maintain a singleton instance', async () => {
    const instance1 = await MemoryService.getInstance();
    const instance2 = await MemoryService.getInstance();

    expect(instance1).toBe(instance2);
    expect(RepositoryProvider.getInstance).toHaveBeenCalledTimes(1);
  });

  test('should get KuzuClient and initialize repositories', async () => {
    const client = await memoryService.getKuzuClient(mockMcpContext, testClientRoot);

    expect(client).toBe(mockKuzuClient);
    expect(KuzuDBClient).toHaveBeenCalledWith(testClientRoot);
    expect(mockKuzuClient.initialize).toHaveBeenCalled();
    expect(mockRepositoryProvider.initializeRepositories).toHaveBeenCalledWith(
      testClientRoot,
      mockKuzuClient,
    );
  });

  test('should reuse existing KuzuClient for same client root', async () => {
    const client1 = await memoryService.getKuzuClient(mockMcpContext, testClientRoot);
    const client2 = await memoryService.getKuzuClient(mockMcpContext, testClientRoot);

    expect(client1).toBe(client2);
    expect(KuzuDBClient).toHaveBeenCalledTimes(1);
    expect(mockRepositoryProvider.initializeRepositories).toHaveBeenCalledTimes(1);
  });

  test('should create different KuzuClients for different client roots', async () => {
    const anotherTestRoot = '/another/test/root';

    // Define the expected instances clearly for this test
    const firstExpectedClient = {
      initialize: jest.fn().mockResolvedValue(undefined),
      executeQuery: jest.fn(),
      close: jest.fn(),
      dbPath: path.join(testClientRoot, 'test-memory-bank.kuzu'), // testClientRoot is from the outer scope
    } as unknown as jest.Mocked<KuzuDBClient>;

    const secondExpectedClient = {
      initialize: jest.fn().mockResolvedValue(undefined),
      executeQuery: jest.fn(),
      close: jest.fn(),
      dbPath: path.join(anotherTestRoot, 'test-memory-bank.kuzu'),
    } as unknown as jest.Mocked<KuzuDBClient>;

    (KuzuDBClient as unknown as jest.Mock).mockClear(); // Clear calls AND previous implementations

    // Setup mock implementations for KuzuDBClient constructor
    (KuzuDBClient as unknown as jest.Mock)
      .mockImplementationOnce((root: string) => {
        // Optional: Add logging or specific checks if needed for deeper debugging
        // console.log('KuzuDBClient mock: 1st call, root:', root);
        if (root !== testClientRoot) {
          throw new Error(`KuzuDBClient 1st call: expected root ${testClientRoot}, got ${root}`);
        }
        return firstExpectedClient;
      })
      .mockImplementationOnce((root: string) => {
        // Optional: Add logging or specific checks
        // console.log('KuzuDBClient mock: 2nd call, root:', root);
        if (root !== anotherTestRoot) {
          throw new Error(`KuzuDBClient 2nd call: expected root ${anotherTestRoot}, got ${root}`);
        }
        return secondExpectedClient;
      });

    const client1 = await memoryService.getKuzuClient(mockMcpContext, testClientRoot);
    const client2 = await memoryService.getKuzuClient(mockMcpContext, anotherTestRoot);

    expect(client1).toBe(firstExpectedClient);
    expect(client2).toBe(secondExpectedClient);

    expect(KuzuDBClient).toHaveBeenCalledTimes(2);
    // Verify constructor was called with the correct arguments
    expect(KuzuDBClient).toHaveBeenCalledWith(testClientRoot, expect.anything());
    expect(KuzuDBClient).toHaveBeenCalledWith(anotherTestRoot, expect.anything());

    expect(mockRepositoryProvider.initializeRepositories).toHaveBeenCalledTimes(2);
  });

  test('should initialize memory bank for a repository', async () => {
    // Setup mocks for the test
    const testRepoName = 'test-repo';
    const testBranch = 'main';
    const testRepository = { id: 'test-repo:main', name: testRepoName, branch: testBranch };

    mockRepositories.repositoryRepo.findByName.mockResolvedValue(testRepository);
    mockRepositories.metadataRepo.findMetadata.mockResolvedValue(null);
    mockRepositories.metadataRepo.upsertMetadata.mockResolvedValue({ id: 'meta' });

    await memoryService.initMemoryBank(mockMcpContext, testClientRoot, testRepoName, testBranch);

    // Verify repository and metadata operations
    expect(mockRepositoryProvider.getRepositoryRepository).toHaveBeenCalledWith(testClientRoot);
    expect(mockRepositoryProvider.getMetadataRepository).toHaveBeenCalledWith(testClientRoot);
    expect(mockRepositories.repositoryRepo.findByName).toHaveBeenCalledWith(
      testRepoName,
      testBranch,
    );
    expect(mockRepositories.metadataRepo.findMetadata).toHaveBeenCalledWith(
      testRepoName,
      testBranch,
      'meta',
    );
    expect(mockRepositories.metadataRepo.upsertMetadata).toHaveBeenCalled();
  });

  test('should throw error if repository creation fails', async () => {
    const testRepoName = 'test-repo';
    const testBranch = 'main';

    // Mock repository not found and creation failure
    mockRepositories.repositoryRepo.findByName.mockResolvedValue(null);
    mockRepositories.repositoryRepo.create.mockResolvedValue(null);

    await expect(
      memoryService.initMemoryBank(mockMcpContext, testClientRoot, testRepoName, testBranch),
    ).rejects.toThrow(`Repository ${testRepoName}:${testBranch} could not be found or created.`);
  });
});
