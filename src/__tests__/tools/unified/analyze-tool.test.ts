import { analyzeHandler } from '../../../mcp/services/handlers/unified/analyze-handler';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import { MemoryService } from '../../../services/memory.service';

// Define discriminated union type for analyze handler results
type AnalyzeResult =
  | {
      type: 'pagerank';
      status: 'complete';
      projectedGraphName: string;
      nodes: Array<{ id: string; pagerank: number }>;
      message?: string;
    }
  | {
      type: 'shortest-path';
      status: 'complete';
      projectedGraphName: string;
      pathFound: boolean;
      path: string[];
      pathLength: number;
    }
  | {
      type: 'k-core';
      status: 'complete';
      projectedGraphName: string;
      nodes: Array<{ id: string; coreNumber: number }>;
      k: number;
    }
  | {
      type: 'louvain';
      status: 'complete';
      projectedGraphName: string;
      nodes: Array<{ id: string; communityId: number }>;
      modularity: number;
    };

describe('Analyze Tool Tests', () => {
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockContext: jest.Mocked<EnrichedRequestHandlerExtra>;

  beforeEach(() => {
    mockMemoryService = {
      pageRank: jest.fn(),
      shortestPath: jest.fn(),
      kCoreDecomposition: jest.fn(),
      louvainCommunityDetection: jest.fn(),
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

  describe('PageRank Analysis', () => {
    it('should run pagerank analysis', async () => {
      const mockResult = {
        type: 'pagerank' as const,
        status: 'complete',
        projectedGraphName: 'component-deps',
        nodes: [
          { id: 'comp-1', pagerank: 0.25 },
          { id: 'comp-2', pagerank: 0.15 },
        ],
        message: 'PageRank completed',
      };
      mockMemoryService.pageRank.mockResolvedValue(mockResult);

      const result = (await analyzeHandler(
        {
          type: 'pagerank',
          repository: 'test-repo',
          branch: 'main',
          projectedGraphName: 'component-deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
          damping: 0.85,
          maxIterations: 100,
        },
        mockContext,
        mockMemoryService,
      )) as AnalyzeResult;

      if (result.type === 'pagerank') {
        expect(result.type).toBe('pagerank');
        expect(result.status).toBe('complete');
        expect(result.nodes).toHaveLength(2);
        expect(result.nodes[0]).toEqual({ id: 'comp-1', pagerank: 0.25 });
      } else {
        fail('Expected result type to be pagerank');
      }
      expect(mockMemoryService.pageRank).toHaveBeenCalledWith(mockContext, '/test/project', {
        type: 'pagerank',
        repository: 'test-repo',
        branch: 'main',
        projectedGraphName: 'component-deps',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        damping: 0.85,
        maxIterations: 100,
      });
    });

    it('should use default parameters for pagerank', async () => {
      mockMemoryService.pageRank.mockResolvedValue({
        type: 'pagerank' as const,
        status: 'complete',
        projectedGraphName: 'deps',
        nodes: [],
      });

      await analyzeHandler(
        {
          type: 'pagerank',
          repository: 'test-repo',
          projectedGraphName: 'deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        mockContext,
        mockMemoryService,
      );

      expect(mockMemoryService.pageRank).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        expect.objectContaining({
          type: 'pagerank',
          damping: undefined,
          maxIterations: undefined,
        }),
      );
    });
  });

  describe('Shortest Path Analysis', () => {
    it('should find shortest path between nodes', async () => {
      const mockResult = {
        type: 'shortest-path' as const,
        status: 'complete',
        projectedGraphName: 'deps',
        pathFound: true,
        path: ['comp-1', 'comp-2', 'comp-3'],
        pathLength: 3,
      };
      mockMemoryService.shortestPath.mockResolvedValue(mockResult);

      const result = (await analyzeHandler(
        {
          type: 'shortest-path',
          repository: 'test-repo',
          projectedGraphName: 'deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
          startNodeId: 'comp-1',
          endNodeId: 'comp-3',
        },
        mockContext,
        mockMemoryService,
      )) as AnalyzeResult;

      if (result.type === 'shortest-path') {
        expect(result.type).toBe('shortest-path');
        expect(result.pathFound).toBe(true);
        expect(result.path).toEqual(['comp-1', 'comp-2', 'comp-3']);
        expect(result.pathLength).toBe(3);
      } else {
        fail('Expected result type to be shortest-path');
      }
    });

    it('should handle no path found', async () => {
      const mockResult = {
        type: 'shortest-path' as const,
        status: 'complete',
        projectedGraphName: 'deps',
        pathFound: false,
        path: [],
        pathLength: 0,
      };
      mockMemoryService.shortestPath.mockResolvedValue(mockResult);

      const result = (await analyzeHandler(
        {
          type: 'shortest-path',
          repository: 'test-repo',
          projectedGraphName: 'deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
          startNodeId: 'comp-1',
          endNodeId: 'comp-99',
        },
        mockContext,
        mockMemoryService,
      )) as AnalyzeResult;

      if (result.type === 'shortest-path') {
        expect(result.pathFound).toBe(false);
        expect(result.path).toEqual([]);
        expect(result.pathLength).toBe(0);
      } else {
        fail('Expected result type to be shortest-path');
      }
    });

    it('should throw error if start/end nodes missing', async () => {
      await expect(
        analyzeHandler(
          {
            type: 'shortest-path',
            repository: 'test-repo',
            projectedGraphName: 'deps',
            nodeTableNames: ['Component'],
            relationshipTableNames: ['DEPENDS_ON'],
            startNodeId: 'comp-1',
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow(); // Zod validation error for missing endNodeId
    });
  });

  describe('K-Core Analysis', () => {
    it('should run k-core decomposition', async () => {
      const mockResult = {
        type: 'k-core' as const,
        status: 'complete',
        projectedGraphName: 'deps',
        nodes: [
          { id: 'comp-1', coreNumber: 3 },
          { id: 'comp-2', coreNumber: 3 },
        ],
        k: 3,
      };
      mockMemoryService.kCoreDecomposition.mockResolvedValue(mockResult);

      const result = (await analyzeHandler(
        {
          type: 'k-core',
          repository: 'test-repo',
          projectedGraphName: 'deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
          k: 3,
        },
        mockContext,
        mockMemoryService,
      )) as AnalyzeResult;

      if (result.type === 'k-core') {
        expect(result.type).toBe('k-core');
        expect(result.nodes).toHaveLength(2);
        expect(result.nodes[0]).toEqual({ id: 'comp-1', coreNumber: 3 });
      } else {
        fail('Expected result type to be k-core');
      }
    });

    it('should throw error if k parameter missing', async () => {
      await expect(
        analyzeHandler(
          {
            type: 'k-core',
            repository: 'test-repo',
            projectedGraphName: 'deps',
            nodeTableNames: ['Component'],
            relationshipTableNames: ['DEPENDS_ON'],
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow(); // Zod validation error for missing k parameter
    });
  });

  describe('Louvain Community Detection', () => {
    it('should run community detection', async () => {
      const mockResult = {
        type: 'louvain' as const,
        status: 'complete',
        projectedGraphName: 'deps',
        nodes: [
          { id: 'comp-1', communityId: 0 },
          { id: 'comp-2', communityId: 0 },
          { id: 'comp-3', communityId: 1 },
        ],
        modularity: 0.42,
      };
      mockMemoryService.louvainCommunityDetection.mockResolvedValue(mockResult);

      const result = (await analyzeHandler(
        {
          type: 'louvain',
          repository: 'test-repo',
          projectedGraphName: 'deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        mockContext,
        mockMemoryService,
      )) as AnalyzeResult;

      if (result.type === 'louvain') {
        expect(result.type).toBe('louvain');
        expect(result.nodes).toHaveLength(3);
        expect(result.nodes[0]).toEqual({ id: 'comp-1', communityId: 0 });
        expect(result.nodes[2]).toEqual({ id: 'comp-3', communityId: 1 });
      } else {
        fail('Expected result type to be louvain');
      }
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
        analyzeHandler(
          {
            type: 'pagerank',
            repository: 'test-repo',
            projectedGraphName: 'deps',
            nodeTableNames: ['Component'],
            relationshipTableNames: ['DEPENDS_ON'],
          },
          contextNoSession,
          mockMemoryService,
        ),
      ).rejects.toThrow('No active session for analyze tool');
    });
  });

  describe('Error Handling', () => {
    it('should handle and rethrow service errors', async () => {
      const error = new Error('Analysis service error');
      mockMemoryService.pageRank.mockRejectedValue(error);

      await expect(
        analyzeHandler(
          {
            type: 'pagerank',
            repository: 'test-repo',
            projectedGraphName: 'deps',
            nodeTableNames: ['Component'],
            relationshipTableNames: ['DEPENDS_ON'],
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Analysis service error');

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to execute pagerank analysis: Analysis service error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should throw error for unknown analysis type', async () => {
      await expect(
        analyzeHandler(
          {
            type: 'unknown' as any,
            repository: 'test-repo',
            projectedGraphName: 'deps',
            nodeTableNames: ['Component'],
            relationshipTableNames: ['DEPENDS_ON'],
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow();
    });
  });

  describe('Progress Reporting', () => {
    it('should report progress for each analysis type', async () => {
      mockMemoryService.pageRank.mockResolvedValue({
        type: 'pagerank' as const,
        status: 'complete',
        projectedGraphName: 'deps',
        nodes: [],
      });

      await analyzeHandler(
        {
          type: 'pagerank',
          repository: 'test-repo',
          projectedGraphName: 'deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        mockContext,
        mockMemoryService,
      );

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'in_progress',
        message: 'Running PageRank analysis...',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'PageRank analysis complete. Found 0 nodes',
        percent: 100,
        isFinal: true,
      });
    });
  });
});
