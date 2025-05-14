// @ts-nocheck
/**
 * Unit test for the get-related-items tool handler
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
jest.mock('../../../mcp/streaming/operations/related-items.operation', () => ({
  RelatedItemsOperation: {
    execute: jest.fn(),
  },
}));

import { RelatedItemsOperation } from '../../../mcp/streaming/operations/related-items.operation';

describe('get-related-items tool handler', () => {
  const handler = toolHandlers['get-related-items'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Missing repository
    const missingRepoArgs = { branch: 'main', startItemId: 'comp-001' };
    const result = await handler(missingRepoArgs, mockMemoryService);
    expect(result.error).toContain('repository and startItemId are required');
    expect(RelatedItemsOperation.execute).not.toHaveBeenCalled();

    // Missing startItemId
    const missingIdArgs = { repository: 'test-repo', branch: 'main' };
    const result2 = await handler(missingIdArgs, mockMemoryService);
    expect(result2.error).toContain('repository and startItemId are required');
    expect(RelatedItemsOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', relatedItems: [{ id: 'comp-002' }] };
    RelatedItemsOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      startItemId: 'comp-001',
      params: { relationshipTypes: ['DEPENDS_ON'], depth: 2, direction: 'INCOMING' },
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(RelatedItemsOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      { relationshipTypes: ['DEPENDS_ON'], depth: 2, direction: 'INCOMING' },
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch and params when not provided', async () => {
    const opResult = { status: 'complete', relatedItems: [] };
    RelatedItemsOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      startItemId: 'comp-001',
    };

    await handler(args, mockMemoryService);

    expect(RelatedItemsOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      {},
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    RelatedItemsOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
      startItemId: 'comp-001',
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
