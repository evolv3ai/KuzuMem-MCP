import { deleteHandler } from '../../../mcp/services/handlers/unified/delete-handler';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import { MemoryService } from '../../../services/memory.service';

describe('delete tool handler', () => {
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
      deleteComponent: jest.fn(),
      deleteDecision: jest.fn(),
      deleteRule: jest.fn(),
      deleteFile: jest.fn(),
      deleteTag: jest.fn(),
      deleteContext: jest.fn(),
      getComponent: jest.fn(),
      getDecision: jest.fn(),
      getRule: jest.fn(),
      getFile: jest.fn(),
      getTag: jest.fn(),
      bulkDeleteByType: jest.fn(),
      bulkDeleteByTag: jest.fn(),
      bulkDeleteByBranch: jest.fn(),
      bulkDeleteByRepository: jest.fn(),
    } as unknown as jest.Mocked<MemoryService>;
  });

  describe('parameter validation', () => {
    it('should require operation parameter', async () => {
      const params = {
        repository: 'test-repo',
      };

      await expect(deleteHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
        'operation parameter is required',
      );
    });

    it('should require repository parameter', async () => {
      const params = {
        operation: 'single',
      };

      await expect(deleteHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
        'repository parameter is required',
      );
    });
  });

  describe('single deletion', () => {
    it('should delete a component successfully', async () => {
      mockMemoryService.deleteComponent.mockResolvedValueOnce(true);

      const params = {
        operation: 'single',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-AuthService',
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.deleteComponent).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'comp-AuthService',
      );

      expect(result).toEqual({
        success: true,
        operation: 'single',
        message: 'component comp-AuthService deleted successfully',
        deletedCount: 1,
      });
    });

    it('should handle delete of non-existent entity', async () => {
      mockMemoryService.deleteFile.mockResolvedValueOnce(false);

      const params = {
        operation: 'single',
        entityType: 'file',
        repository: 'test-repo',
        branch: 'main',
        id: 'file-missing',
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        operation: 'single',
        message: 'file with ID file-missing not found',
        deletedCount: 0,
      });
    });

    it('should require entityType and id for single deletion', async () => {
      const params = {
        operation: 'single',
        repository: 'test-repo',
      };

      const result = (await deleteHandler(params, mockContext, mockMemoryService)) as any;

      expect(result.success).toBe(false);
      expect(result.operation).toBe('single');
      expect(result.message).toMatch(/entityType and id.*required.*single deletion/);
      expect(result.deletedCount).toBe(0);
    });

    it('should support dry run for single deletion', async () => {
      mockMemoryService.getComponent.mockResolvedValueOnce({
        id: 'comp-test',
        name: 'Test Component',
        repository: 'test-repo',
        branch: 'main',
      });

      const params = {
        operation: 'single',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-test',
        dryRun: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.deleteComponent).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        operation: 'single',
        message: 'Would delete component with ID comp-test',
        deletedCount: 1,
        dryRun: true,
      });
    });
  });

  describe('bulk deletion by type', () => {
    it('should delete all components successfully', async () => {
      const mockResult = {
        count: 5,
        entities: [
          { type: 'component', id: 'comp-1', name: 'Component 1' },
          { type: 'component', id: 'comp-2', name: 'Component 2' },
        ],
        warnings: [],
      };
      mockMemoryService.bulkDeleteByType.mockResolvedValueOnce(mockResult);

      const params = {
        operation: 'bulk-by-type',
        targetType: 'component',
        repository: 'test-repo',
        branch: 'main',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.bulkDeleteByType).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'component',
        {
          dryRun: false,
          force: false,
        },
      );

      expect(result).toEqual({
        success: true,
        operation: 'bulk-by-type',
        message: 'Deleted 5 component entities',
        deletedCount: 5,
        deletedEntities: mockResult.entities,
        dryRun: undefined,
        warnings: [],
      });
    });

    it('should require confirmation for bulk operations', async () => {
      const params = {
        operation: 'bulk-by-type',
        targetType: 'component',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = (await deleteHandler(params, mockContext, mockMemoryService)) as any;

      expect(result.success).toBe(false);
      expect(result.operation).toBe('bulk-by-type');
      expect(result.message).toMatch(/confirm.*required.*bulk deletion/);
      expect(result.deletedCount).toBe(0);
    });

    it('should require targetType for bulk-by-type', async () => {
      const params = {
        operation: 'bulk-by-type',
        repository: 'test-repo',
        branch: 'main',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        operation: 'bulk-by-type',
        message: 'Failed to execute bulk-by-type: targetType is required for bulk-by-type deletion',
        deletedCount: 0,
      });
    });
  });

  describe('bulk deletion by tag', () => {
    it('should delete all entities with specific tag', async () => {
      const mockResult = {
        count: 3,
        entities: [
          { type: 'component', id: 'comp-1', name: 'Component 1' },
          { type: 'decision', id: 'dec-1', name: 'Decision 1' },
        ],
        warnings: [],
      };
      mockMemoryService.bulkDeleteByTag.mockResolvedValueOnce(mockResult);

      const params = {
        operation: 'bulk-by-tag',
        tagId: 'tag-deprecated',
        repository: 'test-repo',
        branch: 'main',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.bulkDeleteByTag).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'tag-deprecated',
        {
          dryRun: false,
          force: false,
        },
      );

      expect(result).toEqual({
        success: true,
        operation: 'bulk-by-tag',
        message: 'Deleted 3 entities tagged with tag-deprecated',
        deletedCount: 3,
        deletedEntities: mockResult.entities,
        dryRun: undefined,
        warnings: [],
      });
    });

    it('should require tagId for bulk-by-tag', async () => {
      const params = {
        operation: 'bulk-by-tag',
        repository: 'test-repo',
        branch: 'main',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        operation: 'bulk-by-tag',
        message: 'Failed to execute bulk-by-tag: tagId is required for bulk-by-tag deletion',
        deletedCount: 0,
      });
    });
  });

  describe('bulk deletion by branch', () => {
    it('should delete all entities from specific branch', async () => {
      const mockResult = {
        count: 10,
        entities: [
          { type: 'component', id: 'comp-1', name: 'Component 1' },
          {
            type: 'repository',
            id: 'test-repo:feature-branch',
            name: 'test-repo (feature-branch)',
          },
        ],
        warnings: [],
      };
      mockMemoryService.bulkDeleteByBranch.mockResolvedValueOnce(mockResult);

      const params = {
        operation: 'bulk-by-branch',
        targetBranch: 'feature-branch',
        repository: 'test-repo',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.bulkDeleteByBranch).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'feature-branch',
        {
          dryRun: false,
          force: false,
        },
      );

      expect(result).toEqual({
        success: true,
        operation: 'bulk-by-branch',
        message: 'Deleted 10 entities from branch feature-branch',
        deletedCount: 10,
        deletedEntities: mockResult.entities,
        dryRun: undefined,
        warnings: [],
      });
    });

    it('should require targetBranch for bulk-by-branch', async () => {
      const params = {
        operation: 'bulk-by-branch',
        repository: 'test-repo',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        operation: 'bulk-by-branch',
        message:
          'Failed to execute bulk-by-branch: targetBranch is required for bulk-by-branch deletion',
        deletedCount: 0,
      });
    });
  });

  describe('bulk deletion by repository', () => {
    it('should delete all entities from repository (all branches)', async () => {
      const mockResult = {
        count: 25,
        entities: [
          { type: 'component', id: 'comp-1', name: 'Component 1 (main)' },
          { type: 'repository', id: 'test-repo:main', name: 'test-repo (main)' },
          { type: 'repository', id: 'test-repo:feature', name: 'test-repo (feature)' },
        ],
        warnings: [],
      };
      mockMemoryService.bulkDeleteByRepository.mockResolvedValueOnce(mockResult);

      const params = {
        operation: 'bulk-by-repository',
        repository: 'test-repo',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.bulkDeleteByRepository).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        {
          dryRun: false,
          force: false,
        },
      );

      expect(result).toEqual({
        success: true,
        operation: 'bulk-by-repository',
        message: 'Deleted 25 entities from repository test-repo (all branches)',
        deletedCount: 25,
        deletedEntities: mockResult.entities,
        dryRun: undefined,
        warnings: [],
      });
    });
  });

  describe('unsupported operations', () => {
    it('should return error for bulk-by-filter (not implemented)', async () => {
      const params = {
        operation: 'bulk-by-filter',
        repository: 'test-repo',
        confirm: true,
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        operation: 'bulk-by-filter',
        message:
          'Failed to execute bulk-by-filter: bulk-by-filter operation not yet implemented - will be added in future version',
        deletedCount: 0,
      });
    });

    it('should return error for unknown operation', async () => {
      const params = {
        operation: 'unknown-operation',
        repository: 'test-repo',
      };

      const result = await deleteHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        operation: 'unknown-operation',
        message: 'Failed to execute unknown-operation: Unknown operation: unknown-operation',
        deletedCount: 0,
      });
    });
  });
});
