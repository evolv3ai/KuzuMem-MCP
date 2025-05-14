// @ts-nocheck
/**
 * Unit test for the get-item-contextual-history tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({}),
    },
  };
});

// Mock the operation class used by the handler
jest.mock('../../../mcp/streaming/operations/item-contextual-history.operation', () => ({
  ItemContextualHistoryOperation: {
    execute: jest.fn(),
  },
}));

import { ItemContextualHistoryOperation } from '../../../mcp/streaming/operations/item-contextual-history.operation';

describe('get-item-contextual-history tool handler', () => {
  const handler = toolHandlers['get-item-contextual-history'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Missing repository
    const missingRepoArgs = { branch: 'main', itemId: 'comp-001', itemType: 'Component' };
    const result = await handler(missingRepoArgs, mockMemoryService);
    expect(result.error).toContain('repository, itemId, and itemType are required');
    expect(ItemContextualHistoryOperation.execute).not.toHaveBeenCalled();

    // Missing itemId
    const missingIdArgs = { repository: 'test-repo', branch: 'main', itemType: 'Component' };
    const result2 = await handler(missingIdArgs, mockMemoryService);
    expect(result2.error).toContain('repository, itemId, and itemType are required');
    expect(ItemContextualHistoryOperation.execute).not.toHaveBeenCalled();

    // Missing itemType
    const missingTypeArgs = { repository: 'test-repo', branch: 'main', itemId: 'comp-001' };
    const result3 = await handler(missingTypeArgs, mockMemoryService);
    expect(result3.error).toContain('repository, itemId, and itemType are required');
    expect(ItemContextualHistoryOperation.execute).not.toHaveBeenCalled();
  });

  it('should validate itemType', async () => {
    const args = {
      repository: 'test-repo',
      branch: 'main',
      itemId: 'comp-001',
      itemType: 'InvalidType',
    };
    const result = await handler(args, mockMemoryService);
    expect(result.error).toContain('Invalid itemType');
    expect(ItemContextualHistoryOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', contextHistory: [] };
    ItemContextualHistoryOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      itemId: 'comp-001',
      itemType: 'Component',
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(ItemContextualHistoryOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      'Component',
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch when not provided', async () => {
    const opResult = { status: 'complete', contextHistory: [] };
    ItemContextualHistoryOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      itemId: 'comp-001',
      itemType: 'Component',
    };

    await handler(args, mockMemoryService);

    expect(ItemContextualHistoryOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      'Component',
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    ItemContextualHistoryOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
      itemId: 'comp-001',
      itemType: 'Component',
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
