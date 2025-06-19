import { KuzuDBClient } from '../../db/kuzu';
import { Component, Context, Decision } from '../../types';
import { BaseComponentRepository } from '../base/base-component.repository';
import { RepositoryRepository } from '../repository.repository';

/**
 * Repository for Component graph traversal and relationship operations
 * Handles path finding, dependency queries, and relationship traversals
 */
export class ComponentGraphRepository extends BaseComponentRepository {

  /**
   * Find shortest path between two components
   */
  async findShortestPath(
    repositoryName: string,
    startNodeId: string,
    startNodeBranch: string,
    endNodeId: string,
    params?: {
      relationshipTypes?: string[];
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
      algorithm?: string;
      projectedGraphName?: string;
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
    },
  ): Promise<{ path: Component[]; length: number; error?: string | null }> {
    let relationshipPattern: string;
    if (params?.relationshipTypes && params.relationshipTypes.length > 0) {
      const sanitizedTypes = params.relationshipTypes
        .map((rt) => rt.replace(/[^a-zA-Z0-9_]/g, ''))
        .filter((rt) => rt.length > 0);
      if (sanitizedTypes.length > 0) {
        relationshipPattern = `[e:${sanitizedTypes.join('|')}* SHORTEST]`;
      } else {
        relationshipPattern = `[* SHORTEST]`;
      }
    } else {
      relationshipPattern = `[* SHORTEST]`;
    }

    // Build direction arrows
    let arrowLeft = '-';
    let arrowRight = '->';
    if (params?.direction === 'INCOMING') {
      arrowLeft = '<-';
      arrowRight = '-';
    } else if (params?.direction === 'BOTH') {
      arrowLeft = '-';
      arrowRight = '-';
    }

    const startGraphUniqueId = this.createGraphUniqueId(
      repositoryName,
      startNodeBranch,
      startNodeId,
    );
    const endGraphUniqueId = this.createGraphUniqueId(repositoryName, startNodeBranch, endNodeId);

    const query = `
      MATCH p = (startNode:Component)${arrowLeft}${relationshipPattern}${arrowRight}(endNode:Component)
      WHERE startNode.graph_unique_id = $startGraphUniqueId
        AND endNode.graph_unique_id = $endGraphUniqueId
        AND startNode.branch = $startNodeBranch
        AND endNode.branch = $endNodeBranch
      RETURN p AS path, length(p) AS path_length
      ORDER BY path_length ASC
      LIMIT 1
    `;

    try {
      const result = await this.executeQueryWithLogging(
        query,
        {
          startGraphUniqueId,
          endGraphUniqueId,
          startNodeBranch,
          endNodeBranch: startNodeBranch,
        },
        'findShortestPath',
      );

      if (result.length === 0) {
        this.logger.debug(`No path found by query for ${startNodeId} -> ${endNodeId}`);
        return { path: [], length: 0, error: null };
      }

      const row = result[0];
      const kuzuPathObject = row.path;
      const pathLength = row.path_length || 0;

      // Extract nodes from the KuzuDB path structure
      let nodes: Component[] = [];

      if (kuzuPathObject && kuzuPathObject._NODES) {
        nodes = kuzuPathObject._NODES.map((node: any) => ({
          ...node,
          id: node.id,
          graph_unique_id: undefined,
        }));
      } else if (kuzuPathObject && kuzuPathObject.nodes) {
        nodes = kuzuPathObject.nodes.map((node: any) => ({
          ...node,
          id: node.id,
          graph_unique_id: undefined,
        }));
      } else if (Array.isArray(kuzuPathObject)) {
        nodes = kuzuPathObject.map((node: any) => ({
          ...node,
          id: node.id,
          graph_unique_id: undefined,
        }));
      }

      return { path: nodes, length: pathLength, error: null };
    } catch (error: any) {
      this.logger.error(
        `Error executing findShortestPath query from ${startNodeId} to ${endNodeId}:`,
        error,
      );
      return {
        path: [],
        length: 0,
        error: error.message || 'Error executing shortest path query.',
      };
    }
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON)
   */
  async getComponentDependencies(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    const startNodeGraphUniqueId = this.createGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );

    const query = `
      MATCH (c:Component {graph_unique_id: $startNodeGraphUniqueId})
      MATCH (c)-[:DEPENDS_ON]->(dep:Component)
      WHERE dep.branch = $componentBranch
      RETURN DISTINCT dep
    `;

    try {
      const result = await this.executeQueryWithLogging(
        query,
        { startNodeGraphUniqueId, componentBranch },
        'getComponentDependencies',
      );

      if (result.length === 0) {
        return [];
      }

      return result.map((row: any) => {
        const depData = row.dep ?? row['dep'] ?? row;
        return {
          ...depData,
          id: depData.id,
          graph_unique_id: undefined,
        } as Component;
      });
    } catch (error: any) {
      this.logger.error(`Error in getComponentDependencies for ${componentId}:`, error);
      throw error;
    }
  }

  /**
   * Get all downstream dependents for a component (transitive)
   */
  async getComponentDependents(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    const targetNodeGraphUniqueId = this.createGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );

    const query = `
      MATCH (targetComp:Component {graph_unique_id: $targetNodeGraphUniqueId})
      MATCH (dependentComp:Component)-[:DEPENDS_ON]->(targetComp)
      WHERE dependentComp.branch = $componentBranch
      RETURN DISTINCT dependentComp
    `;

    try {
      const result = await this.executeQueryWithLogging(
        query,
        { targetNodeGraphUniqueId, componentBranch },
        'getComponentDependents',
      );

      if (result.length === 0) {
        return [];
      }

      return result.map((row: any) => {
        const depData = row.dependentComp ?? row['dependentComp'] ?? row;
        return {
          ...depData,
          id: depData.id,
          graph_unique_id: undefined,
        } as Component;
      });
    } catch (error: any) {
      this.logger.error(`Error in getComponentDependents for ${componentId}:`, error);
      throw error;
    }
  }

  /**
   * Get related items for a component based on specified relationship types, depth, and direction
   */
  async getRelatedItems(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
    relationshipTypes?: string[],
    depth?: number,
    direction?: 'INCOMING' | 'OUTGOING' | 'BOTH',
  ): Promise<Component[]> {
    const currentDepth = depth && depth > 0 && depth <= 10 ? depth : 1;
    const currentDirection = direction || 'OUTGOING';
    const escapedComponentBranch = this.escapeStr(componentBranch);

    let relTypeSpec = '';
    if (relationshipTypes && relationshipTypes.length > 0) {
      const sanitizedTypes = relationshipTypes
        .map((rt) => rt.replace(/[^a-zA-Z0-9_]/g, ''))
        .filter((rt) => rt.length > 0);
      if (sanitizedTypes.length > 0) {
        relTypeSpec = ':' + sanitizedTypes.join('|');
      }
    }

    let pathRelationship = `-[r${relTypeSpec}*1..${currentDepth}]-`;
    if (currentDirection === 'OUTGOING') {
      pathRelationship = `-[r${relTypeSpec}*1..${currentDepth}]->`;
    } else if (currentDirection === 'INCOMING') {
      pathRelationship = `<-[r${relTypeSpec}*1..${currentDepth}]-`;
    }

    const startNodeGraphUniqueId = this.createGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );

    const query = `
      MATCH (startNode:Component {graph_unique_id: $startNodeGraphUniqueId})
      MATCH (startNode)${pathRelationship}(relatedItem:Component)
      WHERE relatedItem.branch = $componentBranch
      RETURN DISTINCT relatedItem
    `;

    try {
      const result = await this.executeQueryWithLogging(
        query,
        { startNodeGraphUniqueId, componentBranch },
        'getRelatedItems',
      );

      if (result.length === 0) {
        return [];
      }

      return result.map((row: any) => {
        const itemData = row.relatedItem ?? row['relatedItem'];
        return {
          ...itemData,
          id: itemData.id,
          graph_unique_id: undefined,
        } as Component;
      });
    } catch (error: any) {
      this.logger.error(`Error executing getRelatedItems query for ${componentId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve contextual history (Context nodes) for a given component
   */
  async getItemContextualHistory(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<Context[]> {
    const itemGraphUniqueId = this.createGraphUniqueId(repositoryName, itemBranch, itemId);

    let itemMatchClause = '';
    let relationshipMatchClause = '';

    switch (itemType) {
      case 'Component':
        itemMatchClause = `(item:Component {graph_unique_id: $itemGraphUniqueId})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF]->(item)`;
        break;
      case 'Decision':
        itemMatchClause = `(item:Decision {graph_unique_id: $itemGraphUniqueId})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_DECISION]->(item)`;
        break;
      case 'Rule':
        itemMatchClause = `(item:Rule {graph_unique_id: $itemGraphUniqueId})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_RULE]->(item)`;
        break;
      default: {
        const exhaustiveCheck: never = itemType;
        this.logger.error(`Unsupported itemType for getItemContextualHistory: ${exhaustiveCheck}`);
        return [];
      }
    }

    const query = `
      MATCH ${itemMatchClause}
      MATCH (ctx:Context)
      WHERE ctx.branch = $itemBranch AND ctx.repository = $repositoryName
      MATCH ${relationshipMatchClause}
      RETURN DISTINCT ctx
      ORDER BY ctx.created_at DESC
      LIMIT 100
    `;

    try {
      const result = await this.executeQueryWithLogging(
        query,
        { itemGraphUniqueId, itemBranch, repositoryName },
        'getItemContextualHistory',
      );

      if (result.length === 0) {
        return [];
      }

      return result.map((row: any) => {
        const ctxData = row.ctx ?? row['ctx'];
        return { ...ctxData, id: ctxData.id, graph_unique_id: undefined } as Context;
      });
    } catch (error: any) {
      this.logger.error(`Error executing getItemContextualHistory for ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Get governing decisions for a component
   */
  async getGoverningItemsForComponent(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
  ): Promise<Decision[]> {
    const componentGraphUniqueId = this.createGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );

    const query = `
      MATCH (comp:Component {graph_unique_id: $componentGraphUniqueId})
      MATCH (dec:Decision {branch: $componentBranch})-[:DECISION_ON]->(comp)
      RETURN DISTINCT dec
    `;

    try {
      const result = await this.executeQueryWithLogging(
        query,
        { componentGraphUniqueId, componentBranch },
        'getGoverningItemsForComponent',
      );

      if (result.length === 0) {
        return [];
      }

      return result.map((row: any) => {
        const decData = row.dec ?? row['dec'];
        return { ...decData, id: decData.id, graph_unique_id: undefined } as Decision;
      });
    } catch (error: any) {
      this.logger.error(`Error executing getGoverningItemsForComponent for ${componentId}:`, error);
      throw error;
    }
  }
}
