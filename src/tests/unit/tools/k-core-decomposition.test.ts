// @ts-nocheck
/**
 * Unit test for the k-core-decomposition tool handler
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
jest.mock('../../../mcp/streaming/operations/k-core-decomposition.operation', () => ({
  KCoreDecompositionOperation: {
    execute: jest.fn(),
  },
}));

import { KCoreDecompositionOperation } from '../../../mcp/streaming/operations/k-core-decomposition.operation';

describe('k-core-decomposition tool handler', () => {
  const handler = toolHandlers['k-core-decomposition'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Missing repository
    const missingRepoArgs = { branch: 'main', k: 2 };
    const result = await handler(missingRepoArgs, mockMemoryService);
    expect(result.error).toContain('repository');
    expect(KCoreDecompositionOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', decomposition: { components: [] } };
    KCoreDecompositionOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      k: 2,
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(KCoreDecompositionOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      2,
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch when not provided', async () => {
    const opResult = { status: 'complete', decomposition: { components: [] } };
    KCoreDecompositionOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      k: 1,
    };

    await handler(args, mockMemoryService);

    expect(KCoreDecompositionOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      1,
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    KCoreDecompositionOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
      k: 2,
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
