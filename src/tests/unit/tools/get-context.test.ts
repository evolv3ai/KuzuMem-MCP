// @ts-nocheck
/**
 * Unit test for the get-context tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        getLatestContexts: jest.fn(),
        // Add other methods as needed
      }),
    },
  };
});

// Sample context entries for testing
const sampleContexts = [
  {
    id: 'ctx-20230515',
    iso_date: '2023-05-15',
    repository: 'repo-123',
    branch: 'main',
    name: 'Daily Context',
    summary: 'Added authentication module',
    agent: 'developer-1',
  },
  {
    id: 'ctx-20230514',
    iso_date: '2023-05-14',
    repository: 'repo-123',
    branch: 'main',
    name: 'Daily Context',
    summary: 'Initial project setup',
    agent: 'developer-1',
  },
];

describe('get-context tool handler', () => {
  const handler = toolHandlers['get-context'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Get the mocked instance
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Test missing repository
    const missingRepoArgs = { branch: 'main', latest: true };
    await expect(handler(missingRepoArgs, mockMemoryService)).rejects.toThrow(
      'Missing repository parameter for get-context',
    );

    // Memory service's getLatestContexts should not be called
    expect(mockMemoryService.getLatestContexts).not.toHaveBeenCalled();
  });

  it('should get latest context when latest is true', async () => {
    // Setup mock to return a single latest context
    mockMemoryService.getLatestContexts.mockResolvedValue([sampleContexts[0]]);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      latest: true,
    };

    const result = await handler(args, mockMemoryService);

    // Check result - should be the array with one item
    expect(result).toEqual([sampleContexts[0]]);

    // Check if memory service was called with correct parameters (limit = 1)
    expect(mockMemoryService.getLatestContexts).toHaveBeenCalledWith('test-repo', 'main', 1);
    expect(mockMemoryService.getLatestContexts).toHaveBeenCalledTimes(1);
  });

  it('should get all contexts when latest is false and no limit is specified', async () => {
    // Setup mock to return all contexts
    mockMemoryService.getLatestContexts.mockResolvedValue(sampleContexts);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      latest: false,
    };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual(sampleContexts);

    // Check if memory service was called with correct parameters (undefined limit)
    expect(mockMemoryService.getLatestContexts).toHaveBeenCalledWith(
      'test-repo',
      'main',
      undefined,
    );
  });

  it('should respect the limit parameter when provided', async () => {
    // Setup mock to return limited contexts
    mockMemoryService.getLatestContexts.mockResolvedValue([sampleContexts[0]]);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      limit: 1,
    };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual([sampleContexts[0]]);

    // Check if memory service was called with correct parameters
    expect(mockMemoryService.getLatestContexts).toHaveBeenCalledWith('test-repo', 'main', 1);
  });

  it('should use default branch when not provided', async () => {
    // Setup mock to return contexts
    mockMemoryService.getLatestContexts.mockResolvedValue(sampleContexts);

    const args = {
      repository: 'test-repo',
    };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual(sampleContexts);

    // Check if memory service was called with correct parameters (default branch)
    expect(mockMemoryService.getLatestContexts).toHaveBeenCalledWith(
      'test-repo',
      'main',
      undefined,
    );
  });

  it('should propagate errors from the memory service', async () => {
    // Setup mock to throw an error
    const mockError = new Error('Database connection failed');
    mockMemoryService.getLatestContexts.mockRejectedValueOnce(mockError);

    const args = {
      repository: 'test-repo',
      branch: 'main',
    };

    // Check that error is propagated
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Database connection failed');
  });
});
