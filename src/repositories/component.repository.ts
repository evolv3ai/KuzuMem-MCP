import { Component, Context, Decision, Rule, ComponentStatus, ComponentInput } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';

/**
 * Thread-safe singleton repository for Component, using KuzuDB and Cypher queries
 */
export class ComponentRepository {
  private static instance: ComponentRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<ComponentRepository> {
    const release = await ComponentRepository.lock.acquire();
    try {
      if (!ComponentRepository.instance) {
        ComponentRepository.instance = new ComponentRepository();
      }
      return ComponentRepository.instance;
    } finally {
      release();
    }
  }

  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    } // Kùzu/Cypher null keyword
    return String(value).replace(/'/g, "\\\\'").replace(/\\/g, '\\\\\\\\');
  }

  private escapeJsonProp(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    } // Kùzu/Cypher null keyword
    try {
      const jsonString = JSON.stringify(value);
      // Produces a Cypher string literal containing the JSON string, e.g., '"[\\"item1\\",\\"item2\\"]"'
      return `'${this.escapeStr(jsonString)}'`;
    } catch (e) {
      console.error('Failed to stringify JSON for escapeJsonProp', value, e);
      return "'null'"; // Return a Cypher string literal 'null'
    }
  }

  /**
   * Get all active components for a repository (status = 'active'), ordered by name
   */
  async getActiveComponents(repositoryId: string): Promise<Component[]> {
    const safeRepositoryId = this.escapeStr(repositoryId);
    const query = `
      MATCH (r:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(c:Component {status: 'active'}) 
      RETURN c ORDER BY c.name ASC
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => row.c);
  }

  /**
   * Creates or updates a component for a repository.
   * Manages DEPENDS_ON relationships by clearing existing ones and creating new ones.
   * Returns the upserted Component or null if not found
   */
  async upsertComponent(
    repositoryId: string,
    component: ComponentInput,
  ): Promise<Component | null> {
    const yamlId = String(component.yaml_id);
    const branch = String(component.branch || 'main');

    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedYamlId = this.escapeStr(yamlId);
    const escapedName = this.escapeStr(component.name);
    const escapedKind = this.escapeStr(component.kind);
    const escapedStatus = this.escapeStr(component.status);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const existing = await this.findByYamlId(repositoryId, yamlId, branch);

    if (existing) {
      const updateQuery = `
         MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${escapedYamlId}', branch: '${this.escapeStr(
           branch,
         )}'})
         SET c.name = '${escapedName}', c.kind = '${escapedKind}', c.status = '${escapedStatus}', c.updated_at = timestamp('${kuzuTimestamp}')
         RETURN c`;
      await KuzuDBClient.executeQuery(updateQuery);
    } else {
      const createQuery = `
         MATCH (repo:Repository {id: '${escapedRepoId}'})
         CREATE (repo)-[:HAS_COMPONENT]->(c:Component {
           yaml_id: '${escapedYamlId}', 
           name: '${escapedName}', 
           kind: '${escapedKind}', 
           status: '${escapedStatus}', 
           branch: '${this.escapeStr(branch)}',
           created_at: timestamp('${kuzuTimestamp}'),
           updated_at: timestamp('${kuzuTimestamp}')
          })
         RETURN c`;
      await KuzuDBClient.executeQuery(createQuery);
    }

    const deleteDepsQuery = `
        MATCH (c:Component {yaml_id: '${escapedYamlId}', branch: '${this.escapeStr(
          branch,
        )}'})-[r:DEPENDS_ON]->()
        WHERE (:Repository {id: '${escapedRepoId}'})-[:HAS_COMPONENT]->(c)\n        DELETE r`;
    await KuzuDBClient.executeQuery(deleteDepsQuery);

    if (component.depends_on && component.depends_on.length > 0) {
      for (const depYamlId of component.depends_on) {
        const escapedDepYamlId = this.escapeStr(depYamlId);
        const addDepQuery = `
                MATCH (repo:Repository {id: '${escapedRepoId}'})
                MATCH (c:Component {yaml_id: '${escapedYamlId}', branch: '${this.escapeStr(
                  branch,
                )}'})
                WHERE (repo)-[:HAS_COMPONENT]->(c)
                MERGE (dep:Component {yaml_id: '${escapedDepYamlId}', branch: '${this.escapeStr(
                  branch,
                )}'})
                ON CREATE SET dep.name = 'Placeholder: ${escapedDepYamlId}', dep.kind='Unknown', dep.status='planned', dep.created_at=timestamp('${kuzuTimestamp}'), dep.updated_at=timestamp('${kuzuTimestamp}')
                MERGE (repo)-[:HAS_COMPONENT]->(dep)
                MERGE (c)-[:DEPENDS_ON]->(dep)`;
        try {
          await KuzuDBClient.executeQuery(addDepQuery);
        } catch (relError) {
          console.error(
            `Failed to create DEPENDS_ON relationship from ${yamlId} to ${depYamlId}:`,
            relError,
          );
        }
      }
    }
    return this.findByYamlId(repositoryId, yamlId, branch);
  }

  /**
   * Find a component by repository, yaml_id, and branch
   */
  async findByYamlId(
    repositoryId: string,
    yaml_id: string,
    branch: string,
  ): Promise<Component | null> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedYamlId = this.escapeStr(yaml_id);
    const escapedBranch = this.escapeStr(branch);
    const query = `
      MATCH (r:Repository {id: '${escapedRepoId}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${escapedYamlId}', branch: '${escapedBranch}'}) 
      RETURN c LIMIT 1`;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    return (rows[0].c ?? rows[0]['c']) as Component;
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON)
   */
  async getComponentDependencies(
    repositoryId: string,
    componentYamlId: string,
  ): Promise<Component[]> {
    const safeRepositoryId = this.escapeStr(repositoryId);
    const safeComponentYamlId = this.escapeStr(componentYamlId);
    const query = `
      MATCH (r:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${safeComponentYamlId}'})
      MATCH (c)-[:DEPENDS_ON*1..]->(dep:Component)
      // Ensure dep is also in the same repository to avoid traversing out of scope
      WHERE (r)-[:HAS_COMPONENT]->(dep)
      RETURN DISTINCT dep
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    // Each row.dep is a Component node
    return rows.map((row: any) => row.dep ?? row['dep'] ?? row);
  }

  /**
   * Get all downstream dependents for a component (transitive, i.e., components that depend on this one).
   * @param repositoryId The ID of the repository.
   * @param componentYamlId The yaml_id of the component for which to find dependents.
   * @returns A promise that resolves to an array of Component objects that depend on the specified component.
   */
  async getComponentDependents(
    repositoryId: string,
    componentYamlId: string,
  ): Promise<Component[]> {
    // Find components (dependentComp) that have a DEPENDS_ON relationship pointing to targetComp.
    // Ensure all involved components belong to the specified repository.
    const query = `
      MATCH (r:Repository {id: '${repositoryId}'})-[:HAS_COMPONENT]->(targetComp:Component {yaml_id: '${componentYamlId}'})
      MATCH (dependentComp:Component)-[:DEPENDS_ON*1..]->(targetComp)
      WHERE (r)-[:HAS_COMPONENT]->(dependentComp) 
      RETURN DISTINCT dependentComp
    `;
    // It's important to also ensure dependentComp is linked to the repository 'r' if not implicitly handled by schema/query context.
    // The WHERE clause (r)-[:HAS_COMPONENT]->(dependentComp) should achieve this.

    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      console.warn(
        `Query for getComponentDependents for ${componentYamlId} in repo ${repositoryId} returned no result or invalid result type.`,
      );
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => row.dependentComp ?? row['dependentComp'] ?? row);
  }

  /**
   * Get related items for a component based on specified relationship types, depth, and direction.
   * Currently assumes related items are also Components within the same repository.
   *
   * @param repositoryId The ID of the repository.
   * @param componentYamlId The yaml_id of the starting component.
   * @param relationshipTypes Optional array of relationship types to traverse. If undefined, all types are considered.
   * @param depth Optional maximum depth of traversal. Defaults to 1.
   * @param direction Optional direction of traversal ('INCOMING', 'OUTGOING', 'BOTH'). Defaults to 'OUTGOING'.
   * @returns A promise that resolves to an array of related Component objects.
   */
  async getRelatedItems(
    repositoryId: string,
    componentYamlId: string,
    relationshipTypes?: string[],
    depth?: number,
    direction?: 'INCOMING' | 'OUTGOING' | 'BOTH',
  ): Promise<Component[]> {
    const currentDepth = depth && depth > 0 && depth <= 10 ? depth : 1;
    const currentDirection = direction || 'OUTGOING';

    let relTypeSpec = '';
    if (relationshipTypes && relationshipTypes.length > 0) {
      const sanitizedTypes = relationshipTypes
        .map((rt) => rt.replace(/[^a-zA-Z0-9_]/g, ''))
        .filter((rt) => rt.length > 0);
      if (sanitizedTypes.length > 0) {
        relTypeSpec = ':' + sanitizedTypes.join('|');
      }
    }
    console.error(
      `DEBUG: ComponentRepository.getRelatedItems - relTypeSpec = >>>${relTypeSpec}<<<`,
    ); // Debug log

    let pathRelationship = `-[r${relTypeSpec}*1..${currentDepth}]-`;
    if (currentDirection === 'OUTGOING') {
      pathRelationship = `-[r${relTypeSpec}*1..${currentDepth}]->`;
    } else if (currentDirection === 'INCOMING') {
      pathRelationship = `<-[r${relTypeSpec}*1..${currentDepth}]-`;
    }
    console.error(
      `DEBUG: ComponentRepository.getRelatedItems - pathRelationship = >>>${pathRelationship}<<<`,
    ); // Debug log

    const safeComponentYamlId = this.escapeStr(componentYamlId);
    const safeRepositoryId = this.escapeStr(repositoryId);

    const query = `
      MATCH (startNode:Component {yaml_id: '${safeComponentYamlId}'}), (repo:Repository {id: '${safeRepositoryId}'})
      WHERE (repo)-[:HAS_COMPONENT]->(startNode)
      MATCH (startNode)${pathRelationship}(relatedItem:Component)
      WHERE (repo)-[:HAS_COMPONENT]->(relatedItem) 
      RETURN DISTINCT relatedItem
    `;

    // console.error(`DEBUG: getRelatedItems query: ${query}`); // Optional: for debugging the generated query

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for getRelatedItems for ${componentYamlId} in repo ${repositoryId} returned no result or invalid result type.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => row.relatedItem ?? row['relatedItem'] ?? row);
    } catch (error) {
      console.error(
        `Error executing getRelatedItems query for ${componentYamlId} in repo ${repositoryId}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  /**
   * Finds the shortest path between two components in a repository.
   *
   * @param repositoryId The ID of the repository.
   * @param startNodeYamlId The yaml_id of the starting component.
   * @param endNodeYamlId The yaml_id of the ending component.
   * @param params Optional parameters: { relationshipTypes?: string[], direction?: 'OUTGOING' | 'INCOMING' | 'BOTH' }.
   *               'direction' applies to the overall path from start to end if relationship types are undirected or mixed.
   *               Kùzu's shortest_path might have its own interpretation of directionality with typed relationships.
   * @returns A promise that resolves to an array representing the path (e.g., nodes or relationships), or empty if no path found.
   */
  async findShortestPath(
    repositoryId: string,
    startNodeYamlId: string,
    endNodeYamlId: string,
    params?: {
      relationshipTypes?: string[];
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
    },
  ): Promise<any[]> {
    let relTypeString = '';
    if (params?.relationshipTypes && params.relationshipTypes.length > 0) {
      const sanitizedTypes = params.relationshipTypes
        .map((rt) => rt.replace(/[^a-zA-Z0-9_]/g, ''))
        .filter((rt) => rt.length > 0);
      if (sanitizedTypes.length > 0) {
        relTypeString = ':' + sanitizedTypes.join('|'); // e.g., :REL_TYPE1|REL_TYPE2
      }
    }

    let arrowLeft = '-';
    let arrowRight = '->';
    if (params?.direction === 'INCOMING') {
      arrowLeft = '<-';
      arrowRight = '-';
    } else if (params?.direction === 'BOTH') {
      arrowLeft = '-';
      arrowRight = '-';
    }

    // Kùzu example: -[:Follows* SHORTEST 1..5]->
    // We'll use a fixed range for now, can be parameterized later if needed.
    const hops = '1..10';

    const relationshipPattern = `[${relTypeString}* SHORTEST ${hops}]`;

    const safeStartNodeYamlId = this.escapeStr(startNodeYamlId);
    const safeEndNodeYamlId = this.escapeStr(endNodeYamlId);
    const safeRepositoryId = this.escapeStr(repositoryId);

    const query = `
      MATCH (startNode:Component {yaml_id: '${safeStartNodeYamlId}'}), 
            (endNode:Component {yaml_id: '${safeEndNodeYamlId}'}), 
            (repo:Repository {id: '${safeRepositoryId}'})
      WHERE (repo)-[:HAS_COMPONENT]->(startNode) AND (repo)-[:HAS_COMPONENT]->(endNode)
      MATCH path = (startNode)${arrowLeft}${relationshipPattern}${arrowRight}(endNode)
      RETURN path
    `;

    console.error(`DEBUG: findShortestPath query: ${query}`);

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for findShortestPath from ${startNodeYamlId} to ${endNodeYamlId} in repo ${repositoryId} returned no result or invalid result type.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => {
        const pathData = row.path ?? row['path'];
        if (pathData && pathData._NODES) {
          return pathData._NODES;
        }
        return pathData;
      });
    } catch (error) {
      console.error(
        `Error executing findShortestPath query from ${startNodeYamlId} to ${endNodeYamlId} in repo ${repositoryId}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  // --- Placeholder Graph Algorithm Methods ---

  /**
   * Computes the k-core decomposition for components within a specific repository.
   * Nodes are filtered to belong to the given repository and have a k-core degree >= k.
   * Uses KùzuDB's built-in k_core_decomposition algorithm.
   * @param repositoryId The ID of the repository.
   * @param k The minimum core degree.
   * @returns A promise that resolves to an object containing the nodes of the k-core and their k-degrees.
   */
  async kCoreDecomposition(repositoryId: string, k: number): Promise<any> {
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      await KuzuDBClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(
        // Keep this as error for debug visibility
        `Ensured graph projection '${globalProjectedGraphName}' exists or was created.`,
      );
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}'. It might already exist or an error occurred:`,
        projectionError,
      );
    }

    const safeRepositoryId = this.escapeStr(repositoryId);
    const kValue = k;

    const query = `
      CALL k_core_decomposition('${globalProjectedGraphName}') YIELD node AS algo_component_node, k_degree
      WITH algo_component_node, k_degree
      WHERE k_degree >= ${kValue}
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, k_degree
    `;

    console.error(
      // Keep this as error for debug visibility
      `Executing kCoreDecomposition for repo ${repositoryId}, k=${kValue}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `kCoreDecomposition for repo ${repositoryId}, k=${kValue}: No result or invalid result type from Kùzu. Projection '${globalProjectedGraphName}' might need to be created.`,
          nodes: [],
          details: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `Nodes in the ${kValue}-core (or higher) for repository ${repositoryId} using projection '${globalProjectedGraphName}'.`,
        // rows now directly contain { component: {...}, k_degree: ... }
        nodes: rows.map((row: any) => row.component ?? row['component']),
        details: rows,
      };
    } catch (error) {
      console.error(
        `Error executing kCoreDecomposition query for repo ${repositoryId}, k=${kValue}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  /**
   * Performs Louvain community detection on components within a specific repository.
   * Uses KùzuDB's built-in louvain algorithm on a projected graph.
   * @param repositoryId The ID of the repository.
   * @returns A promise that resolves to an object containing nodes and their community IDs.
   */
  async louvainCommunityDetection(repositoryId: string): Promise<any> {
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      await KuzuDBClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(
        `Ensured graph projection '${globalProjectedGraphName}' exists or was created for Louvain.`,
      );
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}' for Louvain. It might already exist or an error occurred:`,
        projectionError,
      );
    }

    const safeRepositoryId = this.escapeStr(repositoryId);
    const louvainCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL louvain(${louvainCallParams}) YIELD node AS algo_component_node, louvain_id 
      WITH algo_component_node, louvain_id
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, louvain_id AS community_id 
      ORDER BY community_id, algo_component_node.name 
    `;
    // Changed YIELD to use louvain_id directly, then aliased in RETURN.
    // ORDER BY uses the alias community_id.

    console.error(
      `Executing louvainCommunityDetection for repo ${repositoryId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `louvainCommunityDetection for repo ${repositoryId}: No result or invalid result type. Projection '${globalProjectedGraphName}'`,
          communities: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `Community detection results for repository ${repositoryId} using projection '${globalProjectedGraphName}'.`,
        communities: rows.map((row: any) => ({
          component: row.component ?? row['component'],
          communityId: row.community_id ?? row['community_id'], // This will now pick up the aliased louvain_id
        })),
      };
    } catch (error) {
      console.error(
        `Error executing louvainCommunityDetection query for repo ${repositoryId}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  /**
   * Calculates PageRank for components within a specific repository.
   * Uses KùzuDB's built-in pagerank algorithm on a projected graph.
   * @param repositoryId The ID of the repository.
   * @param dampingFactor Optional damping factor for the PageRank algorithm.
   * @param iterations Optional maximum number of iterations for the PageRank algorithm.
   * @param tolerance Optional tolerance for the PageRank algorithm.
   * @param normalizeInitial Optional flag to normalize initial ranks.
   * @returns A promise that resolves to an object containing nodes and their PageRank scores.
   */
  async pageRank(
    repositoryId: string,
    dampingFactor?: number,
    iterations?: number,
    tolerance?: number,
    normalizeInitial?: boolean,
  ): Promise<any> {
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      await KuzuDBClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(
        // Keep for debug visibility
        `Ensured graph projection '${globalProjectedGraphName}' exists or was created for PageRank.`,
      );
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}' for PageRank. It might already exist or an error occurred:`,
        projectionError,
      );
    }

    const safeRepositoryId = this.escapeStr(repositoryId);
    let callParams = `'${globalProjectedGraphName}'`;
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
    // Kuzu will use its own defaults if these are not appended to callParams

    const query = `
      CALL page_rank(${callParams}) YIELD node AS algo_component_node, rank
      WITH algo_component_node, rank
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, rank
      ORDER BY rank DESC
    `;

    console.error(
      // Keep for debug visibility
      `Executing pageRank for repo ${repositoryId}. Call: CALL page_rank(${callParams})`,
      'Query:',
      query,
    );

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `pageRank for repo ${repositoryId}: No result or invalid result type. Projection '${globalProjectedGraphName}'`,
          ranks: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `PageRank results for repository ${repositoryId} using projection '${globalProjectedGraphName}'.`,
        ranks: rows.map((row: any) => ({
          component: row.component ?? row['component'],
          rank: row.rank ?? row['rank'],
        })),
      };
    } catch (error) {
      console.error(`Error executing pageRank query for repo ${repositoryId}:`, error);
      console.error('Query was:', query);
      throw error;
    }
  }

  /**
   * Finds Strongly Connected Components (SCC) for components within a specific repository.
   * Uses KùzuDB's built-in strongly_connected_components algorithm.
   * @param repositoryId The ID of the repository.
   * @param maxIterations Optional maximum number of iterations for the BFS-based algorithm.
   * @returns A promise that resolves to an object containing nodes and their SCC group IDs.
   */
  async getStronglyConnectedComponents(repositoryId: string, maxIterations?: number): Promise<any> {
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      await KuzuDBClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(`Ensured graph projection '${globalProjectedGraphName}' for SCC.`);
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}' for SCC:`,
        projectionError,
      );
    }

    const safeRepositoryId = this.escapeStr(repositoryId);
    const sccCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL strongly_connected_components(${sccCallParams}) YIELD node AS algo_component_node, component_id AS group_id 
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    console.error(
      `Executing getStronglyConnectedComponents for repo ${repositoryId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );
    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `SCC for repo ${repositoryId}: No result. Projection '${globalProjectedGraphName}'`,
          components: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `SCC results for repository ${repositoryId} using projection '${globalProjectedGraphName}'.`,
        components: rows.map((row: any) => ({
          component: row.component ?? row['component'],
          groupId: row.group_id ?? row['group_id'],
        })),
      };
    } catch (error) {
      console.error(`Error executing SCC query for repo ${repositoryId}:`, error);
      console.error('Query was:', query);
      throw error;
    }
  }

  /**
   * Finds Weakly Connected Components (WCC) for components within a specific repository.
   * Uses KùzuDB's built-in weakly_connected_components algorithm.
   * @param repositoryId The ID of the repository.
   * @param maxIterations Optional maximum number of iterations.
   * @returns A promise that resolves to an object containing nodes and their WCC group IDs.
   */
  async getWeaklyConnectedComponents(repositoryId: string, maxIterations?: number): Promise<any> {
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      await KuzuDBClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(`Ensured graph projection '${globalProjectedGraphName}' for WCC.`);
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}' for WCC:`,
        projectionError,
      );
    }

    const safeRepositoryId = this.escapeStr(repositoryId);
    const wccCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL weakly_connected_components(${wccCallParams}) YIELD node AS algo_component_node, component_id AS group_id
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    console.error(
      `Executing getWeaklyConnectedComponents for repo ${repositoryId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );
    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `WCC for repo ${repositoryId}: No result. Projection '${globalProjectedGraphName}'`,
          components: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `WCC results for repository ${repositoryId} using projection '${globalProjectedGraphName}'.`,
        components: rows.map((row: any) => ({
          component: row.component ?? row['component'],
          groupId: row.group_id ?? row['group_id'],
        })),
      };
    } catch (error) {
      console.error(`Error executing WCC query for repo ${repositoryId}:`, error);
      console.error('Query was:', query);
      throw error;
    }
  }

  // --- Placeholder Advanced Traversal Methods ---

  /**
   * Retrieves the contextual history (Context nodes) for a given item (Component, Decision, or Rule).
   *
   * @param repositoryId The ID of the repository.
   * @param itemYamlId The yaml_id of the item.
   * @param itemType The type of the item ('Component', 'Decision', or 'Rule').
   * @param branch The branch of the item.
   * @returns A promise that resolves to an array of Context objects, ordered by creation date (descending).
   */
  async getItemContextualHistory(
    repositoryId: string,
    itemYamlId: string,
    itemType: 'Component' | 'Decision' | 'Rule',
    branch: string,
  ): Promise<Context[]> {
    const safeRepositoryId = this.escapeStr(repositoryId);
    const safeItemYamlId = this.escapeStr(itemYamlId);
    const escapedBranch = this.escapeStr(branch);

    let itemMatchClause = '';
    let relationshipMatchClause = '';
    let repoItemEnsureClause = '';

    switch (itemType) {
      case 'Component':
        itemMatchClause = `(item:Component {yaml_id: '${safeItemYamlId}', branch: '${escapedBranch}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF]->(item)`;
        repoItemEnsureClause = `(repo)-[:HAS_COMPONENT]->(item)`;
        break;
      case 'Decision':
        itemMatchClause = `(item:Decision {yaml_id: '${safeItemYamlId}', branch: '${escapedBranch}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_DECISION]->(item)`;
        repoItemEnsureClause = `(repo)-[:HAS_DECISION]->(item)`;
        break;
      case 'Rule':
        itemMatchClause = `(item:Rule {yaml_id: '${safeItemYamlId}', branch: '${escapedBranch}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_RULE]->(item)`;
        repoItemEnsureClause = `(repo)-[:HAS_RULE]->(item)`;
        break;
      default:
        const exhaustiveCheck: never = itemType;
        console.error(`Unsupported itemType for getItemContextualHistory: ${exhaustiveCheck}`);
        return [];
    }

    const query = `
      MATCH (repo:Repository {id: '${safeRepositoryId}'}), ${itemMatchClause}
      WHERE ${repoItemEnsureClause} 
      MATCH (repo)-[:HAS_CONTEXT]->(ctx:Context {branch: '${escapedBranch}'}) 
      MATCH ${relationshipMatchClause}
      RETURN DISTINCT ctx
      ORDER BY ctx.created_at DESC
    `;

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for getItemContextualHistory for ${itemYamlId} (${itemType}, branch: ${branch}) in repo ${repositoryId} returned no result or invalid result type.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => row.ctx ?? row['ctx'] ?? row);
    } catch (error) {
      console.error(
        `Error executing getItemContextualHistory for ${itemYamlId} (${itemType}, branch: ${branch}) in repo ${repositoryId}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  /**
   * Retrieves Decision nodes that directly govern a specified Component.
   * Finding governing Rule nodes is more complex without a direct schema relationship (e.g., RULE_APPLIES_TO_COMPONENT).
   * This method currently focuses on Decisions via DECISION_ON.
   *
   * @param repositoryId The ID of the repository.
   * @param componentYamlId The yaml_id of the component.
   * @returns A promise that resolves to an array of Decision objects (or mixed types if Rules were included).
   */
  async getGoverningItemsForComponent(
    repositoryId: string,
    componentYamlId: string,
  ): Promise<Decision[]> {
    const safeRepositoryId = this.escapeStr(repositoryId);
    const safeComponentYamlId = this.escapeStr(componentYamlId);

    const query = `
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(comp:Component {yaml_id: '${safeComponentYamlId}'})
      MATCH (repo)-[:HAS_DECISION]->(dec:Decision)
      MATCH (dec)-[:DECISION_ON]->(comp)
      RETURN DISTINCT dec
    `;

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for getGoverningItemsForComponent for ${componentYamlId} in repo ${repositoryId} returned no result or invalid result type.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => row.dec ?? row['dec'] ?? row);
    } catch (error) {
      console.error(
        `Error executing getGoverningItemsForComponent for ${componentYamlId} in repo ${repositoryId}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  async updateComponentStatus(
    repositoryId: string,
    yamlId: string,
    branch: string,
    status: ComponentStatus,
  ): Promise<Component | null> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedYamlId = this.escapeStr(yamlId);
    const escapedBranch = this.escapeStr(branch);
    const escapedStatus = this.escapeStr(status);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${escapedYamlId}', branch: '${escapedBranch}'})
      SET c.status = '${escapedStatus}', c.updated_at = timestamp('${kuzuTimestamp}')
      RETURN c`;

    try {
      await KuzuDBClient.executeQuery(query);
      return this.findByYamlId(repositoryId, yamlId, branch);
    } catch (error) {
      console.error(
        `Error executing updateComponentStatus for ${yamlId} (branch: ${branch}) in repo ${repositoryId} to status ${status}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  async upsertComponentWithRelationships(component: {
    repository: string;
    branch?: string;
    yaml_id: string;
    name: string;
    kind: string;
    status: ComponentStatus;
    depends_on?: string[] | null;
    content?: string | Record<string, any> | null;
  }): Promise<Component | null> {
    const repositoryId = String(component.repository);
    const branch = component.branch || 'main';
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedComponentYamlId = this.escapeStr(component.yaml_id);
    const escapedBranch = this.escapeStr(branch);
    const escapedName = this.escapeStr(component.name);
    const escapedKind = this.escapeStr(component.kind);
    const escapedStatus = this.escapeStr(component.status);
    // const escapedContent = this.escapeJsonProp(component.content); // Not a direct node property

    const upsertNodeQuery = `
        MERGE (repo:Repository {id: '${escapedRepoId}'})
        MERGE (c:Component {
            yaml_id: '${escapedComponentYamlId}', 
            branch: '${escapedBranch}'
        })
        ON CREATE SET 
            c.name = '${escapedName}',
            c.kind = '${escapedKind}',
            c.status = '${escapedStatus}',
            c.created_at = timestamp('${kuzuTimestamp}'),
            c.updated_at = timestamp('${kuzuTimestamp}'),
            c.repository = repo.id 
        ON MATCH SET 
            c.name = '${escapedName}',
            c.kind = '${escapedKind}',
            c.status = '${escapedStatus}',
            c.updated_at = timestamp('${kuzuTimestamp}')
        MERGE (repo)-[:HAS_COMPONENT]->(c)
        RETURN c`; // Removed c.content assignments

    try {
      await KuzuDBClient.executeQuery(upsertNodeQuery);
    } catch (error) {
      console.error(
        `Error upserting component node ${component.yaml_id} in repo ${repositoryId}:`,
        error,
      );
      console.error('Query was:', upsertNodeQuery);
      throw error;
    }

    // Manage DEPENDS_ON relationships
    // 1. Delete existing outgoing DEPENDS_ON relationships from this component
    const deleteDepsQuery = `
        MATCH (c:Component {yaml_id: '${escapedComponentYamlId}', branch: '${escapedBranch}'})-[r:DEPENDS_ON]->()
        WHERE (:Repository {id: '${escapedRepoId}'})-[:HAS_COMPONENT]->(c)
        DELETE r`;
    await KuzuDBClient.executeQuery(deleteDepsQuery);

    // 2. Add new DEPENDS_ON relationships
    if (component.depends_on && component.depends_on.length > 0) {
      for (const depYamlId of component.depends_on) {
        const escapedDepYamlId = this.escapeStr(depYamlId);
        const addDepQuery = `
            MATCH (repo:Repository {id: '${escapedRepoId}'})
            MATCH (c:Component {yaml_id: '${escapedComponentYamlId}', branch: '${escapedBranch}'})
            WHERE (repo)-[:HAS_COMPONENT]->(c)
            MERGE (dep:Component {yaml_id: '${escapedDepYamlId}', branch: '${escapedBranch}'})
            ON CREATE SET dep.name = 'Placeholder for ${escapedDepYamlId}', dep.kind='Unknown', dep.status='planned', dep.created_at=timestamp('${kuzuTimestamp}'), dep.updated_at=timestamp('${kuzuTimestamp}')
            MERGE (repo)-[:HAS_COMPONENT]->(dep)
            MERGE (c)-[:DEPENDS_ON]->(dep)`;
        try {
          await KuzuDBClient.executeQuery(addDepQuery);
        } catch (relError) {
          console.error(
            `Failed to create DEPENDS_ON relationship from ${component.yaml_id} to ${escapedDepYamlId}:`,
            relError,
          );
          // Decide on error handling
        }
      }
    }
    return this.findByYamlId(repositoryId, component.yaml_id, branch);
  }
}
