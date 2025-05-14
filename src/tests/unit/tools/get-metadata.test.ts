// @ts-nocheck
/**
 * Unit test for the get-metadata tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        getMetadata: jest.fn(),
        // Add other methods as needed
      }),
    },
  };
});

// Sample metadata for testing
const sampleMetadata = {
  id: 'meta',
  name: 'test-repo',
  content: JSON.stringify({
    id: 'meta',
    project: {
      name: 'test-repo',
      created: '2023-05-15',
      description: 'Test repository',
    },
    tech_stack: {
      language: 'TypeScript',
      framework: 'Node.js',
    },
    memory_spec_version: '3.0.0',
  }),
};

describe('get-metadata tool handler', () => {
  const handler = toolHandlers['get-metadata'];
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
      'Missing repository parameter for get-metadata',
    );

    // Memory service's getMetadata should not be called
    expect(mockMemoryService.getMetadata).not.toHaveBeenCalled();
  });

  it('should return metadata for a valid repository', async () => {
    // Setup mock to return sample metadata
    mockMemoryService.getMetadata.mockResolvedValue(sampleMetadata);

    const args = { repository: 'test-repo', branch: 'main' };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual(sampleMetadata);

    // Check if memory service was called with correct parameters
    expect(mockMemoryService.getMetadata).toHaveBeenCalledWith('test-repo', 'main');
    expect(mockMemoryService.getMetadata).toHaveBeenCalledTimes(1);
  });

  it('should use default branch when not provided', async () => {
    // Setup mock to return sample metadata
    mockMemoryService.getMetadata.mockResolvedValue(sampleMetadata);

    const args = { repository: 'test-repo' };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual(sampleMetadata);

    // Check if memory service was called with correct parameters (default branch)
    expect(mockMemoryService.getMetadata).toHaveBeenCalledWith('test-repo', 'main');
  });

  it('should return null when metadata is not found', async () => {
    // Setup mock to return null (metadata not found)
    mockMemoryService.getMetadata.mockResolvedValue(null);

    const args = { repository: 'non-existent-repo', branch: 'main' };

    const result = await handler(args, mockMemoryService);

    // Result should be null when metadata is not found
    expect(result).toBeNull();

    // Service should still be called
    expect(mockMemoryService.getMetadata).toHaveBeenCalledWith('non-existent-repo', 'main');
  });

  it('should propagate errors from the memory service', async () => {
    // Setup mock to throw an error
    const mockError = new Error('Database connection failed');
    mockMemoryService.getMetadata.mockRejectedValueOnce(mockError);

    const args = { repository: 'test-repo', branch: 'main' };

    // Check that error is propagated
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Database connection failed');
  });
});
