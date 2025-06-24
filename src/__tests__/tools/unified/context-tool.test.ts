import { contextHandler } from '../../../mcp/services/handlers/unified/context-handler';
import { ToolHandlerContext } from '../../../mcp/types/sdk-custom';
import { ContextService } from '../../../services/domain/context.service';
import { MemoryService } from '../../../services/memory.service';

// Define discriminated union type for context handler results
type ContextResult =
  | {
      success: true;
      message?: string;
      context: {
        id: string;
        iso_date: string;
        agent: string;
        summary: string;
        observation: string | null;
        repository: string;
        branch: string;
        created_at: string | null;
        updated_at: string | null;
      };
    }
  | {
      success: true;
      message?: string;
    }
  | {
      success: false;
      message: string;
    };

describe('context tool handler', () => {
  let mockContext: ToolHandlerContext;
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockContextService: jest.Mocked<ContextService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock context
    mockContext = {
      session: {
        clientProjectRoot: '/test/project',
        repository: 'test-repo',
        branch: 'main',
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
      sendProgress: jest.fn(),
    } as unknown as ToolHandlerContext;

    mockContextService = {
      updateContext: jest.fn(),
    } as unknown as jest.Mocked<ContextService>;

    // Create mock memory service
    mockMemoryService = {
      context: mockContextService,
      services: {
        context: mockContextService,
      },
    } as unknown as jest.Mocked<MemoryService>;
  });

  describe('update operation', () => {
    it('should update context successfully', async () => {
      const mockUpdateResult = {
        success: true,
        message: 'Context updated successfully',
        context: {
          id: 'ctx-20241210-test-repo-main',
          iso_date: '2024-12-10',
          agent: 'cursor',
          summary: 'Implemented new feature',
          observation: null,
          repository: 'test-repo:main',
          branch: 'main',
          created_at: '2024-12-10T12:00:00.000Z',
          updated_at: '2024-12-10T12:00:00.000Z',
        },
      };
      mockContextService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Implemented new feature',
        observation: 'Used new pattern for error handling',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(mockContextService.updateContext).toHaveBeenCalledWith(mockContext, '/test/project', {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Implemented new feature',
        observation: 'Used new pattern for error handling',
      });

      expect(result).toEqual({
        success: true,
        message: 'Context updated successfully',
        context: {
          id: 'ctx-20241210-test-repo-main',
          iso_date: '2024-12-10',
          agent: 'cursor',
          summary: 'Implemented new feature',
          observation: null,
          repository: 'test-repo:main',
          branch: 'main',
          created_at: '2024-12-10T12:00:00.000Z',
          updated_at: '2024-12-10T12:00:00.000Z',
        },
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Context updated successfully',
        percent: 100,
        isFinal: true,
      });
    });

    it('should handle update without observation', async () => {
      const mockUpdateResult = {
        success: true,
        context: {
          id: 'ctx-20241210-test-repo-main',
          iso_date: '2024-12-10',
          agent: 'cursor',
          summary: 'Simple update',
          observation: null,
          repository: 'test-repo:main',
          branch: 'main',
          created_at: null,
          updated_at: null,
        },
      };
      mockContextService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Simple update',
        // observation omitted
      };

      const result = (await contextHandler(
        params,
        mockContext,
        mockMemoryService,
      )) as ContextResult;

      if (result.success && 'context' in result) {
        expect(result.success).toBe(true);
        expect(result.context?.observation).toBeNull();
      } else {
        fail('Expected result to be successful with context');
      }
    });

    it('should handle failed update', async () => {
      const mockUpdateResult = {
        success: false,
        message: 'Database connection failed',
      };
      mockContextService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Failed update',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'Database connection failed',
      });
    });

    it('should handle unexpected response format', async () => {
      // Mock returning null
      mockContextService.updateContext.mockResolvedValueOnce(null as any);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Test update',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'Failed to update context: unexpected response format',
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing session context', async () => {
      mockContext.session = {};

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Test update',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message:
          'No active session for context tool. Use memory-bank tool with operation "init" first.',
      });
    });

    it('should handle service errors gracefully', async () => {
      mockContextService.updateContext.mockRejectedValueOnce(new Error('Database error'));

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Test update',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'Database error',
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to execute context update: Database error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should validate required parameters', async () => {
      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        // summary missing
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'summary parameter is required for update operation',
      });
    });

    it('should throw error for invalid operation', async () => {
      const params = {
        operation: 'invalid-op',
        repository: 'test-repo',
        summary: 'test',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: "operation must be 'update', received: invalid-op",
      });
    });

    it('should throw error for missing repository', async () => {
      const params = {
        operation: 'update',
        // repository missing
        summary: 'test',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'repository parameter is required',
      });
    });

    it('should throw error for invalid repository format', async () => {
      const params = {
        operation: 'update',
        repository: 'test@repo!', // Invalid characters
        summary: 'test',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message:
          'repository name contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed: test@repo!',
      });
    });

    it('should trim whitespace from parameters', async () => {
      const mockUpdateResult = {
        success: true,
        context: {
          id: 'ctx-20241210-test-repo-main',
          iso_date: '2024-12-10',
          agent: 'cursor-agent',
          summary: 'Test summary',
          observation: 'Test observation',
          repository: 'test-repo:main',
          branch: 'main',
          created_at: null,
          updated_at: null,
        },
      };
      mockContextService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: '  update  ', // Whitespace should be trimmed
        repository: '  test-repo  ',
        branch: '  main  ',
        agent: '  cursor  ',
        summary: '  Test summary  ',
        observation: '  Test observation  ',
      };

      await contextHandler(params, mockContext, mockMemoryService);

      // Verify trimmed values were used in the service call
      expect(mockContextService.updateContext).toHaveBeenCalledWith(mockContext, '/test/project', {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Test summary',
        observation: 'Test observation',
      });
    });

    it('should throw error for whitespace-only parameters', async () => {
      const params = {
        operation: '   ', // Whitespace-only
        repository: 'test-repo',
        summary: 'test',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'operation parameter cannot be empty or whitespace-only',
      });
    });

    it('should handle non-object params', async () => {
      const result = await contextHandler('invalid-params' as any, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'params must be an object',
      });
    });

    it('should handle non-string parameters', async () => {
      const params = {
        operation: 123, // Number instead of string
        repository: 'test-repo',
        summary: 'test',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'operation parameter must be a string, received number',
      });
    });

    it('should use default branch when not provided', async () => {
      const mockUpdateResult = {
        success: true,
        context: {
          id: 'ctx-20241210-test-repo-main',
          iso_date: '2024-12-10',
          agent: 'cursor-agent',
          summary: 'Test summary',
          observation: null,
          repository: 'test-repo:main',
          branch: 'main',
          created_at: null,
          updated_at: null,
        },
      };
      mockContextService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        // branch not provided - should default to 'main'
        summary: 'Test summary',
      };

      await contextHandler(params, mockContext, mockMemoryService);

      // Verify default branch was used
      expect(mockContextService.updateContext).toHaveBeenCalledWith(mockContext, '/test/project', {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor-agent',
        summary: 'Test summary',
        observation: undefined,
      });
    });
  });

  describe('progress reporting', () => {
    it('should report progress during update operation', async () => {
      const mockUpdateResult = {
        success: true,
        context: {
          id: 'ctx-20241210-test-repo-main',
          iso_date: '2024-12-10',
          agent: 'cursor',
          summary: 'Test update',
          observation: null,
          repository: 'test-repo:main',
          branch: 'main',
          created_at: null,
          updated_at: null,
        },
      };
      mockContextService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Test update',
      };

      await contextHandler(params, mockContext, mockMemoryService);

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'in_progress',
        message: 'Updating context...',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Context updated successfully',
        percent: 100,
        isFinal: true,
      });
    });
  });
});
