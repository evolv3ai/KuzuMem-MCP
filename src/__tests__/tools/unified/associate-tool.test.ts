import { associateHandler } from '../../../mcp/services/handlers/unified/associate-handler';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import { EntityService } from '../../../services/domain/entity.service';
import { MemoryService } from '../../../services/memory.service';

// Define discriminated union type for associate handler results
type AssociateResult =
  | {
      type: 'file-component';
      success: boolean;
      message: string;
      association: { from: string; to: string; relationship: string };
    }
  | {
      type: 'tag-item';
      success: boolean;
      message: string;
      association: { from: string; to: string; relationship: string };
    };

describe('Associate Tool Tests', () => {
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockEntityService: jest.Mocked<EntityService>;
  let mockContext: jest.Mocked<EnrichedRequestHandlerExtra>;

  beforeEach(() => {
    mockEntityService = {
      associateFileWithComponent: jest.fn(),
      tagItem: jest.fn(),
    } as any;

    mockMemoryService = {
      services: {
        entity: mockEntityService,
      },
    } as any;

    // Mock context with session
    mockContext = {
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
      session: {
        clientProjectRoot: '/test/project',
      },
      sendProgress: jest.fn(),
      request: {} as any,
      meta: {} as any,
      signal: {} as any,
    } as any;
  });

  describe('File-Component Association', () => {
    it('should create file-component association', async () => {
      const mockResult = {
        type: 'file-component' as const,
        success: true,
        message: 'File associated with component successfully',
        association: {
          from: 'file-auth-ts',
          to: 'comp-AuthService',
          relationship: 'IMPLEMENTS',
        },
      };
      mockEntityService.associateFileWithComponent.mockResolvedValue(mockResult);

      const result = (await associateHandler(
        {
          type: 'file-component',
          repository: 'test-repo',
          branch: 'main',
          fileId: 'file-auth-ts',
          componentId: 'comp-AuthService',
        },
        mockContext,
        mockMemoryService,
      )) as AssociateResult;

      if (result.type === 'file-component') {
        expect(result.type).toBe('file-component');
        expect(result.success).toBe(true);
        expect(result.association.from).toBe('file-auth-ts');
        expect(result.association.to).toBe('comp-AuthService');
        expect(result.association.relationship).toBe('IMPLEMENTS');
      } else {
        fail('Expected result type to be file-component');
      }
      expect(mockEntityService.associateFileWithComponent).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'comp-AuthService',
        'file-auth-ts',
      );
    });

    it('should throw error if fileId is missing', async () => {
      await expect(
        associateHandler(
          {
            type: 'file-component',
            repository: 'test-repo',
            componentId: 'comp-AuthService',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Required fields missing for association type');
    });

    it('should throw error if componentId is missing', async () => {
      await expect(
        associateHandler(
          {
            type: 'file-component',
            repository: 'test-repo',
            fileId: 'file-auth-ts',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Required fields missing for association type');
    });
  });

  describe('Tag-Item Association', () => {
    it('should create tag-item association', async () => {
      const mockResult = {
        type: 'tag-item' as const,
        success: true,
        message: 'Component tagged successfully',
        association: {
          from: 'comp-AuthService',
          to: 'tag-security',
          relationship: 'TAGGED_WITH',
        },
      };
      mockEntityService.tagItem.mockResolvedValue(mockResult);

      const result = (await associateHandler(
        {
          type: 'tag-item',
          repository: 'test-repo',
          branch: 'main',
          itemId: 'comp-AuthService',
          tagId: 'tag-security',
          entityType: 'Component',
        },
        mockContext,
        mockMemoryService,
      )) as AssociateResult;

      if (result.type === 'tag-item') {
        expect(result.type).toBe('tag-item');
        expect(result.success).toBe(true);
        expect(result.association.from).toBe('comp-AuthService');
        expect(result.association.to).toBe('tag-security');
        expect(result.association.relationship).toBe('TAGGED_WITH');
      } else {
        fail('Expected result type to be tag-item');
      }
      expect(mockEntityService.tagItem).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'comp-AuthService',
        'Component',
        'tag-security',
      );
    });

    it('should throw error if itemId is missing', async () => {
      await expect(
        associateHandler(
          {
            type: 'tag-item',
            repository: 'test-repo',
            tagId: 'tag-security',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow(); // Zod validation error
    });

    it('should throw error if tagId is missing', async () => {
      await expect(
        associateHandler(
          {
            type: 'tag-item',
            repository: 'test-repo',
            itemId: 'comp-AuthService',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow(); // Zod validation error
    });

    it('should throw error if entityType is missing', async () => {
      await expect(
        associateHandler(
          {
            type: 'tag-item',
            repository: 'test-repo',
            itemId: 'comp-AuthService',
            tagId: 'tag-security',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow(); // Zod validation error
    });
  });

  describe('Session Validation', () => {
    it('should throw error if no active session', async () => {
      const contextNoSession = {
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        },
        session: {},
        sendProgress: jest.fn(),
        request: {} as any,
        meta: {} as any,
        signal: {} as any,
      } as any;

      await expect(
        associateHandler(
          {
            type: 'file-component',
            repository: 'test-repo',
            fileId: 'file-1',
            componentId: 'comp-1',
          },
          contextNoSession,
          mockMemoryService,
        ),
      ).rejects.toThrow('No active session');
    });
  });

  describe('Error Handling', () => {
    it('should handle and rethrow service errors for file-component', async () => {
      const error = new Error('Service error');
      mockEntityService.associateFileWithComponent.mockRejectedValue(error);

      await expect(
        associateHandler(
          {
            type: 'file-component',
            repository: 'test-repo',
            fileId: 'file-1',
            componentId: 'comp-1',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Service error');

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to execute file-component association: Service error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should handle and rethrow service errors for tag-item', async () => {
      const error = new Error('Tag service error');
      mockEntityService.tagItem.mockRejectedValue(error);

      await expect(
        associateHandler(
          {
            type: 'tag-item',
            repository: 'test-repo',
            itemId: 'comp-1',
            tagId: 'tag-1',
            entityType: 'Component',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Tag service error');

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to execute tag-item association: Tag service error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should throw error for unknown association type', async () => {
      await expect(
        associateHandler(
          {
            type: 'unknown' as any,
            repository: 'test-repo',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow();
    });
  });

  describe('Progress Reporting', () => {
    it('should report progress for file-component association', async () => {
      mockEntityService.associateFileWithComponent.mockResolvedValue({
        type: 'file-component' as const,
        success: true,
        message: 'Associated',
        association: {
          from: 'file-1',
          to: 'comp-1',
          relationship: 'IMPLEMENTS',
        },
      });

      await associateHandler(
        {
          type: 'file-component',
          repository: 'test-repo',
          fileId: 'file-1',
          componentId: 'comp-1',
        },
        mockContext,
        mockMemoryService,
      );

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'in_progress',
        message: 'Associating file file-1 with component comp-1...',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'File-component association created successfully',
        percent: 100,
        isFinal: true,
      });
    });

    it('should report progress for tag-item association', async () => {
      mockEntityService.tagItem.mockResolvedValue({
        type: 'tag-item' as const,
        success: true,
        message: 'Tagged',
        association: {
          from: 'tag-1',
          to: 'comp-1',
          relationship: 'TAGS',
        },
      });

      await associateHandler(
        {
          type: 'tag-item',
          repository: 'test-repo',
          itemId: 'comp-1',
          tagId: 'tag-1',
          entityType: 'Component',
        },
        mockContext,
        mockMemoryService,
      );

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'in_progress',
        message: 'Tagging Component comp-1 with tag tag-1...',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Tag-item association created successfully',
        percent: 100,
        isFinal: true,
      });
    });
  });
});
