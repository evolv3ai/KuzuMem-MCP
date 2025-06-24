import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { CoreService } from '../core/core.service';
import * as graphOps from '../memory-operations/graph.ops';
import { SnapshotService } from '../snapshot.service';

export class GraphAnalysisService extends CoreService {
  constructor(
    repositoryProvider: RepositoryProvider,
    getKuzuClient: (
      mcpContext: ToolHandlerContext,
      clientProjectRoot: string,
    ) => Promise<KuzuDBClient>,
    getSnapshotService: (
      mcpContext: ToolHandlerContext,
      clientProjectRoot: string,
    ) => Promise<SnapshotService>,
  ) {
    super(repositoryProvider, getKuzuClient, getSnapshotService);
  }
  async kCoreDecomposition(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.KCoreOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphAnalysisService.kCoreDecomposition] RepositoryProvider not initialized');
      return {
        type: 'k-core' as const,
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[GraphAnalysisService.kCoreDecomposition] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
        k: params.k || 2,
      };

      logger.debug(
        '[GraphAnalysisService.kCoreDecomposition] Calling graphOps.kCoreDecompositionOp with params:',
        {
          graphOpsParams,
        },
      );

      const algorithmResults = await graphOps.kCoreDecompositionOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info('[GraphAnalysisService.kCoreDecomposition] Algorithm completed successfully');
      return {
        type: 'k-core' as const,
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        nodes: algorithmResults.components.map((c: any) => ({
          id: c.nodeId,
          coreNumber: c.coreness,
        })),
        message: 'K-Core decomposition completed successfully',
      };
    } catch (error: any) {
      logger.error('[GraphAnalysisService.kCoreDecomposition] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'k-core' as const,
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: error.message || 'K-Core failed in GraphAnalysisService',
      };
    }
  }

  async louvainCommunityDetection(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.LouvainOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[GraphAnalysisService.louvainCommunityDetection] RepositoryProvider not initialized',
      );
      return {
        type: 'louvain' as const,
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      if (!kuzuClient) {
        logger.error(
          '[GraphAnalysisService.louvainCommunityDetection] KuzuDBClient not found after getKuzuClient call.',
        );
        throw new Error('KuzuDBClient not found for this project root.');
      }
      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
      };

      const algorithmResults = await graphOps.louvainCommunityDetectionOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        '[GraphAnalysisService.louvainCommunityDetection] Algorithm completed successfully',
      );
      return {
        type: 'louvain' as const,
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        nodes: algorithmResults.communities.map((c: any) => ({
          id: c.nodeId,
          communityId: c.communityId,
        })),
        message: 'Louvain community detection completed successfully',
      };
    } catch (error: any) {
      logger.error('[GraphAnalysisService.louvainCommunityDetection] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'louvain' as const,
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: error.message || 'Louvain failed in GraphAnalysisService',
      };
    }
  }

  async pageRank(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.PageRankOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphAnalysisService.pageRank] RepositoryProvider not initialized');
      return {
        type: 'pagerank',
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
        dampingFactor: params.damping,
        maxIterations: params.maxIterations,
      };

      logger.debug('[GraphAnalysisService.pageRank] Calling graphOps.pageRankOp with params:', {
        graphOpsParams,
      });

      const algorithmResults = await graphOps.pageRankOp(mcpContext, kuzuClient, graphOpsParams);

      logger.info('[GraphAnalysisService.pageRank] Algorithm completed successfully');
      return {
        type: 'pagerank',
        status: 'complete',
        projectedGraphName: params.projectedGraphName,
        nodes: algorithmResults.ranks.map((r: any) => ({ id: r.nodeId, pagerank: r.score })),
        message: 'PageRank algorithm completed successfully',
      };
    } catch (error: any) {
      logger.error('[GraphAnalysisService.pageRank] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'pagerank',
        status: 'error',
        nodes: [],
        projectedGraphName: params.projectedGraphName,
        message: error.message || 'Failed to compute PageRank',
      };
    }
  }

  async shortestPath(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.AnalyzeInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.ShortestPathOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphAnalysisService.shortestPath] RepositoryProvider not initialized');
      return {
        type: 'shortest-path',
        status: 'error',
        pathFound: false,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
        sourceNodeId: params.startNodeId,
        targetNodeId: params.endNodeId,
      };

      const algorithmResults = await graphOps.shortestPathOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info('[GraphAnalysisService.shortestPath] Algorithm completed successfully');
      return {
        type: 'shortest-path',
        status: 'complete',
        pathFound: algorithmResults.pathFound,
        path: algorithmResults.path,
        pathLength: algorithmResults.distance,
        message: algorithmResults.pathFound
          ? 'Shortest path found successfully'
          : 'No path found between nodes',
      };
    } catch (error: any) {
      logger.error('[GraphAnalysisService.shortestPath] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'shortest-path',
        status: 'error',
        pathFound: false,
        message: error.message || 'Shortest path algorithm failed',
      };
    }
  }

  async getStronglyConnectedComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.DetectInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.DetectOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[GraphAnalysisService.getStronglyConnectedComponents] RepositoryProvider not initialized',
      );
      return {
        type: 'strongly-connected' as const,
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
      };

      const algorithmResults = await graphOps.stronglyConnectedComponentsOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        '[GraphAnalysisService.getStronglyConnectedComponents] Algorithm completed successfully',
      );
      return {
        type: 'strongly-connected' as const,
        status: 'complete',
        components: algorithmResults.components,
        projectedGraphName: params.projectedGraphName,
        totalComponents: algorithmResults.components.length,
        message: 'Strongly Connected Components found successfully',
      };
    } catch (error: any) {
      logger.error('[GraphAnalysisService.getStronglyConnectedComponents] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'strongly-connected' as const,
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: error.message || 'Strongly Connected Components detection failed',
      };
    }
  }

  async getWeaklyConnectedComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.DetectInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.DetectOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[GraphAnalysisService.getWeaklyConnectedComponents] RepositoryProvider not initialized',
      );
      return {
        type: 'weakly-connected' as const,
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: 'RepositoryProvider not initialized',
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot: clientProjectRoot,
        repository: params.repository,
        branch: params.branch,
        projectedGraphName: params.projectedGraphName,
        nodeTableNames: params.nodeTableNames,
        relationshipTableNames: params.relationshipTableNames,
      };

      const algorithmResults = await graphOps.weaklyConnectedComponentsOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        '[GraphAnalysisService.getWeaklyConnectedComponents] Algorithm completed successfully',
      );
      return {
        type: 'weakly-connected' as const,
        status: 'complete',
        components: algorithmResults.components,
        projectedGraphName: params.projectedGraphName,
        totalComponents: algorithmResults.components.length,
        message: 'Weakly Connected Components found successfully',
      };
    } catch (error: any) {
      logger.error('[GraphAnalysisService.getWeaklyConnectedComponents] Error:', {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        type: 'weakly-connected' as const,
        status: 'error',
        components: [],
        projectedGraphName: params.projectedGraphName,
        totalComponents: 0,
        message: error.message || 'Weakly Connected Components detection failed',
      };
    }
  }
}
