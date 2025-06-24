import { queryHandler } from '../../../mcp/services/handlers/unified/query-handler';
import { ToolHandlerContext } from '../../../mcp/types/sdk-custom';
import { ContextService } from '../../../services/domain/context.service';
import { GraphQueryService } from '../../../services/domain/graph-query.service';
import { MemoryService } from '../../../services/memory.service';

// Define discriminated union types for query results
type QueryResult =
  | { type: 'context'; contexts: any[] }
  | {
      type: 'entities';
      label: string;
      entities: any[];
      limit: number;
      offset: number;
      totalCount: number;
    }
  | {
      type: 'relationships';
      startItemId: string;
      relatedItems: any[];
      relationshipFilter?: string;
      depth?: number;
    }
  | {
      type: 'dependencies';
      componentId: string;
      direction: 'dependencies' | 'dependents';
      components: any[];
    }
  | { type: 'governance'; componentId: string; decisions: any[]; rules: any[] }
  | { type: 'history'; itemId: string; itemType: string; contextHistory: any[] }
  | { type: 'tags'; tagId: string; items: any[] };

// Test file for query tool - consolidates 7 query types
describe('Query Tool Tests', () => {
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockContextService: jest.Mocked<ContextService>;
  let mockGraphQueryService: jest.Mocked<GraphQueryService>;
  let mockContext: jest.Mocked<ToolHandlerContext>;

  beforeEach(() => {
    mockContextService = {
      getLatestContexts: jest.fn(),
    } as any;

    mockGraphQueryService = {
      listNodesByLabel: jest.fn(),
      getRelatedItems: jest.fn(),
      getComponentDependencies: jest.fn(),
      getComponentDependents: jest.fn(),
      getGoverningItemsForComponent: jest.fn(),
      getItemContextualHistory: jest.fn(),
      findItemsByTag: jest.fn(),
    } as any;

    mockMemoryService = {
      context: mockContextService,
      graphQuery: mockGraphQueryService,
      services: {
        context: mockContextService,
        graphQuery: mockGraphQueryService,
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

  describe('Context Query', () => {
    it('should retrieve contexts with default parameters', async () => {
      const mockContexts = [
        {
          id: 'ctx-1',
          name: 'ctx-1',
          iso_date: '2024-12-09',
          agent: 'test-agent',
          summary: 'Test summary',
          observation: null,
          repository: 'test-repo',
          branch: 'main',
          created_at: new Date('2024-12-09T10:00:00Z'),
          updated_at: new Date('2024-12-09T10:00:00Z'),
        },
      ];
      mockContextService.getLatestContexts.mockResolvedValue(mockContexts);

      const result = (await queryHandler(
        {
          type: 'context',
          repository: 'test-repo',
          branch: 'main',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'context') {
        expect(result.type).toBe('context');
        expect(result.contexts).toHaveLength(1);
        expect(result.contexts[0].id).toBe('ctx-1');
      } else {
        fail('Expected result type to be context');
      }
      expect(mockContextService.getLatestContexts).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        'test-repo',
        'main',
        undefined,
      );
    });

    it('should retrieve contexts with limit', async () => {
      mockContextService.getLatestContexts.mockResolvedValue([]);

      await queryHandler(
        {
          type: 'context',
          repository: 'test-repo',
          limit: 5,
        },
        mockContext,
        mockMemoryService,
      );

      expect(mockContextService.getLatestContexts).toHaveBeenCalledWith(
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
        type: 'entities' as const,
        label: 'Component',
        entities: [
          { id: 'comp-1', name: 'Component 1' },
          { id: 'comp-2', name: 'Component 2' },
        ],
        limit: 100,
        offset: 0,
        totalCount: 2,
      };
      mockGraphQueryService.listNodesByLabel.mockResolvedValue(mockResult);

      const result = (await queryHandler(
        {
          type: 'entities',
          repository: 'test-repo',
          label: 'Component',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'entities') {
        expect(result.type).toBe('entities');
        expect(result.label).toBe('Component');
        expect(result.entities).toHaveLength(2);
        expect(result.totalCount).toBe(2);
      } else {
        fail('Expected result type to be entities');
      }
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
      ).rejects.toThrow('Required fields missing for the specified query type');
    });
  });

  describe('Relationships Query', () => {
    it('should find related items', async () => {
      const mockResult = {
        startItemId: 'comp-1',
        relatedItems: [
          { id: 'comp-2', type: 'Component' },
          { id: 'rule-1', type: 'Rule' },
        ],
      };
      mockGraphQueryService.getRelatedItems.mockResolvedValue(mockResult as any);

      const result = (await queryHandler(
        {
          type: 'relationships',
          repository: 'test-repo',
          startItemId: 'comp-1',
          depth: 2,
          relationshipFilter: 'DEPENDS_ON',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'relationships') {
        expect(result.type).toBe('relationships');
        expect(result.startItemId).toBe('comp-1');
        expect(result.relatedItems).toHaveLength(2);
        expect(result.depth).toBe(2);
      } else {
        fail('Expected result type to be relationships');
      }
      expect(mockGraphQueryService.getRelatedItems).toHaveBeenCalledWith(
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
      ).rejects.toThrow('Required fields missing for the specified query type');
    });
  });

  describe('Dependencies Query', () => {
    it('should get component dependencies', async () => {
      const mockResult = {
        componentId: 'comp-1',
        dependencies: [{ id: 'comp-2', name: 'Component 2', type: 'Component' }],
      };
      mockGraphQueryService.getComponentDependencies.mockResolvedValue(mockResult as any);

      const result = (await queryHandler(
        {
          type: 'dependencies',
          repository: 'test-repo',
          componentId: 'comp-1',
          direction: 'dependencies',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'dependencies') {
        expect(result.type).toBe('dependencies');
        expect(result.componentId).toBe('comp-1');
        expect(result.direction).toBe('dependencies');
        expect(result.components).toHaveLength(1);
      } else {
        fail('Expected result type to be dependencies');
      }
      expect(mockGraphQueryService.getComponentDependencies).toHaveBeenCalled();
    });

    it('should get component dependents', async () => {
      const mockResult = {
        componentId: 'comp-1',
        dependents: [{ id: 'comp-3', name: 'Component 3', type: 'Component' }],
      };
      mockGraphQueryService.getComponentDependents.mockResolvedValue(mockResult as any);

      const result = (await queryHandler(
        {
          type: 'dependencies',
          repository: 'test-repo',
          componentId: 'comp-1',
          direction: 'dependents',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'dependencies') {
        expect(result.type).toBe('dependencies');
        expect(result.direction).toBe('dependents');
        expect(result.components).toHaveLength(1);
      } else {
        fail('Expected result type to be dependencies');
      }
      expect(mockGraphQueryService.getComponentDependents).toHaveBeenCalled();
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
      ).rejects.toThrow(); // Zod validation error for missing direction
    });
  });

  describe('Governance Query', () => {
    it('should get governing items for component', async () => {
      const mockResult = {
        componentId: 'comp-1',
        decisions: [{ id: 'dec-1', name: 'Decision 1' }],
        rules: [{ id: 'rule-1', name: 'Rule 1' }],
      };
      mockGraphQueryService.getGoverningItemsForComponent.mockResolvedValue(mockResult as any);

      const result = (await queryHandler(
        {
          type: 'governance',
          repository: 'test-repo',
          componentId: 'comp-1',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'governance') {
        expect(result.type).toBe('governance');
        expect(result.componentId).toBe('comp-1');
        expect(result.decisions).toHaveLength(1);
        expect(result.rules).toHaveLength(1);
      } else {
        fail('Expected result type to be governance');
      }
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
      ).rejects.toThrow('Required fields missing for the specified query type');
    });
  });

  describe('History Query', () => {
    it('should get item contextual history', async () => {
      const mockResult = {
        itemId: 'comp-1',
        itemType: 'Component',
        contextHistory: [
          { id: 'ctx-1', summary: 'Created component' },
          { id: 'ctx-2', summary: 'Updated component' },
        ],
      };
      mockGraphQueryService.getItemContextualHistory.mockResolvedValue(mockResult as any);

      const result = (await queryHandler(
        {
          type: 'history',
          repository: 'test-repo',
          itemId: 'comp-1',
          itemType: 'Component',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'history') {
        expect(result.type).toBe('history');
        expect(result.itemId).toBe('comp-1');
        expect(result.itemType).toBe('Component');
        expect(result.contextHistory).toHaveLength(2);
      } else {
        fail('Expected result type to be history');
      }
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
      ).rejects.toThrow('Required fields missing for the specified query type');
    });
  });

  describe('Tags Query', () => {
    it('should find items by tag', async () => {
      const mockResult = {
        type: 'tags' as const,
        tagId: 'tag-security',
        items: [
          { id: 'comp-1', type: 'Component' },
          { id: 'rule-1', type: 'Rule' },
        ],
      };
      mockGraphQueryService.findItemsByTag.mockResolvedValue(mockResult);

      const result = (await queryHandler(
        {
          type: 'tags',
          repository: 'test-repo',
          tagId: 'tag-security',
        },
        mockContext,
        mockMemoryService,
      )) as QueryResult;

      if (result.type === 'tags') {
        expect(result.type).toBe('tags');
        expect(result.tagId).toBe('tag-security');
        expect(result.items).toHaveLength(2);
        expect(result.items[0].type).toBe('Component');
      } else {
        fail('Expected result type to be tags');
      }
    });

    it('should find items by tag with entity type filter', async () => {
      const mockResult = {
        type: 'tags' as const,
        tagId: 'tag-security',
        items: [{ id: 'comp-1', type: 'Component' }],
      };
      mockGraphQueryService.findItemsByTag.mockResolvedValue(mockResult);

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

      expect(mockGraphQueryService.findItemsByTag).toHaveBeenCalledWith(
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
      ).rejects.toThrow('Required fields missing for the specified query type');
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
      mockContextService.getLatestContexts.mockRejectedValue(error);

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
      ).rejects.toThrow(
        "Invalid enum value. Expected 'context' | 'entities' | 'relationships' | 'dependencies' | 'governance' | 'history' | 'tags', received 'unknown'",
      );
    });
  });
});
