import { KuzuDBClient } from '../../db/kuzu';
import { Component } from '../../types';
import { BaseComponentRepository } from '../base/base-component.repository';
import { RepositoryRepository } from '../repository.repository';

/**
 * Repository for Component graph algorithm operations
 * Handles PageRank, k-core decomposition, community detection, and connectivity analysis
 */
export class ComponentAlgorithmRepository extends BaseComponentRepository {
  private readonly globalProjectedGraphName = 'AllComponentsAndDependencies';

  /**
   * K-core decomposition algorithm
   */
  async kCoreDecomposition(repositoryNodeId: string, k: number): Promise<any> {
    await this.ensureGraphProjection(this.globalProjectedGraphName);

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const kValue = k;

    const query = `
      CALL k_core_decomposition('${this.globalProjectedGraphName}') YIELD node AS algo_component_node, k_degree
      WITH algo_component_node, k_degree
      WHERE k_degree >= ${kValue}
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, k_degree
    `;

    try {
      const result = await this.executeQueryWithLogging(query, {}, 'kCoreDecomposition');

      return {
        message: `Nodes in the ${kValue}-core (or higher) for repository ${repositoryNodeId} using projection '${this.globalProjectedGraphName}'.`,
        nodes: result.map((row: any) => {
          const compData = row.component ?? row['component'];
          return { ...compData, id: compData.id, graph_unique_id: undefined } as Component;
        }),
        details: result.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          },
          k_degree: row.k_degree ?? row['k_degree'],
        })),
      };
    } catch (error: any) {
      this.logger.error(
        `Error executing kCoreDecomposition query for repo ${repositoryNodeId}, k=${kValue}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Louvain community detection algorithm
   */
  async louvainCommunityDetection(repositoryNodeId: string): Promise<any> {
    await this.ensureGraphProjection(this.globalProjectedGraphName);

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const louvainCallParams = `'${this.globalProjectedGraphName}'`;

    const query = `
      CALL louvain(${louvainCallParams}) YIELD node AS algo_component_node, louvain_id 
      WITH algo_component_node, louvain_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, louvain_id AS community_id 
      ORDER BY community_id, algo_component_node.name 
    `;

    try {
      const result = await this.executeQueryWithLogging(query, {}, 'louvainCommunityDetection');

      return {
        message: `Community detection results for repository ${repositoryNodeId} using projection '${this.globalProjectedGraphName}'.`,
        communities: result.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          communityId: row.community_id ?? row['community_id'],
        })),
      };
    } catch (error: any) {
      this.logger.error(
        `Error executing louvainCommunityDetection query for repo ${repositoryNodeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * PageRank algorithm
   */
  async pageRank(
    repositoryNodeId: string,
    dampingFactor?: number,
    iterations?: number,
    tolerance?: number,
    normalizeInitial?: boolean,
  ): Promise<any> {
    await this.ensureGraphProjection(this.globalProjectedGraphName);

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    let callParams = `'${this.globalProjectedGraphName}'`;
    if (dampingFactor !== undefined) {
      callParams += `, dampingFactor := ${dampingFactor}`;
    }
    if (iterations !== undefined) {
      callParams += `, maxIterations := ${iterations}`;
    }
    if (tolerance !== undefined) {
      callParams += `, tolerance := ${tolerance}`;
    }
    if (normalizeInitial !== undefined) {
      callParams += `, normalizeInitial := ${normalizeInitial}`;
    }

    const query = `
      CALL page_rank(${callParams}) YIELD node AS algo_component_node, rank
      WITH algo_component_node, rank
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, rank
      ORDER BY rank DESC
    `;

    try {
      const result = await this.executeQueryWithLogging(query, {}, 'pageRank');

      return {
        message: `PageRank results for repository ${repositoryNodeId} using projection '${this.globalProjectedGraphName}'.`,
        ranks: result.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          rank: row.rank ?? row['rank'],
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error executing pageRank query for repo ${repositoryNodeId}:`, error);
      throw error;
    }
  }

  /**
   * Get strongly connected components
   */
  async getStronglyConnectedComponents(repositoryNodeId: string): Promise<any> {
    await this.ensureGraphProjection(this.globalProjectedGraphName);

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const sccCallParams = `'${this.globalProjectedGraphName}'`;

    const query = `
      CALL strongly_connected_components(${sccCallParams}) YIELD node AS algo_component_node, component_id AS group_id
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    try {
      const result = await this.executeQueryWithLogging(
        query,
        {},
        'getStronglyConnectedComponents',
      );

      return {
        message: `SCC results for repository ${repositoryNodeId} using projection '${this.globalProjectedGraphName}'.`,
        components: result.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          groupId: row.group_id ?? row['group_id'],
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error executing SCC query for repo ${repositoryNodeId}:`, error);
      throw error;
    }
  }

  /**
   * Get weakly connected components
   */
  async getWeaklyConnectedComponents(repositoryNodeId: string): Promise<any> {
    await this.ensureGraphProjection(this.globalProjectedGraphName);

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const wccCallParams = `'${this.globalProjectedGraphName}'`;

    const query = `
      CALL weakly_connected_components(${wccCallParams}) YIELD node AS algo_component_node, component_id AS group_id
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    try {
      const result = await this.executeQueryWithLogging(query, {}, 'getWeaklyConnectedComponents');

      return {
        message: `WCC results for repository ${repositoryNodeId} using projection '${this.globalProjectedGraphName}'.`,
        components: result.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          groupId: row.group_id ?? row['group_id'],
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error executing WCC query for repo ${repositoryNodeId}:`, error);
      throw error;
    }
  }
}
