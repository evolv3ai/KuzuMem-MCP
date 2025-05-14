// @ts-nocheck
/**
 * Unit test for the shortest-path tool handler
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
jest.mock('../../../mcp/streaming/operations/shortest-path.operation', () => ({
  ShortestPathOperation: {
    execute: jest.fn(),
  },
}));

import { ShortestPathOperation } from '../../../mcp/streaming/operations/shortest-path.operation';

describe('shortest-path tool handler', () => {
  const handler = toolHandlers['shortest-path'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Missing repository
    const missingRepoArgs = { branch: 'main', startNodeId: 'comp-001', endNodeId: 'comp-002' };
    const result = await handler(missingRepoArgs, mockMemoryService);
    expect(result.error).toContain('repository, startNodeId, and endNodeId are required');
    expect(ShortestPathOperation.execute).not.toHaveBeenCalled();

    // Missing startNodeId
    const missingStartArgs = { repository: 'test-repo', branch: 'main', endNodeId: 'comp-002' };
    const result2 = await handler(missingStartArgs, mockMemoryService);
    expect(result2.error).toContain('repository, startNodeId, and endNodeId are required');
    expect(ShortestPathOperation.execute).not.toHaveBeenCalled();

    // Missing endNodeId
    const missingEndArgs = { repository: 'test-repo', branch: 'main', startNodeId: 'comp-001' };
    const result3 = await handler(missingEndArgs, mockMemoryService);
    expect(result3.error).toContain('repository, startNodeId, and endNodeId are required');
    expect(ShortestPathOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = {
      status: 'complete',
      path: [{ id: 'comp-001' }, { id: 'comp-002' }],
      pathFound: true,
    };
    ShortestPathOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      startNodeId: 'comp-001',
      endNodeId: 'comp-002',
      relationshipTypes: ['DEPENDS_ON'],
      direction: 'OUTGOING',
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(ShortestPathOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      'comp-002',
      { relationshipTypes: ['DEPENDS_ON'], direction: 'OUTGOING' },
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch and params when not provided', async () => {
    const opResult = { status: 'complete', path: [], pathFound: false };
    ShortestPathOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      startNodeId: 'comp-001',
      endNodeId: 'comp-002',
    };

    await handler(args, mockMemoryService);

    expect(ShortestPathOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      'comp-001',
      'comp-002',
      {},
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    ShortestPathOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
      startNodeId: 'comp-001',
      endNodeId: 'comp-002',
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
