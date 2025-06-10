import { detectHandler } from '../../../mcp/services/handlers/unified/detect-handler';
import { MemoryService } from '../../../services/memory.service';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

describe('Detect Tool Tests', () => {
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockContext: jest.Mocked<EnrichedRequestHandlerExtra>;

  beforeEach(() => {
    mockMemoryService = {
      getStronglyConnectedComponents: jest.fn(),
      getWeaklyConnectedComponents: jest.fn(),
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

  describe('Strongly Connected Components Detection', () => {
    it('should detect strongly connected components', async () => {
      const mockResult = {
        status: 'complete',
        results: {
          components: [
            { component_id: 0, nodes: ['comp-1', 'comp-2', 'comp-3'] },
            { component_id: 1, nodes: ['comp-4', 'comp-5'] },
          ],
        },
        message: 'Found circular dependencies',
      };
      mockMemoryService.getStronglyConnectedComponents.mockResolvedValue(mockResult);

      const result = await detectHandler(
        {
          type: 'strongly-connected',
          repository: 'test-repo',
          branch: 'main',
          projectedGraphName: 'circular-deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('strongly-connected');
      expect(result.status).toBe('complete');
      expect(result.components).toHaveLength(2);
      expect(result.components[0]).toEqual({
        componentId: 0,
        nodes: ['comp-1', 'comp-2', 'comp-3'],
      });
      expect(result.totalComponents).toBe(2);
      expect(mockMemoryService.getStronglyConnectedComponents).toHaveBeenCalledWith(
        mockContext,
        '/test/project',
        {
          repository: 'test-repo',
          branch: 'main',
          projectedGraphName: 'circular-deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
      );
    });

    it('should handle empty results', async () => {
      mockMemoryService.getStronglyConnectedComponents.mockResolvedValue({
        status: 'complete',
        results: { components: [] },
      });

      const result = await detectHandler(
        {
          type: 'strongly-connected',
          repository: 'test-repo',
          projectedGraphName: 'deps',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.components).toEqual([]);
      expect(result.totalComponents).toBe(0);
    });
  });

  describe('Weakly Connected Components Detection', () => {
    it('should detect weakly connected components', async () => {
      const mockResult = {
        status: 'complete',
        results: {
          components: [
            { component_id: 0, nodes: ['comp-1', 'comp-2'] },
            { component_id: 1, nodes: ['comp-3'] },
            { component_id: 2, nodes: ['comp-4', 'comp-5', 'comp-6'] },
          ],
        },
        message: 'Found isolated subsystems',
      };
      mockMemoryService.getWeaklyConnectedComponents.mockResolvedValue(mockResult);

      const result = await detectHandler(
        {
          type: 'weakly-connected',
          repository: 'test-repo',
          projectedGraphName: 'isolated-systems',
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('weakly-connected');
      expect(result.components).toHaveLength(3);
      expect(result.components[2]).toEqual({
        componentId: 2,
        nodes: ['comp-4', 'comp-5', 'comp-6'],
      });
      expect(result.totalComponents).toBe(3);
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
        detectHandler(
          {
            type: 'strongly-connected',
            repository: 'test-repo',
            projectedGraphName: 'deps',
            nodeTableNames: ['Component'],
            relationshipTableNames: ['DEPENDS_ON'],
          },
          contextNoSession,
          mockMemoryService,
        ),
      ).rejects.toThrow('No active session');
    });
  });

  describe('Error Handling', () => {
    it('should handle and rethrow service errors', async () => {
      const error = new Error('Detection service error');
      mockMemoryService.getStronglyConnectedComponents.mockRejectedValue(error);

      await expect(
        detectHandler(
          {
            type: 'strongly-connected',
            repository: 'test-repo',
            projectedGraphName: 'deps',
            nodeTableNames: ['Component'],
            relationshipTableNames: ['DEPENDS_ON'],
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('Detection service error');

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to execute strongly-connected detection: Detection service error',
        percent: 100,
        isFinal: true,
      });
    });

    it('should throw error for unknown detection type', async () => {
      await expect(
        detectHandler(
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
    it('should report progress for strongly connected detection', async () => {
      mockMemoryService.getStronglyConnectedComponents.mockResolvedValue({
        status: 'complete',
        results: { components: [] },
      });

      await detectHandler(
        {
          type: 'strongly-connected',
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
        message: 'Detecting strongly connected components (circular dependencies)...',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Found 0 strongly connected components',
        percent: 100,
        isFinal: true,
      });
    });

    it('should report progress for weakly connected detection', async () => {
      mockMemoryService.getWeaklyConnectedComponents.mockResolvedValue({
        status: 'complete',
        results: { components: [] },
      });

      await detectHandler(
        {
          type: 'weakly-connected',
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
        message: 'Detecting weakly connected components (isolated subsystems)...',
        percent: 50,
      });

      expect(mockContext.sendProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Found 0 weakly connected components',
        percent: 100,
        isFinal: true,
      });
    });
  });
});