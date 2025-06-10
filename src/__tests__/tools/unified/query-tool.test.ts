import { queryHandler } from '../../../mcp/services/handlers/unified/query-handler';
import { MemoryService } from '../../../services/memory.service';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

// Test file for query tool - consolidates 7 query types
describe('Query Tool Tests', () => {
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockContext: jest.Mocked<EnrichedRequestHandlerExtra>;

  beforeEach(() => {
    mockMemoryService = {
      getLatestContexts: jest.fn(),
      listNodesByLabel: jest.fn(),
      getRelatedItems: jest.fn(),
      getComponentDependencies: jest.fn(),
      getComponentDependents: jest.fn(),
      getGoverningItemsForComponent: jest.fn(),
      getItemContextualHistory: jest.fn(),
      findItemsByTag: jest.fn(),
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

  describe('Context Query', () => {
    it('should retrieve contexts with default parameters', async () => {
      const mockContexts = [
        {
          id: 'ctx-1',
          iso_date: '2024-12-09',
          agent: 'test-agent',
          summary: 'Test summary',
          repository: 'test-repo',
          branch: 'main',
          created_at: '2024-12-09T10:00:00Z',
          updated_at: '2024-12-09T10:00:00Z',
        },
      ];
      mockMemoryService.getLatestContexts.mockResolvedValue(mockContexts);

      const result = await queryHandler(
        {
          type: 'context',
          repository: 'test-repo',
          branch: 'main',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('context');
      expect(result.contexts).toHaveLength(1);
      expect(result.contexts[0].id).toBe('ctx-1');
      expect(mockMemoryService.getLatestContexts).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        undefined,
      );
    });

    it('should retrieve contexts with limit', async () => {
      mockMemoryService.getLatestContexts.mockResolvedValue([]);

      await queryHandler(
        {
          type: 'context',
          repository: 'test-repo',
          limit: 5,
        },
        mockContext,
        mockMemoryService,
      );

      expect(mockMemoryService.getLatestContexts).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        5,
      );
    });
  });

  describe('Entities Query', () => {
    it('should list entities by label', async () => {
      const mockResult = {
        label: 'Component',
        nodes: [
          { id: 'comp-1', name: 'Component 1' },
          { id: 'comp-2', name: 'Component 2' },
        ],
        limit: 100,
        offset: 0,
        totalInLabel: 2,
      };
      mockMemoryService.listNodesByLabel.mockResolvedValue(mockResult);

      const result = await queryHandler(
        {
          type: 'entities',
          repository: 'test-repo',
          label: 'Component',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('entities');
      expect(result.label).toBe('Component');
      expect(result.entities).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it('should throw error if label is missing', async () => {
      await expect(
        queryHandler(
          {
            type: 'entities',
            repository: 'test-repo',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Label is required for entities query');
    });
  });

  describe('Relationships Query', () => {
    it('should find related items', async () => {
      const mockResult = {
        status: 'complete',
        relatedItems: [
          { id: 'comp-2', type: 'Component' },
          { id: 'rule-1', type: 'Rule' },
        ],
      };
      mockMemoryService.getRelatedItems.mockResolvedValue(mockResult as any);

      const result = await queryHandler(
        {
          type: 'relationships',
          repository: 'test-repo',
          startItemId: 'comp-1',
          depth: 2,
          relationshipFilter: 'DEPENDS_ON',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('relationships');
      expect(result.startItemId).toBe('comp-1');
      expect(result.relatedItems).toHaveLength(2);
      expect(result.depth).toBe(2);
      expect(mockMemoryService.getRelatedItems).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'comp-1',
        {
          depth: 2,
          relationshipFilter: 'DEPENDS_ON',
          targetNodeTypeFilter: undefined,
        },
      );
    });

    it('should throw error if startItemId is missing', async () => {
      await expect(
        queryHandler(
          {
            type: 'relationships',
            repository: 'test-repo',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('startItemId is required for relationships query');
    });
  });

  describe('Dependencies Query', () => {
    it('should get component dependencies', async () => {
      const mockResult = {
        status: 'complete',
        dependencies: [{ id: 'comp-2', name: 'Component 2', type: 'Component' }],
      };
      mockMemoryService.getComponentDependencies.mockResolvedValue(mockResult as any);

      const result = await queryHandler(
        {
          type: 'dependencies',
          repository: 'test-repo',
          componentId: 'comp-1',
          direction: 'dependencies',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('dependencies');
      expect(result.componentId).toBe('comp-1');
      expect(result.direction).toBe('dependencies');
      expect(result.components).toHaveLength(1);
      expect(mockMemoryService.getComponentDependencies).toHaveBeenCalled();
    });

    it('should get component dependents', async () => {
      const mockResult = {
        status: 'complete',
        dependents: [{ id: 'comp-3', name: 'Component 3', type: 'Component' }],
      };
      mockMemoryService.getComponentDependents.mockResolvedValue(mockResult as any);

      const result = await queryHandler(
        {
          type: 'dependencies',
          repository: 'test-repo',
          componentId: 'comp-1',
          direction: 'dependents',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('dependencies');
      expect(result.direction).toBe('dependents');
      expect(result.components).toHaveLength(1);
      expect(mockMemoryService.getComponentDependents).toHaveBeenCalled();
    });

    it('should throw error if componentId or direction is missing', async () => {
      await expect(
        queryHandler(
          {
            type: 'dependencies',
            repository: 'test-repo',
            componentId: 'comp-1',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('componentId and direction are required');
    });
  });

  describe('Governance Query', () => {
    it('should get governing items for component', async () => {
      const mockResult = {
        status: 'complete',
        decisions: [{ id: 'dec-1', name: 'Decision 1' }],
        rules: [{ id: 'rule-1', name: 'Rule 1' }],
      };
      mockMemoryService.getGoverningItemsForComponent.mockResolvedValue(mockResult as any);

      const result = await queryHandler(
        {
          type: 'governance',
          repository: 'test-repo',
          componentId: 'comp-1',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('governance');
      expect(result.componentId).toBe('comp-1');
      expect(result.decisions).toHaveLength(1);
      expect(result.rules).toHaveLength(1);
    });

    it('should throw error if componentId is missing', async () => {
      await expect(
        queryHandler(
          {
            type: 'governance',
            repository: 'test-repo',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('componentId is required for governance query');
    });
  });

  describe('History Query', () => {
    it('should get item contextual history', async () => {
      const mockResult = {
        status: 'complete',
        contextHistory: [
          { id: 'ctx-1', summary: 'Created component' },
          { id: 'ctx-2', summary: 'Updated component' },
        ],
      };
      mockMemoryService.getItemContextualHistory.mockResolvedValue(mockResult as any);

      const result = await queryHandler(
        {
          type: 'history',
          repository: 'test-repo',
          itemId: 'comp-1',
          itemType: 'Component',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('history');
      expect(result.itemId).toBe('comp-1');
      expect(result.itemType).toBe('Component');
      expect(result.contextHistory).toHaveLength(2);
    });

    it('should throw error if itemId or itemType is missing', async () => {
      await expect(
        queryHandler(
          {
            type: 'history',
            repository: 'test-repo',
            itemId: 'comp-1',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('itemId and itemType are required for history query');
    });
  });

  describe('Tags Query', () => {
    it('should find items by tag', async () => {
      const mockResult = {
        tagId: 'tag-security',
        items: [
          { id: 'comp-1', type: 'Component' },
          { id: 'rule-1', type: 'Rule' },
        ],
      };
      mockMemoryService.findItemsByTag.mockResolvedValue(mockResult);

      const result = await queryHandler(
        {
          type: 'tags',
          repository: 'test-repo',
          tagId: 'tag-security',
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('tags');
      expect(result.tagId).toBe('tag-security');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].type).toBe('Component');
    });

    it('should find items by tag with entity type filter', async () => {
      const mockResult = {
        tagId: 'tag-security',
        items: [{ id: 'comp-1', type: 'Component' }],
      };
      mockMemoryService.findItemsByTag.mockResolvedValue(mockResult);

      await queryHandler(
        {
          type: 'tags',
          repository: 'test-repo',
          tagId: 'tag-security',
          entityType: 'Component',
        },
        mockContext,
        mockMemoryService,
      );

      expect(mockMemoryService.findItemsByTag).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        'tag-security',
        'Component',
      );
    });

    it('should throw error if tagId is missing', async () => {
      await expect(
        queryHandler(
          {
            type: 'tags',
            repository: 'test-repo',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('tagId is required for tags query');
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
        queryHandler(
          {
            type: 'context',
            repository: 'test-repo',
          },
          contextNoSession,
          mockMemoryService,
        ),
      ).rejects.toThrow('No active session');
    });
  });

  describe('Error Handling', () => {
    it('should handle and rethrow service errors', async () => {
      const error = new Error('Service error');
      mockMemoryService.getLatestContexts.mockRejectedValue(error);

      await expect(
        queryHandler(
          {
            type: 'context',
            repository: 'test-repo',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Service error');

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to execute context query: Service error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should throw error for unknown query type', async () => {
      await expect(
        queryHandler(
          {
            type: 'unknown' as any,
            repository: 'test-repo',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow("Invalid enum value. Expected 'context' | 'entities' | 'relationships' | 'dependencies' | 'governance' | 'history' | 'tags', received 'unknown'");
    });
  });
});