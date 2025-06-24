import { memoryBankHandler } from '../../../mcp/services/handlers/unified/memory-bank-handler';
import { memoryBankTool } from '../../../mcp/tools/unified/memory-bank-tool';
import { ToolHandlerContext } from '../../../mcp/types/sdk-custom';
import { MemoryBankService } from '../../../services/domain/memory-bank.service';
import { MetadataService } from '../../../services/domain/metadata.service';
import { MemoryService } from '../../../services/memory.service';

describe('Unified Memory Bank Tool', () => {
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockMemoryBankService: jest.Mocked<MemoryBankService>;
  let mockMetadataService: jest.Mocked<MetadataService>;
  let mockContext: jest.Mocked<ToolHandlerContext>;

  beforeEach(() => {
    // Mock Services
    mockMemoryBankService = {
      initMemoryBank: jest.fn(),
    } as any;

    mockMetadataService = {
      getMetadata: jest.fn(),
      updateMetadata: jest.fn(),
    } as any;

    mockMemoryService = {
      memoryBank: mockMemoryBankService,
      metadata: mockMetadataService,
      services: {
        memoryBank: mockMemoryBankService,
        metadata: mockMetadataService,
      },
    } as any;

    // Mock context
    mockContext = {
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
  });

  describe('Tool Definition', () => {
    it('should have correct name and parameters', () => {
      expect(memoryBankTool.name).toBe('memory-bank');
      expect(memoryBankTool.parameters.properties.operation.enum).toEqual([
        'init',
        'get-metadata',
        'update-metadata',
      ]);
      expect(memoryBankTool.parameters.required).toEqual(['operation', 'repository']);
    });

    it('should have proper annotations', () => {
      expect(memoryBankTool.annotations.readOnlyHint).toBe(false);
      expect(memoryBankTool.annotations.idempotentHint).toBe(true);
    });
  });

  describe('Handler', () => {
    describe('init operation', () => {
      it('should handle valid init request', async () => {
        const params = {
          operation: 'init',
          clientProjectRoot: '/test/project',
          repository: 'test-repo',
          branch: 'main',
        };

        mockMemoryBankService.initMemoryBank.mockResolvedValue({
          success: true,
          message: 'Memory bank initialized',
          path: '/test/project/.kuzu',
        });

        const result = await memoryBankHandler(params, mockContext, mockMemoryService);

        expect(mockContext.session.clientProjectRoot).toBe('/test/project');
        expect(mockContext.session.repository).toBe('test-repo');
        expect(mockContext.session.branch).toBe('main');
        expect(mockMemoryBankService.initMemoryBank).toHaveBeenCalledWith(
          mockContext,
          '/test/project',
          'test-repo',
          'main',
        );
        expect(result).toEqual({
          success: true,
          message: 'Memory bank initialized',
          path: '/test/project/.kuzu',
        });
      });

      it('should require clientProjectRoot for init', async () => {
        const params = {
          operation: 'init',
          repository: 'test-repo',
          branch: 'main',
        };

        await expect(memoryBankHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
          'clientProjectRoot is required for init operation',
        );
      });
    });

    describe('get-metadata operation', () => {
      beforeEach(() => {
        // Set up session as if init was called
        mockContext.session.clientProjectRoot = '/test/project';
        mockContext.session.repository = 'test-repo';
        mockContext.session.branch = 'main';
      });

      it('should handle valid get-metadata request', async () => {
        const params = {
          operation: 'get-metadata',
          repository: 'test-repo',
          branch: 'main',
        };

        const mockMetadata = {
          id: 'meta',
          project: { name: 'Test Project', created: '2024-01-01' },
          tech_stack: {},
          architecture: 'microservices',
          memory_spec_version: '1.0',
        };

        mockMetadataService.getMetadata.mockResolvedValue(mockMetadata);

        const result = await memoryBankHandler(params, mockContext, mockMemoryService);

        expect(mockMetadataService.getMetadata).toHaveBeenCalledWith(
          mockContext,
          '/test/project',
          'test-repo',
          'main',
        );
        expect(result).toEqual(mockMetadata);
      });

      it('should throw error when metadata not found', async () => {
        const params = {
          operation: 'get-metadata',
          repository: 'test-repo',
          branch: 'main',
        };

        mockMetadataService.getMetadata.mockResolvedValue(null);

        await expect(memoryBankHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
          "Metadata not found for repository 'test-repo' on branch 'main'.",
        );
      });
    });

    describe('update-metadata operation', () => {
      beforeEach(() => {
        // Set up session as if init was called
        mockContext.session.clientProjectRoot = '/test/project';
        mockContext.session.repository = 'test-repo';
        mockContext.session.branch = 'main';
      });

      it('should handle valid update-metadata request', async () => {
        const params = {
          operation: 'update-metadata',
          repository: 'test-repo',
          branch: 'main',
          metadata: {
            id: 'meta',
            project: { name: 'Updated Project', created: '2024-01-01' },
            tech_stack: { language: 'TypeScript', framework: 'Node.js' },
            architecture: 'serverless',
            memory_spec_version: '1.0',
          },
        };

        mockMetadataService.updateMetadata.mockResolvedValue({
          success: true,
          message: 'Metadata updated successfully',
        });

        const result = await memoryBankHandler(params, mockContext, mockMemoryService);

        expect(mockMetadataService.updateMetadata).toHaveBeenCalledWith(
          mockContext,
          '/test/project',
          'test-repo',
          params.metadata,
          'main',
        );
        expect(result).toEqual({
          success: true,
          message: 'Metadata updated successfully',
        });
      });

      it('should require metadata field for update', async () => {
        const params = {
          operation: 'update-metadata',
          repository: 'test-repo',
          branch: 'main',
        };

        await expect(memoryBankHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
          'metadata field is required for update-metadata operation',
        );
      });
    });

    describe('session validation', () => {
      it('should require init before other operations', async () => {
        const params = {
          operation: 'get-metadata',
          repository: 'test-repo',
          branch: 'main',
        };

        await expect(memoryBankHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
          "Session not properly initialized for tool 'memory-bank'",
        );
      });
    });
  });
});
