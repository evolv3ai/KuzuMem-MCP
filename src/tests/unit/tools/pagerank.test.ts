// @ts-nocheck
/**
 * Unit test for the pagerank tool handler
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
jest.mock('../../../mcp/streaming/operations/pagerank.operation', () => ({
  PageRankOperation: {
    execute: jest.fn(),
  },
}));

import { PageRankOperation } from '../../../mcp/streaming/operations/pagerank.operation';

describe('pagerank tool handler', () => {
  const handler = toolHandlers['pagerank'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Missing repository
    const missingRepoArgs = { branch: 'main' };
    const result = await handler(missingRepoArgs, mockMemoryService);
    expect(result.error).toContain('repository');
    expect(PageRankOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', ranks: [] };
    PageRankOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      dampingFactor: 0.85,
      // maxIterations is not provided, should be undefined
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(PageRankOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      0.85,
      undefined,
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch and params when not provided', async () => {
    const opResult = { status: 'complete', ranks: [] };
    PageRankOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
    };

    await handler(args, mockMemoryService);

    expect(PageRankOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      undefined,
      undefined,
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    PageRankOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
