import { BaseGraphOperations, GetRelatedItemsParams, RelatedItemsResult, RelatedItem } from '../base/base-graph-operations';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

/**
 * Service responsible for relationship and traversal operations
 * Handles retrieval of related items and graph traversal operations
 */
export class GraphRelationshipService extends BaseGraphOperations {
  /**
   * Retrieves related items within a certain number of hops in the graph
   */
  async getRelatedItems(
    mcpContext: EnrichedRequestHandlerExtra,
    params: GetRelatedItemsParams,
  ): Promise<RelatedItemsResult> {
    const logger = this.createOperationLogger(mcpContext, 'getRelatedItems', params);
    const { repository, branch, startItemId, depth, relationshipFilter, targetNodeTypeFilter } =
      params;
    const repoId = this.createRepoId(repository, branch);

    logger.info(`Getting related items for ${startItemId} in ${repoId}`);

    try {
      const maxDepth = depth || 1;

      // Build a basic query for related items using variable path length
      let query = `
        MATCH (start {id: $startItemId})-[rels*1..${maxDepth}]-(relatedItem)
        WHERE start.repository = $repoId AND start.branch = $branch 
          AND relatedItem.repository = $repoId AND relatedItem.branch = $branch
          AND start <> relatedItem
      `;

      // Add relationship filter if specified
      if (relationshipFilter) {
        query += ` AND ALL(rel IN rels WHERE TYPE(rel) = '${relationshipFilter.replace(/'/g, "''")}')`;
      }

      // Add target node type filter if specified
      if (targetNodeTypeFilter) {
        query += ` AND '${targetNodeTypeFilter.replace(/'/g, "''")}' IN LABELS(relatedItem)`;
      }

      query += `
        RETURN DISTINCT relatedItem, LABELS(relatedItem) AS nodeLabels, LENGTH(rels) AS pathLength
        ORDER BY pathLength, relatedItem.name
      `;

      const queryParams = { startItemId, repoId, branch };
      logger.debug(`Related items query: ${query.trim()}`, queryParams);

      const results = await this.kuzuClient.executeQuery(query, queryParams);

      const relatedItems = results.map((row: any) => {
        const itemData = row.relatedItem.properties || row.relatedItem;
        const nodeLabels = row.nodeLabels || [];
        const pathLength = row.pathLength || 1;

        // Determine item type from node labels
        let itemType = 'Unknown';
        if (nodeLabels.includes('Component')) {
          itemType = 'Component';
        } else if (nodeLabels.includes('Decision')) {
          itemType = 'Decision';
        } else if (nodeLabels.includes('Rule')) {
          itemType = 'Rule';
        } else if (nodeLabels.includes('Context')) {
          itemType = 'Context';
        }

        return {
          id: itemData.id?.toString() || `generated-item-${Math.random()}`,
          name: itemData.name || '',
          type: itemType,
          distance: pathLength,
          repository: repoId,
          branch: branch,
        } as RelatedItem;
      });

      logger.info(
        `Found ${relatedItems.length} related items for ${startItemId} within ${maxDepth} hops`,
      );

      return {
        status: 'complete',
        relatedItems,
        message: `Successfully retrieved ${relatedItems.length} related items within ${maxDepth} hops`,
      };
    } catch (error: any) {
      logger.error(`Error fetching related items for ${startItemId} in ${repoId}:`, {
        error: error.toString(),
        stack: error.stack,
      });

      return {
        status: 'error',
        relatedItems: [],
        message: `Failed to fetch related items: ${error.message}`,
      };
    }
  }

  /**
   * Get relationship summary for a repository
   */
  async getRelationshipSummary(
    mcpContext: EnrichedRequestHandlerExtra,
    repository: string,
    branch: string,
  ): Promise<{
    totalRelationships: number;
    relationshipsByType: Record<string, number>;
    mostConnectedItems: Array<{
      id: string;
      name: string;
      type: string;
      connectionCount: number;
    }>;
  }> {
    const logger = this.createOperationLogger(mcpContext, 'getRelationshipSummary', {
      repository,
      branch,
    });
    const repoId = this.createRepoId(repository, branch);

    logger.info(`Getting relationship summary for ${repoId}`);

    try {
      // Get total relationships count (this is a simplified approach)
      const totalRelationshipsQuery = `
        MATCH (a)-[r]->(b)
        WHERE a.repository = $repoId AND a.branch = $branch
          AND b.repository = $repoId AND b.branch = $branch
        RETURN count(r) AS totalRelationships
      `;

      // Get relationships by type
      const relationshipsByTypeQuery = `
        MATCH (a)-[r]->(b)
        WHERE a.repository = $repoId AND a.branch = $branch
          AND b.repository = $repoId AND b.branch = $branch
        RETURN TYPE(r) AS relationshipType, count(r) AS count
        ORDER BY count DESC
      `;

      // Get most connected items
      const mostConnectedQuery = `
        MATCH (item)
        WHERE item.repository = $repoId AND item.branch = $branch
        OPTIONAL MATCH (item)-[r]-()
        WITH item, count(r) AS connectionCount, LABELS(item) AS nodeLabels
        WHERE connectionCount > 0
        RETURN item.id AS id, item.name AS name, nodeLabels[0] AS type, connectionCount
        ORDER BY connectionCount DESC
        LIMIT 10
      `;

      const queryParams = { repoId, branch };

      const [totalResult, typeResult, connectedResult] = await Promise.all([
        this.kuzuClient.executeQuery(totalRelationshipsQuery, queryParams),
        this.kuzuClient.executeQuery(relationshipsByTypeQuery, queryParams),
        this.kuzuClient.executeQuery(mostConnectedQuery, queryParams),
      ]);

      const totalRelationships = totalResult[0]?.totalRelationships || 0;

      const relationshipsByType: Record<string, number> = {};
      typeResult.forEach((row: any) => {
        const type = row.relationshipType || 'unknown';
        const count = row.count || 0;
        relationshipsByType[type] = count;
      });

      const mostConnectedItems = connectedResult.map((row: any) => ({
        id: row.id?.toString() || 'unknown',
        name: row.name || 'unnamed',
        type: row.type || 'unknown',
        connectionCount: row.connectionCount || 0,
      }));

      logger.info(
        `Relationship summary completed: ${totalRelationships} total relationships, ${Object.keys(relationshipsByType).length} relationship types`,
      );

      return {
        totalRelationships,
        relationshipsByType,
        mostConnectedItems,
      };
    } catch (error: any) {
      logger.error(`Error getting relationship summary for ${repoId}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      throw new Error(`Failed to get relationship summary: ${error.message}`);
    }
  }

  /**
   * Find shortest path between two items
   */
  async findShortestPath(
    mcpContext: EnrichedRequestHandlerExtra,
    repository: string,
    branch: string,
    startItemId: string,
    endItemId: string,
    maxDepth: number = 10,
  ): Promise<{
    pathFound: boolean;
    path: any[];
    pathLength: number;
    error?: string;
  }> {
    const logger = this.createOperationLogger(mcpContext, 'findShortestPath', {
      repository,
      branch,
      startItemId,
      endItemId,
      maxDepth,
    });

    logger.info(`Finding shortest path from ${startItemId} to ${endItemId}`);

    try {
      const startGraphId = this.createComponentGraphId(repository, branch, startItemId);
      const endGraphId = this.createComponentGraphId(repository, branch, endItemId);

      // Use the correct SHORTEST syntax from KuzuDB documentation
      const shortestPathQuery = `
        MATCH p = (start:Component)-[:DEPENDS_ON*1..${maxDepth}]->(:Component)
        WHERE start.graph_unique_id = $startGraphId 
          AND (nodes(p)[-1]).graph_unique_id = $endGraphId
        RETURN nodes(p) AS path_nodes, length(p) AS path_length
        ORDER BY path_length ASC
        LIMIT 1
      `;

      const result = await this.kuzuClient.executeQuery(shortestPathQuery, {
        startGraphId,
        endGraphId,
      });

      if (result && result.length > 0) {
        const pathResult = result[0];
        const pathNodes = pathResult.path_nodes;
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

        logger.info(`Found shortest path with length ${pathLength}`);

        return {
          pathFound: true,
          path: pathData,
          pathLength,
        };
      }

      logger.info(`No path found between ${startItemId} and ${endItemId}`);

      return {
        pathFound: false,
        path: [],
        pathLength: 0,
      };
    } catch (error: any) {
      logger.error(`Error finding shortest path:`, {
        error: error.toString(),
        stack: error.stack,
      });

      return {
        pathFound: false,
        path: [],
        pathLength: 0,
        error: error.message,
      };
    }
  }
}
