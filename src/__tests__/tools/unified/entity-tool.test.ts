import { SdkToolHandler } from '../../../mcp/tool-handlers';
import { entityHandler } from '../../../mcp/services/handlers/unified/entity-handler';
import { MemoryService } from '../../../services/memory.service';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

describe('entity tool handler', () => {
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
      upsertComponent: jest.fn(),
      upsertDecision: jest.fn(),
      upsertRule: jest.fn(),
      addFile: jest.fn(),
      addTag: jest.fn(),
    } as unknown as jest.Mocked<MemoryService>;
  });

  describe('create operation', () => {
    it('should create a component successfully', async () => {
      const params = {
        operation: 'create',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-AuthService',
        data: {
          name: 'Auth Service',
          kind: 'service',
          status: 'active',
          depends_on: ['comp-Database'],
        },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.upsertComponent).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        expect.objectContaining({
          id: 'comp-AuthService',
          name: 'Auth Service',
          type: 'component',
          kind: 'service',
          status: 'active',
          depends_on: ['comp-Database'],
        }),
      );

      expect(result).toEqual({
        success: true,
        message: 'component comp-AuthService created successfully',
        entity: expect.objectContaining({
          id: 'comp-AuthService',
          name: 'Auth Service',
        }),
      });
    });

    it('should create a decision successfully', async () => {
      const params = {
        operation: 'create',
        entityType: 'decision',
        repository: 'test-repo',
        branch: 'main',
        id: 'dec-20241210-api-design',
        data: {
          name: 'API Design Pattern',
          date: '2024-12-10',
          context: 'Decided on REST over GraphQL',
          decisionStatus: 'accepted',
        },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.upsertDecision).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        expect.objectContaining({
          id: 'dec-20241210-api-design',
          name: 'API Design Pattern',
          type: 'decision',
          date: '2024-12-10',
          context: 'Decided on REST over GraphQL',
          status: 'accepted',
        }),
      );

      expect(result).toEqual({
        success: true,
        message: 'decision dec-20241210-api-design created successfully',
        entity: expect.any(Object),
      });
    });

    it('should create a rule successfully', async () => {
      const params = {
        operation: 'create',
        entityType: 'rule',
        repository: 'test-repo',
        branch: 'main',
        id: 'rule-security-auth',
        data: {
          name: 'Authentication Required',
          created: '2024-12-10',
          content: 'All API endpoints must authenticate',
          triggers: ['api', 'auth'],
          ruleStatus: 'active',
        },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.upsertRule).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        expect.objectContaining({
          id: 'rule-security-auth',
          name: 'Authentication Required',
          type: 'rule',
          created: '2024-12-10',
          content: 'All API endpoints must authenticate',
          triggers: ['api', 'auth'],
          status: 'active',
        }),
        'main',
      );

      expect(result).toEqual({
        success: true,
        message: 'rule rule-security-auth created successfully',
        entity: expect.any(Object),
      });
    });

    it('should create a file successfully', async () => {
      const params = {
        operation: 'create',
        entityType: 'file',
        repository: 'test-repo',
        branch: 'main',
        id: 'file-auth-service-ts',
        data: {
          name: 'auth.service.ts',
          path: 'src/services/auth.service.ts',
          language: 'typescript',
          size_bytes: 5432,
        },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.addFile).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        expect.objectContaining({
          id: 'file-auth-service-ts',
          name: 'auth.service.ts',
          type: 'file',
          path: 'src/services/auth.service.ts',
          language: 'typescript',
          size_bytes: 5432,
        }),
      );

      expect(result).toEqual({
        success: true,
        message: 'file file-auth-service-ts created successfully',
        entity: expect.any(Object),
      });
    });

    it('should create a tag successfully', async () => {
      const params = {
        operation: 'create',
        entityType: 'tag',
        repository: 'test-repo',
        branch: 'main',
        id: 'tag-critical',
        data: {
          name: 'Critical',
          color: '#ff0000',
          description: 'Critical components',
          category: 'security',
        },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.addTag).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        expect.objectContaining({
          id: 'tag-critical',
          name: 'Critical',
          type: 'tag',
          color: '#ff0000',
          description: 'Critical components',
          category: 'security',
        }),
      );

      expect(result).toEqual({
        success: true,
        message: 'tag tag-critical created successfully',
        entity: expect.any(Object),
      });
    });
  });

  describe('get operation', () => {
    it('should return not implemented for get operation', async () => {
      const params = {
        operation: 'get',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-AuthService',
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'Get operation not yet implemented for component',
      });
    });
  });

  describe('update operation', () => {
    it('should update a component using upsert', async () => {
      const params = {
        operation: 'update',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-AuthService',
        data: {
          name: 'Updated Auth Service',
          status: 'deprecated',
        },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.upsertComponent).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        expect.objectContaining({
          id: 'comp-AuthService',
          name: 'Updated Auth Service',
          status: 'deprecated',
        }),
      );

      expect(result).toEqual({
        success: true,
        message: 'component comp-AuthService updated successfully',
        entity: expect.any(Object),
      });
    });
  });

  describe('delete operation', () => {
    it('should return not implemented for delete operation', async () => {
      const params = {
        operation: 'delete',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-AuthService',
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'Delete operation not yet implemented for component',
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing session context', async () => {
      mockContext.session = {};

      const params = {
        operation: 'create',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-Test',
      };

      await expect(entityHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
        'No active session',
      );
    });

    it('should handle service errors gracefully', async () => {
      mockMemoryService.upsertComponent.mockRejectedValueOnce(new Error('Database error'));

      const params = {
        operation: 'create',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-Test',
        data: { name: 'Test' },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'Failed to create component: Database error',
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to create component: Database error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should validate required parameters', async () => {
      const params = {
        operation: 'create',
        // Missing entityType
        repository: 'test-repo',
        id: 'comp-Test',
      };

      await expect(entityHandler(params, mockContext, mockMemoryService)).rejects.toThrow();
    });
  });

  describe('progress reporting', () => {
    it('should report progress during create operation', async () => {
      const params = {
        operation: 'create',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-Test',
        data: { name: 'Test' },
      };

      await entityHandler(params, mockContext, mockMemoryService);

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'in_progress',
        message: 'Creating component: comp-Test',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'component comp-Test created successfully',
        percent: 100,
        isFinal: true,
      });
    });
  });
});