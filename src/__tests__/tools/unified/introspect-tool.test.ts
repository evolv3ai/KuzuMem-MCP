import { introspectHandler } from '../../../mcp/services/handlers/unified/introspect-handler';
import { ToolHandlerContext } from '../../../mcp/types/sdk-custom';
import { GraphQueryService } from '../../../services/domain/graph-query.service';
import { MemoryService } from '../../../services/memory.service';
import { MockMemoryService } from '../../../tests/utils/sdk-test-utils';

describe('introspect tool handler', () => {
  let mockContext: ToolHandlerContext;
  let mockMemoryService: MockMemoryService;
  let mockGraphQueryService: jest.Mocked<GraphQueryService>;

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

    mockGraphQueryService = {
      listAllNodeLabels: jest.fn(),
      countNodesByLabel: jest.fn(),
      getNodeProperties: jest.fn(),
      listAllIndexes: jest.fn(),
    } as unknown as jest.Mocked<GraphQueryService>;

    // Create mock memory service
    mockMemoryService = {
      graphQuery: mockGraphQueryService,
      services: {
        graphQuery: mockGraphQueryService,
      },
    } as MockMemoryService;
  });

  describe('labels query', () => {
    it('should list all node labels successfully', async () => {
      const mockLabels = {
        labels: ['Component', 'Decision', 'Rule', 'File', 'Tag'],
        status: 'complete' as const,
        message: 'Successfully fetched 5 node labels.',
      };
      mockGraphQueryService.listAllNodeLabels.mockResolvedValueOnce(mockLabels);

      const params = {
        query: 'labels',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(
        params,
        mockContext,
        mockMemoryService as unknown as MemoryService,
      );

      expect(mockGraphQueryService.listAllNodeLabels).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
      );

      expect(result).toEqual({
        labels: ['Component', 'Decision', 'Rule', 'File', 'Tag'],
        status: 'complete',
        message: 'Successfully fetched 5 node labels.',
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Found 5 node labels',
        percent: 100,
        isFinal: true,
      });
    });
  });

  describe('count query', () => {
    it('should count nodes by label successfully', async () => {
      const mockCount = {
        label: 'Component',
        count: 42,
      };
      mockGraphQueryService.countNodesByLabel.mockResolvedValueOnce(mockCount);

      const params = {
        query: 'count',
        repository: 'test-repo',
        branch: 'main',
        target: 'Component',
      };

      const result = await introspectHandler(
        params,
        mockContext,
        mockMemoryService as unknown as MemoryService,
      );

      expect(mockGraphQueryService.countNodesByLabel).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'Component',
      );

      expect(result).toEqual({
        label: 'Component',
        count: 42,
      });
    });

    it('should error when target is missing for count query', async () => {
      const params = {
        query: 'count',
        repository: 'test-repo',
        branch: 'main',
        // target missing
      };

      await expect(
        introspectHandler(params, mockContext, mockMemoryService as unknown as MemoryService),
      ).rejects.toThrow('Target label is required for count query');
    });
  });

  describe('properties query', () => {
    it('should get node properties successfully', async () => {
      const mockProperties = {
        label: 'Component',
        properties: [
          { name: 'id', type: 'STRING' },
          { name: 'name', type: 'STRING' },
          { name: 'kind', type: 'STRING' },
          { name: 'status', type: 'STRING' },
          { name: 'depends_on', type: 'LIST[STRING]' },
        ],
      };
      mockGraphQueryService.getNodeProperties.mockResolvedValueOnce(mockProperties);

      const params = {
        query: 'properties',
        repository: 'test-repo',
        branch: 'main',
        target: 'Component',
      };

      const result = await introspectHandler(
        params,
        mockContext,
        mockMemoryService as unknown as MemoryService,
      );

      expect(mockGraphQueryService.getNodeProperties).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'Component',
      );

      expect(result).toEqual(mockProperties);
    });

    it('should error when target is missing for properties query', async () => {
      const params = {
        query: 'properties',
        repository: 'test-repo',
        branch: 'main',
        // target missing
      };

      await expect(
        introspectHandler(params, mockContext, mockMemoryService as unknown as MemoryService),
      ).rejects.toThrow(); // Zod validation error
    });
  });

  describe('indexes query', () => {
    it('should list all indexes successfully', async () => {
      const mockIndexes = {
        indexes: [
          {
            name: 'Component_pkey',
            tableName: 'Component',
            propertyName: 'graph_unique_id',
            isPrimaryKey: true,
            indexType: 'BTREE',
          },
          {
            name: 'Decision_pkey',
            tableName: 'Decision',
            propertyName: 'graph_unique_id',
            isPrimaryKey: true,
            indexType: 'BTREE',
          },
        ],
      };
      mockGraphQueryService.listAllIndexes.mockResolvedValueOnce(mockIndexes);

      const params = {
        query: 'indexes',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(
        params,
        mockContext,
        mockMemoryService as unknown as MemoryService,
      );

      expect(mockGraphQueryService.listAllIndexes).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        undefined,
      );

      expect(result).toEqual({
        indexes: [
          {
            name: 'Component_pkey',
            tableName: 'Component',
            propertyName: 'graph_unique_id',
            isPrimaryKey: true,
            indexType: 'BTREE',
          },
          {
            name: 'Decision_pkey',
            tableName: 'Decision',
            propertyName: 'graph_unique_id',
            isPrimaryKey: true,
            indexType: 'BTREE',
          },
        ],
      });
    });

    it('should handle indexes with missing optional fields', async () => {
      const mockIndexes = {
        indexes: [
          {
            name: 'SomeIndex',
            tableName: 'SomeTable',
            propertyName: 'some_prop',
            isPrimaryKey: false,
            indexType: 'INDEX',
          },
        ],
      };
      mockGraphQueryService.listAllIndexes.mockResolvedValueOnce(mockIndexes);

      const params = {
        query: 'indexes',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(
        params,
        mockContext,
        mockMemoryService as unknown as MemoryService,
      );

      expect(result).toEqual({
        indexes: [
          {
            name: 'SomeIndex',
            tableName: 'SomeTable',
            propertyName: 'some_prop',
            isPrimaryKey: false,
            indexType: 'INDEX',
          },
        ],
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing session context', async () => {
      mockContext.session = {};

      const params = {
        query: 'labels',
        repository: 'test-repo',
        branch: 'main',
      };

      await expect(
        introspectHandler(params, mockContext, mockMemoryService as unknown as MemoryService),
      ).rejects.toThrow('No active session for introspect tool');
    });

    it('should handle service errors gracefully', async () => {
      mockGraphQueryService.listAllNodeLabels.mockRejectedValueOnce(new Error('Database error'));

      const params = {
        query: 'labels',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(
        params,
        mockContext,
        mockMemoryService as unknown as MemoryService,
      );

      expect(result).toEqual({
        labels: [],
        status: 'error' as const,
        message: 'Database error',
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to execute labels introspect query: Database error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should handle unknown query type', async () => {
      const params = {
        query: 'unknown',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(
        params,
        mockContext,
        mockMemoryService as unknown as MemoryService,
      );

      // Unknown query types fall through to default case and return empty indexes
      expect(result).toEqual({
        indexes: [],
      });
    });
  });

  describe('progress reporting', () => {
    it('should report progress during operations', async () => {
      mockGraphQueryService.countNodesByLabel.mockResolvedValueOnce({
        label: 'Component',
        count: 10,
      });

      const params = {
        query: 'count',
        repository: 'test-repo',
        branch: 'main',
        target: 'Component',
      };

      await introspectHandler(params, mockContext, mockMemoryService as unknown as MemoryService);

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'in_progress',
        message: 'Counting nodes with label: Component',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Counted 10 nodes with label Component',
        percent: 100,
        isFinal: true,
      });
    });
  });
});
