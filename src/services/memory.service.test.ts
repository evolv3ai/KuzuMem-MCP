import { MemoryService } from './memory.service';
import { Repository } from '../types';
import { RepositoryRepository } from '../repositories/repository.repository';
import { KuzuDBClient } from '../db/kuzu';

// Create a repository store to simulate a database
const repoStore: Repository[] = [];

// Mock the RepositoryRepository
jest.mock('../repositories/repository.repository', () => {
  return {
    RepositoryRepository: {
      getInstance: jest.fn().mockResolvedValue({
        // Mock find by name implementation
        findByName: jest.fn(async (name: string, branch: string = 'main') => {
          const found = repoStore.find(r => r.name === name && r.branch === branch);
          return found || null;
        }),
        // Mock create implementation
        create: jest.fn(async (repository: Partial<Repository>) => {
          const newRepo = {
            id: repoStore.length + 1,
            name: repository.name || 'default',
            branch: repository.branch || 'main',
            created_at: new Date(),
            updated_at: new Date()
          } as Repository;
          
          repoStore.push(newRepo);
          return newRepo;
        }),
        // Mock findAll implementation
        findAll: jest.fn(async (branch?: string) => {
          if (branch) {
            return repoStore.filter(r => r.branch === branch);
          }
          return [...repoStore];
        })
      })
    }
  };
});

// Mock KuzuDB so we don't need a real database connection
jest.mock('../db/kuzu', () => {
  // Create a query result that matches the expected structure
  const createQueryResult = (data: any) => {
    return {
      getAll: async () => Array.isArray(data) ? data : [data],
      get: (idx: number) => data[idx],
      length: Array.isArray(data) ? data.length : (data ? 1 : 0)
    };
  };

  return {
    KuzuDBClient: {
      getConnection: jest.fn().mockReturnValue({
        query: jest.fn(async (query: string, params?: any) => {
          // Return empty results for all queries since we mock the repositories directly
          return createQueryResult([]);
        })
      }),
      executeQuery: jest.fn(async (query: string, params?: any) => {
        return createQueryResult([]);
      })
    }
  };
});

// Also mock the other repository dependencies
jest.mock('../repositories/metadata.repository', () => ({
  MetadataRepository: { getInstance: jest.fn().mockResolvedValue({ getMetadataForRepository: jest.fn().mockResolvedValue(null), upsertMetadata: jest.fn().mockResolvedValue({ content: {} }) }) }
}));

jest.mock('../repositories/context.repository', () => ({
  ContextRepository: { getInstance: jest.fn().mockResolvedValue({}) }
}));

jest.mock('../repositories/component.repository', () => ({
  ComponentRepository: { getInstance: jest.fn().mockResolvedValue({}) }
}));

jest.mock('../repositories/decision.repository', () => ({
  DecisionRepository: { getInstance: jest.fn().mockResolvedValue({}) }
}));

jest.mock('../repositories/rule.repository', () => ({
  RuleRepository: { getInstance: jest.fn().mockResolvedValue({}) }
}));

jest.mock('../services/yaml.service', () => ({
  YamlService: { getInstance: jest.fn().mockResolvedValue({}) }
}));

describe('MemoryService KuzuDB Initialization', () => {
  let memoryService: MemoryService;
  
  beforeAll(async () => {
    // Get a fresh instance with our mocked KuzuDB
    memoryService = await MemoryService.getInstance();
  });

  it('should initialize a memory bank and create a repository node for the specified branch', async () => {
    const repoName = 'test-repo-init';
    const branch = 'feature/test-branch';
    
    // Should initialize without throwing
    await memoryService.initMemoryBank(repoName, branch);

    // Should create or find the repository
    const repo = await memoryService.getOrCreateRepository(repoName, branch);
    expect(repo).toBeTruthy();
    expect(repo?.name).toBe(repoName);
    expect(repo?.branch).toBe(branch);
    expect(repo?.id).toBeDefined();
  });

  it('should not duplicate repository nodes for the same name and branch', async () => {
    const repoName = 'test-repo-init-2';
    const branch = 'feature/test-branch';
    
    // Create repository first time
    await memoryService.initMemoryBank(repoName, branch);
    
    // Get the repository twice
    const repo1 = await memoryService.getOrCreateRepository(repoName, branch);
    const repo2 = await memoryService.getOrCreateRepository(repoName, branch);
    
    expect(repo1).toBeTruthy();
    expect(repo2).toBeTruthy();
    
    // Both should have the same ID (same object)
    if (repo1 && repo2) {
      expect(repo1.id).toBe(repo2.id);
    }
  });
});
