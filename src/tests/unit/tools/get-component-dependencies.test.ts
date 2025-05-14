// @ts-nocheck
/**
 * Unit test for the get-component-dependencies tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        getComponentDependencies: jest.fn().mockResolvedValue([]), // Default mock for the method
      } as any), // Using 'as any' to simplify mocking of a complex class
    },
  };
});

// Mock the operation class used by the handler
jest.mock('../../../mcp/streaming/operations/component-dependencies.operation', () => ({
  ComponentDependenciesOperation: {
    execute: jest.fn(),
  },
}));

import { ComponentDependenciesOperation } from '../../../mcp/streaming/operations/component-dependencies.operation';

const MOCK_CLIENT_PROJECT_ROOT = '/test/project/root';

describe('get-component-dependencies tool handler', () => {
  const handler = toolHandlers['get-component-dependencies'];
  let mockMemoryService: jest.Mocked<MemoryService>;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Correctly mock the singleton getInstance method and its returned Promise
    MemoryService.getInstance = jest.fn().mockResolvedValue({
      getComponentDependencies: jest.fn().mockResolvedValue([]), // Default mock for the method
    } as any); // Using 'as any' to simplify mocking of a complex class
  });

  it('should validate required parameters if clientProjectRoot is provided', async () => {
    // Missing repositoryName
    const missingRepoArgs = { branch: 'main', componentId: 'comp-001' }; // No clientProjectRoot in toolArgs here
    const result = await handler(
      missingRepoArgs,
      mockMemoryService,
      undefined,
      MOCK_CLIENT_PROJECT_ROOT,
    );
    expect(result.error).toContain('repositoryName and componentId');
    expect(ComponentDependenciesOperation.execute).not.toHaveBeenCalled();

    // Missing componentId
    const missingIdArgs = { repositoryName: 'test-repo', branch: 'main' }; // No clientProjectRoot in toolArgs here
    const result2 = await handler(
      missingIdArgs,
      mockMemoryService,
      undefined,
      MOCK_CLIENT_PROJECT_ROOT,
    );
    expect(result2.error).toContain('repositoryName and componentId');
    expect(ComponentDependenciesOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', dependencies: [{ id: 'comp-002' }] };
    ComponentDependenciesOperation.execute.mockResolvedValue(opResult);

    const args = {
      // clientProjectRoot can be in toolArgs or passed as 4th param to handler for this test
      repositoryName: 'test-repo',
      branch: 'main',
      componentId: 'comp-001',
      depth: 2,
    };

    const result = await handler(args, mockMemoryService, undefined, MOCK_CLIENT_PROJECT_ROOT);

    expect(result).toBe(opResult);
    expect(ComponentDependenciesOperation.execute).toHaveBeenCalledWith(
      MOCK_CLIENT_PROJECT_ROOT, // Expecting this to be passed now
      'test-repo',
      'main',
      'comp-001',
      2,
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch and depth when not provided', async () => {
    const opResult = { status: 'complete', dependencies: [] };
    ComponentDependenciesOperation.execute.mockResolvedValue(opResult);

    const args = {
      repositoryName: 'test-repo',
      componentId: 'comp-001',
    };

    await handler(args, mockMemoryService, undefined, MOCK_CLIENT_PROJECT_ROOT);

    expect(ComponentDependenciesOperation.execute).toHaveBeenCalledWith(
      MOCK_CLIENT_PROJECT_ROOT, // Expecting this to be passed now
      'test-repo',
      'main',
      'comp-001',
      1, // Default depth
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    ComponentDependenciesOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repositoryName: 'test-repo',
      branch: 'main',
      componentId: 'comp-001',
    };
    await expect(
      handler(args, mockMemoryService, undefined, MOCK_CLIENT_PROJECT_ROOT),
    ).rejects.toThrow('Graph error');
  });

  it('should throw if clientProjectRoot is not determinable', async () => {
    const args = { repositoryName: 'test-repo', componentId: 'comp-001' };
    // Not passing clientProjectRoot in toolArgs or as the 4th param to handler
    await expect(handler(args, mockMemoryService, undefined, undefined)).rejects.toThrow(
      'Client project root could not be determined.',
    );
  });
});
