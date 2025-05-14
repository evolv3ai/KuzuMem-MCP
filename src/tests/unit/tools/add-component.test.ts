// @ts-nocheck
/**
 * Unit test for the add-component tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        upsertComponent: jest.fn(),
        // Add other methods as needed
      }),
    },
  };
});

// Sample component for testing
const sampleComponent = {
  id: 'comp-001',
  name: 'Test Component',
  kind: 'service',
  status: 'active',
  depends_on: ['comp-002'],
};

describe('add-component tool handler', () => {
  const handler = toolHandlers['add-component'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Get the mocked instance
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Test missing repository
    const missingRepoArgs = { id: 'comp-001', name: 'Test', kind: 'service' };
    await expect(handler(missingRepoArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-component (repository, id, name)',
    );
    expect(mockMemoryService.upsertComponent).not.toHaveBeenCalled();

    // Test missing id
    const missingIdArgs = { repository: 'test-repo', name: 'Test', kind: 'service' };
    await expect(handler(missingIdArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-component (repository, id, name)',
    );
    expect(mockMemoryService.upsertComponent).not.toHaveBeenCalled();

    // Test missing name
    const missingNameArgs = { repository: 'test-repo', id: 'comp-001', kind: 'service' };
    await expect(handler(missingNameArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-component (repository, id, name)',
    );
    expect(mockMemoryService.upsertComponent).not.toHaveBeenCalled();
  });

  it('should add a component with all parameters', async () => {
    mockMemoryService.upsertComponent.mockResolvedValue(sampleComponent);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'comp-001',
      name: 'Test Component',
      kind: 'service',
      status: 'active',
      depends_on: ['comp-002'],
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toEqual({
      success: true,
      message:
        "Component 'Test Component' (id: comp-001) added/updated in test-repo (branch: main)",
    });

    expect(mockMemoryService.upsertComponent).toHaveBeenCalledWith('test-repo', 'main', {
      id: 'comp-001',
      name: 'Test Component',
      kind: 'service',
      status: 'active',
      depends_on: ['comp-002'],
    });
    expect(mockMemoryService.upsertComponent).toHaveBeenCalledTimes(1);
  });

  it('should use default branch when not provided', async () => {
    mockMemoryService.upsertComponent.mockResolvedValue(sampleComponent);

    const args = {
      repository: 'test-repo',
      id: 'comp-001',
      name: 'Test Component',
      kind: 'service',
    };

    await handler(args, mockMemoryService);

    expect(mockMemoryService.upsertComponent).toHaveBeenCalledWith('test-repo', 'main', {
      id: 'comp-001',
      name: 'Test Component',
      kind: 'service',
      status: undefined,
      depends_on: [],
    });
  });

  it('should propagate errors from the memory service', async () => {
    const mockError = new Error('Database connection failed');
    mockMemoryService.upsertComponent.mockRejectedValueOnce(mockError);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'comp-001',
      name: 'Test Component',
      kind: 'service',
    };

    await expect(handler(args, mockMemoryService)).rejects.toThrow('Database connection failed');
  });

  it('should handle missing upsertComponent method in memory service', async () => {
    const badMemoryService = {};
    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'comp-001',
      name: 'Test Component',
      kind: 'service',
    };
    await expect(handler(args, badMemoryService)).rejects.toThrow(
      "Tool 'add-component' requires MemoryService.upsertComponent",
    );
  });
});
