// @ts-nocheck
/**
 * Unit test for the update-context tool handler
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { toolHandlers } from '../../../mcp/tool-handlers';
import { MemoryService } from '../../../services/memory.service';

// Create a mock of the MemoryService
jest.mock('../../../services/memory.service', () => {
  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue({
        updateContext: jest.fn(),
        // Add other methods as needed
      }),
    },
  };
});

// Sample context for testing
const sampleContext = {
  id: 'ctx-20230515',
  iso_date: '2023-05-15',
  repository: 'repo-123',
  branch: 'main',
  name: 'Daily Context',
  summary: 'Added authentication module',
  agent: 'developer-1',
};

describe('update-context tool handler', () => {
  const handler = toolHandlers['update-context'];
  let mockMemoryService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Get the mocked instance
    mockMemoryService = await MemoryService.getInstance();
  });

  it('should validate required parameters', async () => {
    // Test missing repository
    const missingRepoArgs = {
      branch: 'main',
      summary: 'Test summary',
      agent: 'test-agent',
    };
    await expect(handler(missingRepoArgs, mockMemoryService)).rejects.toThrow(
      'Missing repository for update-context',
    );

    // Memory service's updateContext should not be called
    expect(mockMemoryService.updateContext).not.toHaveBeenCalled();
  });

  it('should update context with summary and agent', async () => {
    // Setup mock to return updated context
    mockMemoryService.updateContext.mockResolvedValue(sampleContext);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      summary: 'New summary',
      agent: 'test-agent',
    };

    const result = await handler(args, mockMemoryService);

    // Check result
    expect(result).toEqual({
      success: true,
      message: 'Context updated for test-repo (branch: main)',
      context: sampleContext,
    });

    // Check if memory service was called with correct parameters
    expect(mockMemoryService.updateContext).toHaveBeenCalledWith({
      repository: 'test-repo',
      branch: 'main',
      summary: 'New summary',
      agent: 'test-agent',
    });
    expect(mockMemoryService.updateContext).toHaveBeenCalledTimes(1);
  });

  it('should handle optional parameters correctly', async () => {
    // Setup mock to return updated context
    mockMemoryService.updateContext.mockResolvedValue(sampleContext);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      summary: 'New summary',
      agent: 'test-agent',
      decision: 'D001',
      observation: 'Testing observation',
      issue: 'ISSUE-123',
    };

    await handler(args, mockMemoryService);

    // Check if memory service was called with all parameters
    expect(mockMemoryService.updateContext).toHaveBeenCalledWith({
      repository: 'test-repo',
      branch: 'main',
      summary: 'New summary',
      agent: 'test-agent',
      decision: 'D001',
      observation: 'Testing observation',
      issue: 'ISSUE-123',
    });
  });

  it('should use default branch when not provided', async () => {
    // Setup mock to return updated context
    mockMemoryService.updateContext.mockResolvedValue(sampleContext);

    const args = {
      repository: 'test-repo',
      summary: 'New summary',
      agent: 'test-agent',
    };

    await handler(args, mockMemoryService);

    // Check parameters - should have main as the default branch
    expect(mockMemoryService.updateContext).toHaveBeenCalledWith({
      repository: 'test-repo',
      branch: 'main',
      summary: 'New summary',
      agent: 'test-agent',
    });
  });

  it('should handle failed context update', async () => {
    // Setup mock to return null (update failed)
    mockMemoryService.updateContext.mockResolvedValue(null);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      summary: 'New summary',
    };

    const result = await handler(args, mockMemoryService);

    // Check result - should indicate failure
    expect(result).toEqual({
      success: false,
      error:
        'Failed to update context for test-repo (branch: main). Repository or context not found, or an error occurred.',
    });
  });

  it('should propagate errors from the memory service', async () => {
    // Setup mock to throw an error
    const mockError = new Error('Database connection failed');
    mockMemoryService.updateContext.mockRejectedValueOnce(mockError);

    const args = {
      repository: 'test-repo',
      branch: 'main',
      summary: 'Test summary',
    };

    // Check that error is propagated
    await expect(handler(args, mockMemoryService)).rejects.toThrow('Database connection failed');
  });

  it('should handle missing updateContext method in memory service', async () => {
    // Create a new mock without updateContext
    const badMemoryService = {
      // Missing updateContext method
    };

    const args = {
      repository: 'test-repo',
      branch: 'main',
      summary: 'Test summary',
    };

    // Should throw an error about missing method
    await expect(handler(args, badMemoryService)).rejects.toThrow(
      "Tool 'update-context' requires MemoryService.updateContext",
    );
  });
});
