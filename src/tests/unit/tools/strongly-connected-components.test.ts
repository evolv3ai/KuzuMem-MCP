/**
 * Unit test for the strongly-connected-components tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Mock the operation class and its module before importing it
jest.mock('../../../mcp/streaming/operations/strongly-connected-components.operation', () => ({
  StronglyConnectedComponentsOperation: {
    execute: jest.fn(),
  },
}));

// Import after mocking
import { StronglyConnectedComponentsOperation } from '../../../mcp/streaming/operations/strongly-connected-components.operation';

// Mock the memory service
jest.mock('../../../services/memory.service');

// Define the expected result type
interface SccResult {
  status: string;
  stronglyConnectedComponents: any[];
  [key: string]: any;
}

// Define the expected error type
interface ErrorResult {
  error: string;
  [key: string]: any;
}

describe('strongly-connected-components tool handler', () => {
  const handler = toolHandlers['strongly-connected-components'];
  let mockMemoryService: any;

  // Create a properly typed version of the mock
  const mockExecute = StronglyConnectedComponentsOperation.execute as jest.MockedFunction<
    typeof StronglyConnectedComponentsOperation.execute
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a simple mock memory service
    mockMemoryService = {};
  });

  // Mock context for the handler
  const mockContext = {
    logger: console,
    session: {},
    sendProgress: jest.fn(async () => {}),
    memoryService: mockMemoryService,
    signal: new AbortController().signal,
    requestId: 'test-request-id',
    sendNotification: jest.fn(async () => {}),
    sendRequest: jest.fn(async () => {}),
  } as any; // Type assertion to avoid complex mock typing

  it('should validate required parameters', async () => {
    // Missing repository
    const missingRepoArgs = {
      branch: 'main',
      clientProjectRoot: '/test/client/root',
    };
    const result = (await handler(missingRepoArgs, mockContext, mockMemoryService)) as ErrorResult;
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('repository');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('should call the operation and return its result', async () => {
    const opResult: SccResult = { status: 'complete', stronglyConnectedComponents: [] };
    mockExecute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      clientProjectRoot: '/test/client/root',
      projectedGraphName: 'scc-test',
      nodeTableNames: ['Component'],
      relationshipTableNames: ['DEPENDS_ON'],
    };

    const result = await handler(args, mockContext, mockMemoryService);

    expect(result).toBe(opResult);
    expect(mockExecute).toHaveBeenCalledWith(
      '/test/client/root',
      'test-repo',
      'main',
      'scc-test',
      ['Component'],
      ['DEPENDS_ON'],
      mockMemoryService,
      undefined,
    );
  });

  it('should use default branch when not provided', async () => {
    const opResult: SccResult = { status: 'complete', stronglyConnectedComponents: [] };
    mockExecute.mockResolvedValue(opResult);

    const args = {
      repository: 'test-repo',
      clientProjectRoot: '/test/client/root',
      projectedGraphName: 'scc-test',
      nodeTableNames: ['Component'],
      relationshipTableNames: ['DEPENDS_ON'],
    };

    await handler(args, mockContext, mockMemoryService);

    expect(mockExecute).toHaveBeenCalledWith(
      '/test/client/root',
      'test-repo',
      'main',
      'scc-test',
      ['Component'],
      ['DEPENDS_ON'],
      mockMemoryService,
      undefined,
    );
  });

  it('should handle errors from the operation', async () => {
    const testError = new Error('Graph error');
    mockExecute.mockRejectedValue(testError);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      clientProjectRoot: '/test/client/root',
      projectedGraphName: 'scc-test',
      nodeTableNames: ['Component'],
      relationshipTableNames: ['DEPENDS_ON'],
    };
    await expect(handler(args, mockContext, mockMemoryService)).rejects.toThrow('Graph error');
  });
});
