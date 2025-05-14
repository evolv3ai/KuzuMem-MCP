// @ts-nocheck
/**
 * Unit test for the init-memory-bank tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService - we need to mock getInstance because it's a singleton
jest.mock('../../../services/memory.service', () => {
  const mockInitMemoryBank = jest.fn();

  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        initMemoryBank: mockInitMemoryBank,
        // Add other methods as needed
      }),
      // Mock other static members if needed
    },
  };
});

describe('init-memory-bank tool handler', () => {
  const handler = toolHandlers['init-memory-bank'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Get the mocked instance
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Test missing repository
    const missingRepoArgs = { branch: 'main' };
    await expect(handler(missingRepoArgs, mockMemoryService)).rejects.toThrow(
      'Missing repository parameter for init-memory-bank',
    );

    // Memory service's initMemoryBank should not be called
    expect(mockMemoryService.initMemoryBank).not.toHaveBeenCalled();
  });

  it('should initialize memory bank with provided parameters', async () => {
    const args = { repository: 'test-repo', branch: 'main' };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual({
      success: true,
      message: 'Memory bank initialized for test-repo (branch: main)',
    });

    // Check if memory service was called with correct parameters
    expect(mockMemoryService.initMemoryBank).toHaveBeenCalledWith('test-repo', 'main');
    expect(mockMemoryService.initMemoryBank).toHaveBeenCalledTimes(1);
  });

  it('should use default branch when not provided', async () => {
    const args = { repository: 'test-repo' };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual({
      success: true,
      message: 'Memory bank initialized for test-repo (branch: main)',
    });

    // Check if memory service was called with correct parameters (default branch)
    expect(mockMemoryService.initMemoryBank).toHaveBeenCalledWith('test-repo', 'main');
  });

  it('should propagate errors from the memory service', async () => {
    // Setup mock to throw an error
    const mockError = new Error('Database connection failed');
    mockMemoryService.initMemoryBank.mockRejectedValueOnce(mockError);

    const args = { repository: 'test-repo', branch: 'main' };

    // Check that error is propagated
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Database connection failed');
  });
});
