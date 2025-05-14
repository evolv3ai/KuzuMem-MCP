// @ts-nocheck
/**
 * Unit test for the add-rule tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        upsertRule: jest.fn(),
        // Add other methods as needed
      }),
    },
  };
});

// Sample rule for testing
const sampleRule = {
  id: 'rule-001',
  name: 'Test Rule',
  created: '2024-06-01',
  content: 'Must have 100% test coverage',
  status: 'active',
  triggers: ['commit'],
};

describe('add-rule tool handler', () => {
  const handler = toolHandlers['add-rule'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Get the mocked instance
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Test missing repository
    const missingRepoArgs = {
      id: 'rule-001',
      name: 'Test',
      created: '2024-06-01',
      content: 'Rule',
      status: 'active',
    };
    await expect(handler(missingRepoArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-rule (repository, id, name, created)',
    );
    expect(mockMemoryService.upsertRule).not.toHaveBeenCalled();

    // Test missing id
    const missingIdArgs = {
      repository: 'test-repo',
      name: 'Test',
      created: '2024-06-01',
      content: 'Rule',
      status: 'active',
    };
    await expect(handler(missingIdArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-rule (repository, id, name, created)',
    );
    expect(mockMemoryService.upsertRule).not.toHaveBeenCalled();

    // Test missing name
    const missingNameArgs = {
      repository: 'test-repo',
      id: 'rule-001',
      created: '2024-06-01',
      content: 'Rule',
      status: 'active',
    };
    await expect(handler(missingNameArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-rule (repository, id, name, created)',
    );
    expect(mockMemoryService.upsertRule).not.toHaveBeenCalled();

    // Test missing created
    const missingCreatedArgs = {
      repository: 'test-repo',
      id: 'rule-001',
      name: 'Test',
      content: 'Rule',
      status: 'active',
    };
    await expect(handler(missingCreatedArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-rule (repository, id, name, created)',
    );
    expect(mockMemoryService.upsertRule).not.toHaveBeenCalled();
  });

  it('should add a rule with all parameters', async () => {
    mockMemoryService.upsertRule.mockResolvedValue(sampleRule);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'rule-001',
      name: 'Test Rule',
      created: '2024-06-01',
      content: 'Must have 100% test coverage',
      status: 'active',
      triggers: ['commit'],
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toEqual({
      success: true,
      message: "Rule 'Test Rule' (id: rule-001) added/updated in test-repo (branch: main)",
    });

    expect(mockMemoryService.upsertRule).toHaveBeenCalledWith(
      'test-repo',
      {
        id: 'rule-001',
        name: 'Test Rule',
        created: '2024-06-01',
        content: 'Must have 100% test coverage',
        status: 'active',
        triggers: ['commit'],
      },
      'main',
    );
    expect(mockMemoryService.upsertRule).toHaveBeenCalledTimes(1);
  });

  it('should use default branch when not provided', async () => {
    mockMemoryService.upsertRule.mockResolvedValue(sampleRule);

    const args = {
      repository: 'test-repo',
      id: 'rule-001',
      name: 'Test Rule',
      created: '2024-06-01',
      content: 'Must have 100% test coverage',
      status: 'active',
    };

    await handler(args, mockMemoryService);

    expect(mockMemoryService.upsertRule).toHaveBeenCalledWith(
      'test-repo',
      {
        id: 'rule-001',
        name: 'Test Rule',
        created: '2024-06-01',
        content: 'Must have 100% test coverage',
        status: 'active',
        triggers: undefined,
      },
      'main',
    );
  });

  it('should propagate errors from the memory service', async () => {
    const mockError = new Error('Database connection failed');
    mockMemoryService.upsertRule.mockRejectedValueOnce(mockError);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'rule-001',
      name: 'Test Rule',
      created: '2024-06-01',
      content: 'Must have 100% test coverage',
      status: 'active',
    };

    await expect(handler(args, mockMemoryService)).rejects.toThrow('Database connection failed');
  });

  it('should handle missing upsertRule method in memory service', async () => {
    const badMemoryService = {};
    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'rule-001',
      name: 'Test Rule',
      created: '2024-06-01',
      content: 'Must have 100% test coverage',
      status: 'active',
    };
    await expect(handler(args, badMemoryService)).rejects.toThrow(
      "Tool 'add-rule' requires MemoryService.upsertRule",
    );
  });
});
