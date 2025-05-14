// @ts-nocheck
/**
 * Unit test for the strongly-connected-components tool handler
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
jest.mock('../../../mcp/streaming/operations/strongly-connected-components.operation', () => ({
  StronglyConnectedComponentsOperation: {
    execute: jest.fn(),
  },
}));

import { StronglyConnectedComponentsOperation } from '../../../mcp/streaming/operations/strongly-connected-components.operation';

describe('strongly-connected-components tool handler', () => {
  const handler = toolHandlers['strongly-connected-components'];
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
    expect(StronglyConnectedComponentsOperation.execute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult = { status: 'complete', stronglyConnectedComponents: [] };
    StronglyConnectedComponentsOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      projectedGraphName: 'scc-test',
      nodeTableNames: ['Component'],
      relationshipTableNames: ['DEPENDS_ON'],
    };

    const result = await handler(args, mockMemoryService);

    expect(result).toBe(opResult);
    expect(StronglyConnectedComponentsOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      {},
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch when not provided', async () => {
    const opResult = { status: 'complete', stronglyConnectedComponents: [] };
    StronglyConnectedComponentsOperation.execute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      projectedGraphName: 'scc-test',
      nodeTableNames: ['Component'],
      relationshipTableNames: ['DEPENDS_ON'],
    };

    await handler(args, mockMemoryService);

    expect(StronglyConnectedComponentsOperation.execute).toHaveBeenCalledWith(
      'test-repo',
      'main',
      {},
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    StronglyConnectedComponentsOperation.execute.mockRejectedValueOnce(new Error('Graph error'));
    const args = {
      repository: 'test-repo',
      branch: 'main',
      projectedGraphName: 'scc-test',
      nodeTableNames: ['Component'],
      relationshipTableNames: ['DEPENDS_ON'],
    };
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
