import { contextHandler } from '../../../mcp/services/handlers/unified/context-handler';
import { MemoryService } from '../../../services/memory.service';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

describe('context tool handler', () => {
  let mockContext: EnrichedRequestHandlerExtra;
  let mockMemoryService: jest.Mocked<MemoryService>;

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
    } as unknown as EnrichedRequestHandlerExtra;

    // Create mock memory service
    mockMemoryService = {
      updateContext: jest.fn(),
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
      mockMemoryService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Implemented new feature',
        observation: 'Used new pattern for error handling',
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.updateContext).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        {
          repository: 'test-repo',
          branch: 'main',
          agent: 'cursor',
          summary: 'Implemented new feature',
          observation: 'Used new pattern for error handling',
        },
      );

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
      mockMemoryService.updateContext.mockResolvedValueOnce(mockUpdateResult);

      const params = {
        operation: 'update',
        repository: 'test-repo',
        branch: 'main',
        agent: 'cursor',
        summary: 'Simple update',
        // observation omitted
      };

      const result = await contextHandler(params, mockContext, mockMemoryService);

      expect(result.success).toBe(true);
      expect(result.context?.observation).toBeNull();
    });

    it('should handle failed update', async () => {
      const mockUpdateResult = {
        success: false,
        message: 'Database connection failed',
      };
      mockMemoryService.updateContext.mockResolvedValueOnce(mockUpdateResult);

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
      mockMemoryService.updateContext.mockResolvedValueOnce(null as any);

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
        message: 'Failed to update context - unexpected response format',
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

      await expect(contextHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
        'No active session',
      );
    });

    it('should handle service errors gracefully', async () => {
      mockMemoryService.updateContext.mockRejectedValueOnce(new Error('Database error'));

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
        message: 'Failed to update context: Database error',
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

      await expect(contextHandler(params, mockContext, mockMemoryService)).rejects.toThrow();
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
      mockMemoryService.updateContext.mockResolvedValueOnce(mockUpdateResult);

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