// @ts-nocheck
/**
 * Unit test for the get-governing-items-for-component tool handler
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
jest.mock('../../../mcp/streaming/operations/governing-items-for-component.operation', () => ({
  GoverningItemsForComponentOperation: {
    execute: jest.fn(),
  },
}));

import { GoverningItemsForComponentOperation } from '../../../mcp/streaming/operations/governing-items-for-component.operation';

describe('get-governing-items-for-component tool handler', () => {
  const handler = toolHandlers['get-governing-items-for-component'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Missing repository
    const missingRepoArgs = { branch: 'main', componentId: 'comp-001' };
    const result = await handler(missingRepoArgs, mockMemoryService);
    expect(result.error).toContain('repository and componentId are required');
    expect(GoverningItemsForComponentOperation.execute).not.toHaveBeenCalled();

    // Missing componentId
    const missingIdArgs = { repository: 'test-repo', branch: 'main' };
    const result2 = await handler(missingIdArgs, mockMemoryService);
    expect(result2.error).toContain('repository and componentId are required');
    expect(GoverningItemsForComponentOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', decisions: [], rules: [], contextHistory: [] };
    GoverningItemsForComponentOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      componentId: 'comp-001',
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(GoverningItemsForComponentOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch when not provided', async () => {
    const opResult = { status: 'complete', decisions: [], rules: [], contextHistory: [] };
    GoverningItemsForComponentOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      componentId: 'comp-001',
    };

    await handler(args, mockMemoryService);

    expect(GoverningItemsForComponentOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    GoverningItemsForComponentOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
      componentId: 'comp-001',
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
