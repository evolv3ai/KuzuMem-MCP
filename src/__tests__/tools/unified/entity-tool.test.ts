import { entityHandler } from '../../../mcp/services/handlers/unified/entity-handler';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import { MemoryService } from '../../../services/memory.service';

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
      getComponent: jest.fn(),
      getDecision: jest.fn(),
      getRule: jest.fn(),
      getFile: jest.fn(),
      getTag: jest.fn(),
      updateComponent: jest.fn(),
      updateDecision: jest.fn(),
      updateRule: jest.fn(),
      updateFile: jest.fn(),
      updateTag: jest.fn(),
      deleteComponent: jest.fn(),
      deleteDecision: jest.fn(),
      deleteRule: jest.fn(),
      deleteFile: jest.fn(),
      deleteTag: jest.fn(),
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
          path: 'src/services/auth.service.ts',
          size: 5432, // Updated to match File interface
          mime_type: undefined,
          content: undefined,
          metrics: undefined,
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
    it('should get a component successfully', async () => {
      const mockComponent = {
        id: 'comp-AuthService',
        name: 'Auth Service',
        type: 'component' as const,
        kind: 'service',
        status: 'active' as const,
        depends_on: ['comp-Database'],
        repository: 'test-repo:main',
        branch: 'main',
      };
      mockMemoryService.getComponent.mockResolvedValueOnce(mockComponent);

      const params = {
        operation: 'get',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-AuthService',
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.getComponent).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'comp-AuthService',
      );

      expect(result).toEqual({
        success: true,
        entity: mockComponent,
      });
    });

    it('should handle not found entity', async () => {
      mockMemoryService.getDecision.mockResolvedValueOnce(null);

      const params = {
        operation: 'get',
        entityType: 'decision',
        repository: 'test-repo',
        branch: 'main',
        id: 'dec-20241210-missing',
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'decision with ID dec-20241210-missing not found',
      });
    });
  });

  describe('update operation', () => {
    it('should update a component successfully', async () => {
      const updatedComponent = {
        id: 'comp-AuthService',
        name: 'Updated Auth Service',
        type: 'component' as const,
        kind: 'service',
        status: 'deprecated' as const,
        depends_on: ['comp-Database'],
        repository: 'test-repo:main',
        branch: 'main',
      };
      mockMemoryService.updateComponent.mockResolvedValueOnce(updatedComponent);

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

      expect(mockMemoryService.updateComponent).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'comp-AuthService',
        expect.objectContaining({
          name: 'Updated Auth Service',
          status: 'deprecated',
        }),
      );

      expect(result).toEqual({
        success: true,
        message: 'component comp-AuthService updated successfully',
        entity: updatedComponent,
      });
    });

    it('should handle update of non-existent entity', async () => {
      mockMemoryService.updateRule.mockResolvedValueOnce(null);

      const params = {
        operation: 'update',
        entityType: 'rule',
        repository: 'test-repo',
        branch: 'main',
        id: 'rule-missing',
        data: {
          name: 'Updated Rule',
        },
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'rule with ID rule-missing not found for update',
      });
    });
  });

  describe('delete operation', () => {
    it('should delete a component successfully', async () => {
      mockMemoryService.deleteComponent.mockResolvedValueOnce(true);

      const params = {
        operation: 'delete',
        entityType: 'component',
        repository: 'test-repo',
        branch: 'main',
        id: 'comp-AuthService',
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.deleteComponent).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'comp-AuthService',
      );

      expect(result).toEqual({
        success: true,
        message: 'component comp-AuthService deleted successfully',
      });
    });

    it('should handle delete of non-existent entity', async () => {
      mockMemoryService.deleteFile.mockResolvedValueOnce(false);

      const params = {
        operation: 'delete',
        entityType: 'file',
        repository: 'test-repo',
        branch: 'main',
        id: 'file-missing',
      };

      const result = await entityHandler(params, mockContext, mockMemoryService);

      expect(result).toEqual({
        success: false,
        message: 'file with ID file-missing not found',
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
        message: 'Failed to execute create component: Database error',
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
