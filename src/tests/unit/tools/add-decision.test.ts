// @ts-nocheck
/**
 * Unit test for the add-decision tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        upsertDecision: jest.fn(),
        // Add other methods as needed
      }),
    },
  };
});

// Sample decision for testing
const sampleDecision = {
  id: 'dec-001',
  name: 'Test Decision',
  date: '2024-06-01',
  context: 'Initial architecture',
};

describe('add-decision tool handler', () => {
  const handler = toolHandlers['add-decision'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Get the mocked instance
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Test missing repository
    const missingRepoArgs = { id: 'dec-001', name: 'Test', date: '2024-06-01' };
    await expect(handler(missingRepoArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-decision (repository, id, name, date)',
    );
    expect(mockMemoryService.upsertDecision).not.toHaveBeenCalled();

    // Test missing id
    const missingIdArgs = { repository: 'test-repo', name: 'Test', date: '2024-06-01' };
    await expect(handler(missingIdArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-decision (repository, id, name, date)',
    );
    expect(mockMemoryService.upsertDecision).not.toHaveBeenCalled();

    // Test missing name
    const missingNameArgs = { repository: 'test-repo', id: 'dec-001', date: '2024-06-01' };
    await expect(handler(missingNameArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-decision (repository, id, name, date)',
    );
    expect(mockMemoryService.upsertDecision).not.toHaveBeenCalled();

    // Test missing date
    const missingDateArgs = { repository: 'test-repo', id: 'dec-001', name: 'Test' };
    await expect(handler(missingDateArgs, mockMemoryService)).rejects.toThrow(
      'Missing required params for add-decision (repository, id, name, date)',
    );
    expect(mockMemoryService.upsertDecision).not.toHaveBeenCalled();
  });

  it('should add a decision with all parameters', async () => {
    mockMemoryService.upsertDecision.mockResolvedValue(sampleDecision);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'dec-001',
      name: 'Test Decision',
      date: '2024-06-01',
      context: 'Initial architecture',
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toEqual({
      success: true,
      message: "Decision 'Test Decision' (id: dec-001) added/updated in test-repo (branch: main)",
    });

    expect(mockMemoryService.upsertDecision).toHaveBeenCalledWith('test-repo', 'main', {
      id: 'dec-001',
      name: 'Test Decision',
      date: '2024-06-01',
      context: 'Initial architecture',
    });
    expect(mockMemoryService.upsertDecision).toHaveBeenCalledTimes(1);
  });

  it('should use default branch when not provided', async () => {
    mockMemoryService.upsertDecision.mockResolvedValue(sampleDecision);

    const args = {
      repository: 'test-repo',
      id: 'dec-001',
      name: 'Test Decision',
      date: '2024-06-01',
    };

    await handler(args, mockMemoryService);

    expect(mockMemoryService.upsertDecision).toHaveBeenCalledWith('test-repo', 'main', {
      id: 'dec-001',
      name: 'Test Decision',
      date: '2024-06-01',
      context: undefined,
    });
  });

  it('should propagate errors from the memory service', async () => {
    const mockError = new Error('Database connection failed');
    mockMemoryService.upsertDecision.mockRejectedValueOnce(mockError);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'dec-001',
      name: 'Test Decision',
      date: '2024-06-01',
    };

    await expect(handler(args, mockMemoryService)).rejects.toThrow('Database connection failed');
  });

  it('should handle missing upsertDecision method in memory service', async () => {
    const badMemoryService = {};
    const args = {
      repository: 'test-repo',
      branch: 'main',
      id: 'dec-001',
      name: 'Test Decision',
      date: '2024-06-01',
    };
    await expect(handler(args, badMemoryService)).rejects.toThrow(
      "Tool 'add-decision' requires MemoryService.upsertDecision",
    );
  });
});
