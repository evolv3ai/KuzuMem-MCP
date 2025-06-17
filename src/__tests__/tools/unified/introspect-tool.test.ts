import { introspectHandler } from '../../../mcp/services/handlers/unified/introspect-handler';
import { MemoryService } from '../../../services/memory.service';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

describe('introspect tool handler', () => {
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
      listAllNodeLabels: jest.fn(),
      countNodesByLabel: jest.fn(),
      getNodeProperties: jest.fn(),
      listAllIndexes: jest.fn(),
    } as unknown as jest.Mocked<MemoryService>;
  });

  describe('labels query', () => {
    it('should list all node labels successfully', async () => {
      const mockLabels = {
        labels: ['Component', 'Decision', 'Rule', 'File', 'Tag'],
        status: 'complete' as const,
        message: 'Successfully fetched 5 node labels.',
      };
      mockMemoryService.listAllNodeLabels.mockResolvedValueOnce(mockLabels);

      const params = {
        query: 'labels',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.listAllNodeLabels).toHaveBeenCalledWith(
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
      mockMemoryService.countNodesByLabel.mockResolvedValueOnce(mockCount);

      const params = {
        query: 'count',
        repository: 'test-repo',
        branch: 'main',
        target: 'Component',
      };

      const result = await introspectHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.countNodesByLabel).toHaveBeenCalledWith(
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

      await expect(introspectHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
        'Target label is required for count query',
      );
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
      mockMemoryService.getNodeProperties.mockResolvedValueOnce(mockProperties);

      const params = {
        query: 'properties',
        repository: 'test-repo',
        branch: 'main',
        target: 'Component',
      };

      const result = await introspectHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.getNodeProperties).toHaveBeenCalledWith(
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

      await expect(introspectHandler(params, mockContext, mockMemoryService)).rejects.toThrow(); // Zod validation error
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
      mockMemoryService.listAllIndexes.mockResolvedValueOnce(mockIndexes);

      const params = {
        query: 'indexes',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(params, mockContext, mockMemoryService);

      expect(mockMemoryService.listAllIndexes).toHaveBeenCalledWith(
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
      mockMemoryService.listAllIndexes.mockResolvedValueOnce(mockIndexes);

      const params = {
        query: 'indexes',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(params, mockContext, mockMemoryService);

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

      await expect(introspectHandler(params, mockContext, mockMemoryService)).rejects.toThrow(
        'No active session for introspect tool',
      );
    });

    it('should handle service errors gracefully', async () => {
      mockMemoryService.listAllNodeLabels.mockRejectedValueOnce(new Error('Database error'));

      const params = {
        query: 'labels',
        repository: 'test-repo',
        branch: 'main',
      };

      const result = await introspectHandler(params, mockContext, mockMemoryService);

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

      const result = await introspectHandler(params, mockContext, mockMemoryService);

      // Unknown query types fall through to default case and return empty indexes
      expect(result).toEqual({
        indexes: [],
      });
    });
  });

  describe('progress reporting', () => {
    it('should report progress during operations', async () => {
      mockMemoryService.countNodesByLabel.mockResolvedValueOnce({
        label: 'Component',
        count: 10,
      });

      const params = {
        query: 'count',
        repository: 'test-repo',
        branch: 'main',
        target: 'Component',
      };

      await introspectHandler(params, mockContext, mockMemoryService);

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
