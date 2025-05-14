// @ts-nocheck
/**
 * Unit test for the louvain-community-detection tool handler
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
jest.mock('../../../mcp/streaming/operations/louvain-community-detection.operation', () => ({
  LouvainCommunityDetectionOperation: {
    execute: jest.fn(),
  },
}));

import { LouvainCommunityDetectionOperation } from '../../../mcp/streaming/operations/louvain-community-detection.operation';

describe('louvain-community-detection tool handler', () => {
  const handler = toolHandlers['louvain-community-detection'];
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
    expect(LouvainCommunityDetectionOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', communities: [], modularity: 0.42 };
    LouvainCommunityDetectionOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(LouvainCommunityDetectionOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch when not provided', async () => {
    const opResult = { status: 'complete', communities: [], modularity: 0.0 };
    LouvainCommunityDetectionOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
    };

    await handler(args, mockMemoryService);

    expect(LouvainCommunityDetectionOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    LouvainCommunityDetectionOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
