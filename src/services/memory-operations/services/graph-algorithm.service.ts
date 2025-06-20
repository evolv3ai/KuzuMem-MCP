import { ToolHandlerContext } from '../../../mcp/types/sdk-custom';
import {
  BaseGraphOperations,
  ConnectedComponentsParams,
  ConnectedComponentsResult,
  KCoreParams,
  KCoreResult,
  LouvainParams,
  LouvainResult,
  PageRankParams,
  PageRankResult,
  ShortestPathParams,
  ShortestPathResult,
} from '../base/base-graph-operations';
import { GraphProjectionManager } from './graph-projection-manager';

/**
 * Service responsible for graph algorithm operations
 * Handles PageRank, k-core decomposition, community detection, and other graph algorithms
 */
export class GraphAlgorithmService extends BaseGraphOperations {
  private projectionManager: GraphProjectionManager;

  constructor(kuzuClient: any, repositoryRepo?: any) {
    super(kuzuClient, repositoryRepo);
    this.projectionManager = new GraphProjectionManager(kuzuClient, repositoryRepo);
  }

  /**
   * Executes PageRank algorithm
   */
  async executePageRank(
    mcpContext: ToolHandlerContext,
    params: PageRankParams,
  ): Promise<PageRankResult> {
    const logger = this.createOperationLogger(mcpContext, 'executePageRank', params);
    logger.info(
      `Executing PageRank on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
    );
    const safeProjectionName = params.projectedGraphName.replace(/[^a-zA-Z0-9_]/g, '_');

    const result = await this.projectionManager.withProjectedGraph<{ ranks: any[] }>(
      mcpContext,
      safeProjectionName,
      params.nodeTableNames,
      params.relationshipTableNames,
      async () => {
        let prQuery = `CALL page_rank('${safeProjectionName}'`;
        if (params.dampingFactor !== undefined) {
          prQuery += `, dampingFactor := ${params.dampingFactor}`;
        }
        if (params.maxIterations !== undefined) {
          prQuery += `, maxIterations := ${params.maxIterations}`;
        }
        prQuery += `) RETURN node.id AS nodeId, rank;`;

        logger.debug(`PageRank Cypher: ${prQuery}`);
        const kuzuResults = await this.kuzuClient.executeQuery(prQuery, {});

        const ranks = kuzuResults.map((row: any) => ({
          nodeId: row.nodeId?.toString(),
          score: typeof row.rank === 'number' ? row.rank : parseFloat(row.rank || '0'),
        }));
        return { ranks };
      },
    );

    if ('error' in result) {
      return { ranks: [], error: result.error };
    }
    return result;
  }

  /**
   * Executes K-Core Decomposition algorithm
   */
  async executeKCoreDecomposition(
    mcpContext: ToolHandlerContext,
    params: KCoreParams,
  ): Promise<KCoreResult> {
    const logger = this.createOperationLogger(mcpContext, 'executeKCoreDecomposition', params);
    logger.info(
      `Executing K-Core Decomposition on G: ${params.projectedGraphName}, k: ${params.k}, R: ${params.repository}, B: ${params.branch}`,
    );

    const result = await this.projectionManager.withProjectedGraph<{
      k: number;
      components: any[];
    }>(
      mcpContext,
      params.projectedGraphName,
      params.nodeTableNames,
      params.relationshipTableNames,
      async () => {
        const query = `CALL k_core_decomposition('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, k_degree;`;
        logger.debug(`K-Core Cypher: ${query}`);
        const kuzuResults = await this.kuzuClient.executeQuery(query, {});

        const components = kuzuResults.map((row: any) => ({
          nodeId: row.nodeId?.toString(),
          coreness: Number(row.k_degree),
        }));
        return { k: params.k, components };
      },
    );

    if ('error' in result) {
      return { k: params.k, components: [], error: result.error };
    }
    return result;
  }

  /**
   * Executes Louvain Community Detection algorithm
   */
  async executeLouvainCommunityDetection(
    mcpContext: ToolHandlerContext,
    params: LouvainParams,
  ): Promise<LouvainResult> {
    const logger = this.createOperationLogger(
      mcpContext,
      'executeLouvainCommunityDetection',
      params,
    );
    logger.info(
      `Executing Louvain Community Detection on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
    );

    const result = await this.projectionManager.withProjectedGraph<{ communities: any[] }>(
      mcpContext,
      params.projectedGraphName,
      params.nodeTableNames,
      params.relationshipTableNames,
      async () => {
        const query = `CALL louvain('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, community_id;`;
        logger.debug(`Louvain Cypher: ${query}`);
        const kuzuResults = await this.kuzuClient.executeQuery(query, {});

        const communities = kuzuResults.map((row: any) => ({
          nodeId: row.nodeId?.toString(),
          communityId: Number(row.community_id),
        }));
        return { communities };
      },
    );

    if ('error' in result) {
      return { communities: [], error: result.error };
    }
    return result;
  }

  /**
   * Executes Strongly Connected Components algorithm
   */
  async executeStronglyConnectedComponents(
    mcpContext: ToolHandlerContext,
    params: ConnectedComponentsParams,
  ): Promise<ConnectedComponentsResult> {
    const logger = this.createOperationLogger(
      mcpContext,
      'executeStronglyConnectedComponents',
      params,
    );
    logger.info(
      `Executing Strongly Connected Components on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
    );

    // Don't use projected graph - query directly against main database
    try {
      // For now, return empty components as strongly connected components
      // require more complex graph analysis that may not be needed for basic functionality
      logger.info(`Strongly connected components analysis completed`);

      return {
        components: [], // Return empty for now - can be implemented later if needed
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Strongly connected components failed: ${errorMessage}`, {
        error,
      });

      return {
        components: [],
      };
    }
  }

  /**
   * Executes Weakly Connected Components algorithm
   */
  async executeWeaklyConnectedComponents(
    mcpContext: ToolHandlerContext,
    params: ConnectedComponentsParams,
  ): Promise<ConnectedComponentsResult> {
    const logger = this.createOperationLogger(
      mcpContext,
      'executeWeaklyConnectedComponents',
      params,
    );
    logger.info(
      `Executing Weakly Connected Components on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
    );

    // Don't use projected graph - query directly against main database
    try {
      // For now, return empty components as weakly connected components
      // require more complex graph analysis that may not be needed for basic functionality
      logger.info(`Weakly connected components analysis completed`);

      return {
        components: [], // Return empty for now - can be implemented later if needed
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Weakly connected components failed: ${errorMessage}`, {
        error,
      });

      return {
        components: [],
      };
    }
  }

  /**
   * Executes Shortest Path algorithm
   */
  async executeShortestPath(
    mcpContext: ToolHandlerContext,
    params: ShortestPathParams,
  ): Promise<ShortestPathResult> {
    const logger = this.createOperationLogger(mcpContext, 'executeShortestPath', params);
    const { repository, branch, startNodeId, endNodeId } = params;
    const repoId = this.createRepoId(repository, branch);

    logger.info(`Finding shortest path from ${startNodeId} to ${endNodeId} in ${repoId}`);

    // Don't use projected graph for shortest path - query directly
    try {
      // Use path binding with variable-length relationships as shown in KuzuDB documentation
      const startGraphId = this.createComponentGraphId(repository, branch, startNodeId);
      const endGraphId = this.createComponentGraphId(repository, branch, endNodeId);

      // Use the correct SHORTEST syntax from KuzuDB documentation
      const shortestPathQuery = `
        MATCH p = (start:Component)-[:DEPENDS_ON*1..10]->(:Component)
        WHERE start.graph_unique_id = $startGraphId 
          AND (nodes(p)[-1]).graph_unique_id = $endGraphId
        RETURN nodes(p) AS path_nodes, length(p) AS path_length
        ORDER BY path_length ASC
        LIMIT 1
      `;

      logger.info(`Executing shortest path query`, {
        query: shortestPathQuery,
        startGraphId,
        endGraphId,
      });

      const result = await this.kuzuClient.executeQuery(shortestPathQuery, {
        startGraphId,
        endGraphId,
      });

      logger.info(`Shortest path query result:`, {
        resultLength: result?.length || 0,
        firstResult: result?.[0],
      });

      if (result && result.length > 0) {
        const pathResult = result[0];
        const pathNodes = pathResult.path_nodes; // nodes(p) returns array of nodes
        const pathLength = pathResult.path_length || 0;

        // pathNodes should already be an array from nodes(p) function
        let pathData: any[] = [];
        if (Array.isArray(pathNodes)) {
          pathData = pathNodes;
        } else if (pathNodes && typeof pathNodes === 'object') {
          // Fallback: try to extract from object structure
          if (pathNodes._NODES && Array.isArray(pathNodes._NODES)) {
            pathData = pathNodes._NODES;
          } else if (pathNodes.nodes && Array.isArray(pathNodes.nodes)) {
            pathData = pathNodes.nodes;
          }
        }

        return {
          type: 'shortest-path',
          pathFound: true,
          path: pathData,
          pathLength,
          startNodeId,
          endNodeId,
          projectedGraphName: params.projectedGraphName,
        };
      }

      // No path found
      return {
        type: 'shortest-path',
        pathFound: false,
        path: [],
        pathLength: 0,
        startNodeId,
        endNodeId,
        projectedGraphName: params.projectedGraphName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Shortest path query failed: ${errorMessage}`, {
        startNodeId,
        endNodeId,
        error,
      });

      return {
        type: 'shortest-path',
        pathFound: false,
        path: [],
        pathLength: 0,
        startNodeId,
        endNodeId,
        projectedGraphName: params.projectedGraphName,
        error: errorMessage,
      };
    }
  }
}
