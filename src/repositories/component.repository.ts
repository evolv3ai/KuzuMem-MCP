import { Component, Context, Decision, Rule, ComponentStatus, ComponentInput } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId } from '../utils/id.utils';

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
    }
    return String(value).replace(/'/g, "\\\\'").replace(/\\/g, '\\\\\\\\');
  }

  private escapeJsonProp(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    try {
      const jsonString = JSON.stringify(value);
      return `'${this.escapeStr(jsonString)}'`;
    } catch (e) {
      console.error('Failed to stringify JSON for escapeJsonProp', value, e);
      return "'null'";
    }
  }

  /**
   * Get all active components for a specific repository and branch.
   * The repositoryNodeId is the PK of the Repository node (e.g., 'repoName:mainBranch').
   * Components are matched based on their branch property.
   */
  async getActiveComponents(
    repositoryNodeId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedComponentBranch = this.escapeStr(componentBranch);

    const query = `
      MATCH (r:Repository {id: '${escapedRepoNodeId}'})-[:HAS_COMPONENT]->(c:Component {status: 'active', branch: '${escapedComponentBranch}'}) 
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
    // Ensure logical id is mapped, and graph_unique_id is not directly exposed
    return rows.map((row: any) => {
      const componentData = row.c ?? row['c'];
      return {
        ...componentData,
        id: componentData.id,
        graph_unique_id: undefined,
      } as Component;
    });
  }

  /**
   * Creates or updates a component for a repository.
   * Manages DEPENDS_ON relationships by clearing existing ones and creating new ones.
   * Returns the upserted Component or null if not found
   */
  async upsertComponent(
    repositoryNodeId: string,
    component: ComponentInput,
  ): Promise<Component | null> {
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 2) {
      throw new Error(`Invalid repositoryNodeId format: ${repositoryNodeId}`);
    }
    const logicalRepositoryName = repoIdParts[0];

    const componentId = String(component.id);
    const componentBranch = String(component.branch || 'main');
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, componentBranch, componentId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const escapedName = this.escapeStr(component.name);
    const escapedKind = this.escapeStr(component.kind);
    const escapedStatus = this.escapeStr(component.status);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');
    const escapedComponentId = this.escapeStr(componentId);
    const escapedComponentBranch = this.escapeStr(componentBranch);
    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);

    try {
      await KuzuDBClient.executeQuery('BEGIN TRANSACTION');
      console.error(`DEBUG: upsertComponent - BEGAN TRANSACTION for ${graphUniqueId}`);

      // Check existence using findByIdAndBranch (which is a separate query/transaction if not wrapped)
      // For true atomicity, existence check should also be part of this transaction,
      // or rely entirely on MERGE's atomicity for the node.
      // Let's use MERGE for the main component node to simplify the transaction block.

      const upsertNodeQuery = `
        MATCH (repo:Repository {id: '${escapedRepoNodeId}'})
        MERGE (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})
        ON CREATE SET
          c.id = '${escapedComponentId}', 
          c.name = '${escapedName}', 
          c.kind = '${escapedKind}', 
          c.status = '${escapedStatus}', 
          c.branch = '${escapedComponentBranch}',
          c.created_at = timestamp('${kuzuTimestamp}'),
          c.updated_at = timestamp('${kuzuTimestamp}')
        ON MATCH SET 
          c.name = '${escapedName}', 
          c.kind = '${escapedKind}', 
          c.status = '${escapedStatus}', 
          c.id = '${escapedComponentId}', 
          c.branch = '${escapedComponentBranch}', 
          c.updated_at = timestamp('${kuzuTimestamp}')
        MERGE (repo)-[:HAS_COMPONENT]->(c)
      `;
      await KuzuDBClient.executeQuery(upsertNodeQuery);
      console.error(`DEBUG: upsertComponent - Upserted main node ${graphUniqueId}`);

      const deleteDepsQuery = `
          MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})-[r:DEPENDS_ON]->()
          DELETE r`;
      await KuzuDBClient.executeQuery(deleteDepsQuery);
      console.error(`DEBUG: upsertComponent - Deleted existing deps for ${graphUniqueId}`);

      if (component.depends_on && component.depends_on.length > 0) {
        for (const depId of component.depends_on) {
          const depGraphUniqueId = formatGraphUniqueId(
            logicalRepositoryName,
            componentBranch,
            depId,
          );
          const escapedDepGraphUniqueId = this.escapeStr(depGraphUniqueId);

          const ensureDepNodeQuery = `
              MATCH (repo:Repository {id: '${escapedRepoNodeId}'}) 
              MERGE (dep:Component {graph_unique_id: '${escapedDepGraphUniqueId}'})
              ON CREATE SET 
                  dep.id = '${this.escapeStr(depId)}', 
                  dep.branch = '${escapedComponentBranch}', 
                  dep.name = 'Placeholder: ${this.escapeStr(depId)}', 
                  dep.kind='Unknown', 
                  dep.status='planned', 
                  dep.created_at=timestamp('${kuzuTimestamp}'), 
                  dep.updated_at=timestamp('${kuzuTimestamp}')
              MERGE (repo)-[:HAS_COMPONENT]->(dep)`;
          await KuzuDBClient.executeQuery(ensureDepNodeQuery);
          console.error(
            `DEBUG: upsertComponent - Ensured/Created dependency node: ${escapedDepGraphUniqueId}`,
          );

          const checkCQuery = `MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN c.id AS componentId`;
          const checkDQuery = `MATCH (d:Component {graph_unique_id: '${escapedDepGraphUniqueId}'}) RETURN d.id AS depId`;
          const cResult = await KuzuDBClient.executeQuery(checkCQuery);
          const dResult = await KuzuDBClient.executeQuery(checkDQuery);
          const cRows = await cResult.getAll();
          const dRows = await dResult.getAll();
          console.error(
            `DEBUG: upsertComponent - Pre-CREATE check: Found parent c (${escapedGraphUniqueId})? ${cRows.length > 0}. Found dep d (${escapedDepGraphUniqueId})? ${dRows.length > 0}`,
          );

          const addDepRelQuery = `
            MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) 
            MATCH (dep:Component {graph_unique_id: '${escapedDepGraphUniqueId}'})
            CREATE (c)-[r:DEPENDS_ON]->(dep) RETURN count(r)`;

          console.error(
            `DEBUG: upsertComponent - Attempting DEPENDS_ON: ${escapedGraphUniqueId} -> ${escapedDepGraphUniqueId}`,
          );
          const relCreateResult = await KuzuDBClient.executeQuery(addDepRelQuery);
          const relCreateRows = await relCreateResult.getAll();
          console.error(
            `DEBUG: upsertComponent - Executed CREATE for DEPENDS_ON, rows returned: ${relCreateRows.length}, content: ${JSON.stringify(relCreateRows)}`,
          );
        }
      }
      await KuzuDBClient.executeQuery('COMMIT');
      console.error(`DEBUG: upsertComponent - COMMITTED TRANSACTION for ${graphUniqueId}`);
      return this.findByIdAndBranch(logicalRepositoryName, componentId, componentBranch);
    } catch (error) {
      console.error(`ERROR in upsertComponent for ${graphUniqueId}:`, error);
      try {
        await KuzuDBClient.executeQuery('ROLLBACK');
        console.error(`DEBUG: upsertComponent - ROLLED BACK TRANSACTION for ${graphUniqueId}`);
      } catch (rollbackError) {
        console.error(
          `CRITICAL ERROR: Failed to ROLLBACK transaction for ${graphUniqueId}:`,
          rollbackError,
        );
      }
      throw error; // Re-throw original error
    }
  }

  /**
   * Find a component by its logical ID and branch, within a given repository context.
   * The repositoryId here refers to the name of the repository for ID formatting.
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Component | null> {
    const graphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const query = `
      MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) 
      RETURN c LIMIT 1`;

    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    const componentData = rows[0].c ?? rows[0]['c'];
    return {
      ...componentData,
      id: componentData.id,
      graph_unique_id: undefined,
    } as Component;
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON).
   * All components (start and dependencies) are assumed to be within the same repositoryName and componentBranch context.
   */
  async getComponentDependencies(
    repositoryName: string, // Logical name of the repository, e.g., 'my-cool-project'
    componentId: string, // Logical ID of the starting component, e.g., 'ui-module'
    componentBranch: string, // Branch of the starting component AND its dependencies, e.g., 'main'
  ): Promise<Component[]> {
    const startNodeGraphUniqueId = formatGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );
    const escapedStartNodeGraphUniqueId = this.escapeStr(startNodeGraphUniqueId);
    const escapedComponentBranch = this.escapeStr(componentBranch); // For filtering dependencies
    console.error(
      `DEBUG: getComponentDependencies - Looking for deps of: ${startNodeGraphUniqueId}, branch filter: ${componentBranch}`,
    ); // Log query params

    // This query assumes that any depended-upon component (dep)
    // will also have its graph_unique_id formatted with the same repositoryName and componentBranch.
    const query = `
      MATCH (c:Component {graph_unique_id: '${escapedStartNodeGraphUniqueId}'})
      MATCH (c)-[:DEPENDS_ON]->(dep:Component)
      WHERE dep.branch = '${escapedComponentBranch}' 
      RETURN DISTINCT dep
    `;
    console.error('DEBUG: getComponentDependencies EXECUTING QUERY (direct):', query);
    // We also need to ensure dep.id is populated from the node, and graph_unique_id is not exposed.
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => {
      const depData = row.dep ?? row['dep'];
      return {
        ...depData,
        id: depData.id,
        graph_unique_id: undefined,
      } as Component;
    });
  }

  /**
   * Get all downstream dependents for a component (transitive).
   * All components are assumed to be within the same repositoryName and componentBranch context.
   */
  async getComponentDependents(
    repositoryName: string,
    componentId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    const targetNodeGraphUniqueId = formatGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );
    const escapedTargetNodeGraphUniqueId = this.escapeStr(targetNodeGraphUniqueId);
    const escapedComponentBranch = this.escapeStr(componentBranch); // For filtering dependents
    console.error(
      `DEBUG: getComponentDependents - Looking for those that depend on: ${targetNodeGraphUniqueId}, branch filter: ${componentBranch}`,
    ); // Log query params

    const query = `
      MATCH (targetComp:Component {graph_unique_id: '${escapedTargetNodeGraphUniqueId}'})
      MATCH (dependentComp:Component)-[:DEPENDS_ON]->(targetComp)
      WHERE dependentComp.branch = '${escapedComponentBranch}' 
      RETURN DISTINCT dependentComp
    `;
    console.error('DEBUG: getComponentDependents EXECUTING QUERY (direct):', query);
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      console.warn(
        `Query for getComponentDependents for ${componentId} (branch ${componentBranch}) in repo ${repositoryName} returned no result or invalid result type.`,
      );
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => {
      const depData = row.dependentComp ?? row['dependentComp'];
      return {
        ...depData,
        id: depData.id,
        graph_unique_id: undefined,
      } as Component;
    });
  }

  /**
   * Get related items for a component based on specified relationship types, depth, and direction.
   * All components are assumed to be within the same repositoryName and componentBranch context.
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
    // console.error for relTypeSpec can be removed if no longer needed for active debugging

    let pathRelationship = `-[r${relTypeSpec}*1..${currentDepth}]-`;
    if (currentDirection === 'OUTGOING') {
      pathRelationship = `-[r${relTypeSpec}*1..${currentDepth}]->`;
    } else if (currentDirection === 'INCOMING') {
      pathRelationship = `<-[r${relTypeSpec}*1..${currentDepth}]-`;
    }
    // console.error for pathRelationship can be removed

    const startNodeGraphUniqueId = formatGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );
    const escapedStartNodeGraphUniqueId = this.escapeStr(startNodeGraphUniqueId);

    const query = `
      MATCH (startNode:Component {graph_unique_id: '${escapedStartNodeGraphUniqueId}'})
      MATCH (startNode)${pathRelationship}(relatedItem:Component)
      WHERE relatedItem.branch = '${escapedComponentBranch}' 
      RETURN DISTINCT relatedItem
    `;

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for getRelatedItems for ${componentId} (branch ${componentBranch}) in repo ${repositoryName} returned no result or invalid result type.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => {
        const itemData = row.relatedItem ?? row['relatedItem'];
        return {
          ...itemData,
          id: itemData.id,
          graph_unique_id: undefined,
        } as Component;
      });
    } catch (error) {
      console.error(
        `Error executing getRelatedItems query for ${componentId} (branch ${componentBranch}) in repo ${repositoryName}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  /**
   * Finds the shortest path between two components in a repository, assuming they are on the same branch.
   */
  async findShortestPath(
    repositoryName: string, // Logical name of the repository
    startNodeId: string, // Logical ID of the start component
    startNodeBranch: string, // Branch of the start component (and assumed for the path & end component)
    endNodeId: string, // Logical ID of the end component
    // endNodeBranch is assumed to be same as startNodeBranch for this path query
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
        relTypeString = ':' + sanitizedTypes.join('|');
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
    const hops = '1..10'; // Kùzu example: -[:Follows* SHORTEST 1..5]->
    const relationshipPattern = `[${relTypeString}* SHORTEST ${hops}]`;

    const startGraphUniqueId = formatGraphUniqueId(repositoryName, startNodeBranch, startNodeId);
    const endGraphUniqueId = formatGraphUniqueId(repositoryName, startNodeBranch, endNodeId); // Assuming end node is on the same branch

    const escapedStartGraphUniqueId = this.escapeStr(startGraphUniqueId);
    const escapedEndGraphUniqueId = this.escapeStr(endGraphUniqueId);
    // Removed escapeStr for repositoryId as it's not directly used in this simplified query

    // This query relies on graph_unique_id to scope nodes to the correct repo/branch/id combination.
    const query = `
      MATCH (startNode:Component {graph_unique_id: '${escapedStartGraphUniqueId}'}), 
            (endNode:Component {graph_unique_id: '${escapedEndGraphUniqueId}'})
      MATCH path = (startNode)${arrowLeft}${relationshipPattern}${arrowRight}(endNode)
      RETURN path
    `;
    // Removed explicit MATCH for (repo) and WHERE clauses linking to repo, as graph_unique_id should suffice.

    console.error(`DEBUG: findShortestPath query: ${query}`);

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for findShortestPath from ${startNodeId} to ${endNodeId} (branch ${startNodeBranch}, repo ${repositoryName}) returned no result or invalid result type.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => {
        const pathData = row.path ?? row['path'];
        if (pathData && pathData._nodes) {
          // Kùzu returns path with _nodes and _rels
          // We need to map these internal node structures to our Component type
          return pathData._nodes.map((node: any) => ({
            ...node,
            id: node.id, // Assuming Kùzu node object has the logical id property we set
            graph_unique_id: undefined,
          })) as Component[];
        }
        return pathData; // Fallback, though should always have _nodes if path found
      });
    } catch (error) {
      console.error(
        `Error executing findShortestPath query from ${startNodeId} to ${endNodeId} (branch ${startNodeBranch}, repo ${repositoryName}):`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  // --- Graph Algorithm Methods ---
  async kCoreDecomposition(repositoryNodeId: string, k: number): Promise<any> {
    // repositoryNodeId is repoName:repoBranch
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      await KuzuDBClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(
        `Ensured graph projection '${globalProjectedGraphName}' exists or was created.`,
      );
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}'. It might already exist or an error occurred:`,
        projectionError,
      );
    }

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const kValue = k;

    const query = `
      CALL k_core_decomposition('${globalProjectedGraphName}') YIELD node AS algo_component_node, k_degree
      WITH algo_component_node, k_degree
      WHERE k_degree >= ${kValue}
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, k_degree
    `;

    console.error(
      `Executing kCoreDecomposition for repo ${repositoryNodeId}, k=${kValue}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `kCoreDecomposition for repo ${repositoryNodeId}, k=${kValue}: No result. Projection '${globalProjectedGraphName}' might need to be created.`,
          nodes: [],
          details: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `Nodes in the ${kValue}-core (or higher) for repository ${repositoryNodeId} using projection '${globalProjectedGraphName}'.`,
        nodes: rows.map((row: any) => {
          const compData = row.component ?? row['component'];
          return { ...compData, id: compData.id, graph_unique_id: undefined } as Component;
        }),
        details: rows.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          },
          k_degree: row.k_degree ?? row['k_degree'],
        })),
      };
    } catch (error) {
      console.error(
        `Error executing kCoreDecomposition query for repo ${repositoryNodeId}, k=${kValue}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  async louvainCommunityDetection(repositoryNodeId: string): Promise<any> {
    // repositoryNodeId is repoName:repoBranch
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      await KuzuDBClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(`Ensured graph projection '${globalProjectedGraphName}' for Louvain.`);
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}' for Louvain:`,
        projectionError,
      );
    }

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const louvainCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL louvain(${louvainCallParams}) YIELD node AS algo_component_node, louvain_id 
      WITH algo_component_node, louvain_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, louvain_id AS community_id 
      ORDER BY community_id, algo_component_node.name 
    `;

    console.error(
      `Executing louvainCommunityDetection for repo ${repositoryNodeId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `louvainCommunityDetection for repo ${repositoryNodeId}: No result. Projection '${globalProjectedGraphName}'`,
          communities: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `Community detection results for repository ${repositoryNodeId} using projection '${globalProjectedGraphName}'.`,
        communities: rows.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          communityId: row.community_id ?? row['community_id'],
        })),
      };
    } catch (error) {
      console.error(
        `Error executing louvainCommunityDetection query for repo ${repositoryNodeId}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  async pageRank(
    repositoryNodeId: string, // repositoryNodeId is repoName:repoBranch
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
      console.error(`Ensured graph projection '${globalProjectedGraphName}' for PageRank.`);
    } catch (projectionError) {
      console.warn(
        `Could not ensure graph projection '${globalProjectedGraphName}' for PageRank:`,
        projectionError,
      );
    }

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
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

    const query = `
      CALL page_rank(${callParams}) YIELD node AS algo_component_node, rank
      WITH algo_component_node, rank
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, rank
      ORDER BY rank DESC
    `;

    console.error(
      `Executing pageRank for repo ${repositoryNodeId}. Call: CALL page_rank(${callParams})`,
      'Query:',
      query,
    );

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `pageRank for repo ${repositoryNodeId}: No result. Projection '${globalProjectedGraphName}'`,
          ranks: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `PageRank results for repository ${repositoryNodeId} using projection '${globalProjectedGraphName}'.`,
        ranks: rows.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          rank: row.rank ?? row['rank'],
        })),
      };
    } catch (error) {
      console.error(`Error executing pageRank query for repo ${repositoryNodeId}:`, error);
      console.error('Query was:', query);
      throw error;
    }
  }

  async getStronglyConnectedComponents(
    repositoryNodeId: string,
    maxIterations?: number,
  ): Promise<any> {
    // repositoryNodeId is repoName:repoBranch
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

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const sccCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL strongly_connected_components(${sccCallParams}) YIELD node AS algo_component_node, component_id AS group_id 
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    console.error(
      `Executing getStronglyConnectedComponents for repo ${repositoryNodeId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );
    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `SCC for repo ${repositoryNodeId}: No result. Projection '${globalProjectedGraphName}'`,
          components: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `SCC results for repository ${repositoryNodeId} using projection '${globalProjectedGraphName}'.`,
        components: rows.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          groupId: row.group_id ?? row['group_id'],
        })),
      };
    } catch (error) {
      console.error(`Error executing SCC query for repo ${repositoryNodeId}:`, error);
      console.error('Query was:', query);
      throw error;
    }
  }

  async getWeaklyConnectedComponents(
    repositoryNodeId: string,
    maxIterations?: number,
  ): Promise<any> {
    // repositoryNodeId is repoName:repoBranch
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

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const wccCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL weakly_connected_components(${wccCallParams}) YIELD node AS algo_component_node, component_id AS group_id
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})-[:HAS_COMPONENT]->(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    console.error(
      `Executing getWeaklyConnectedComponents for repo ${repositoryNodeId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );
    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        return {
          message: `WCC for repo ${repositoryNodeId}: No result. Projection '${globalProjectedGraphName}'`,
          components: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `WCC results for repository ${repositoryNodeId} using projection '${globalProjectedGraphName}'.`,
        components: rows.map((row: any) => ({
          component: {
            ...(row.component ?? row['component']),
            id: (row.component ?? row['component']).id,
            graph_unique_id: undefined,
          } as Component,
          groupId: row.group_id ?? row['group_id'],
        })),
      };
    } catch (error) {
      console.error(`Error executing WCC query for repo ${repositoryNodeId}:`, error);
      console.error('Query was:', query);
      throw error;
    }
  }

  // --- Placeholder Advanced Traversal Methods ---

  /**
   * Retrieves the contextual history (Context nodes) for a given item (Component, Decision, or Rule).
   * Assumes item and its contexts are within the same repositoryName and itemBranch.
   */
  async getItemContextualHistory(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<Context[]> {
    const itemGraphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);
    const escapedItemGraphUniqueId = this.escapeStr(itemGraphUniqueId);
    const escapedItemBranch = this.escapeStr(itemBranch); // Branch for the item and its contexts

    // We need the Repository node's ID to link via HAS_CONTEXT, HAS_COMPONENT etc.
    // This assumes a primary branch for the repository itself if not explicit.
    // For now, let's assume repositoryName can be used to find a main Repository node
    // or the caller (service layer) must provide the specific Repository node ID.
    // Let's adjust to require repositoryNodeId (repoName:repoBranch) for clarity.
    // This function is complex; for now, we continue with repositoryName and derive repoNodeId implicitly
    // or assume graph_unique_id for items is sufficient to scope them if queries are structured well.

    let itemMatchClause = '';
    let relationshipMatchClause = '';
    // Removed repoItemEnsureClause as graph_unique_id should ensure item uniqueness.
    // The link to Repository for context is via (repo)-[:HAS_CONTEXT]->(ctx)

    switch (itemType) {
      case 'Component':
        itemMatchClause = `(item:Component {graph_unique_id: '${escapedItemGraphUniqueId}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF]->(item)`;
        break;
      case 'Decision':
        itemMatchClause = `(item:Decision {graph_unique_id: '${escapedItemGraphUniqueId}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_DECISION]->(item)`;
        break;
      case 'Rule':
        itemMatchClause = `(item:Rule {graph_unique_id: '${escapedItemGraphUniqueId}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_RULE]->(item)`;
        break;
      default:
        const exhaustiveCheck: never = itemType;
        console.error(`Unsupported itemType for getItemContextualHistory: ${exhaustiveCheck}`);
        return [];
    }

    // Query needs to find the Repository node that matches repositoryName and itemBranch (if repo branches are a thing)
    // Then find Contexts linked to THAT repo, on the itemBranch, then linked to the item.
    // Simplification: graph_unique_id of item is the primary point. Contexts are filtered by branch.
    // The HAS_CONTEXT implies a repository, but which one? Assume all contexts share branch with item.
    const query = `
      MATCH ${itemMatchClause} 
      MATCH (ctx:Context {branch: '${escapedItemBranch}'}) 
      MATCH ${relationshipMatchClause}
      RETURN DISTINCT ctx
      ORDER BY ctx.created_at DESC
    `;
    // graph_unique_id attaches this query to specific repository and branch
    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for getItemContextualHistory for ${itemId} (${itemType}, branch: ${itemBranch}) in repo ${repositoryName} returned no result.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => {
        const ctxData = row.ctx ?? row['ctx'];
        return { ...ctxData, id: ctxData.id, graph_unique_id: undefined } as Context;
      });
    } catch (error) {
      console.error(
        `Error executing getItemContextualHistory for ${itemId} (${itemType}, branch: ${itemBranch}) in repo ${repositoryName}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  async getGoverningItemsForComponent(
    repositoryName: string, // Logical name of the repository
    componentId: string, // Logical ID of the component
    componentBranch: string, // Branch of the component (and assumed for its governing decisions)
  ): Promise<Decision[]> {
    const componentGraphUniqueId = formatGraphUniqueId(
      repositoryName,
      componentBranch,
      componentId,
    );
    const escapedComponentGraphUniqueId = this.escapeStr(componentGraphUniqueId);
    const escapedComponentBranch = this.escapeStr(componentBranch); // For filtering decisions

    // This query assumes Decisions are on the same branch as the component they govern.
    const query = `
      MATCH (comp:Component {graph_unique_id: '${escapedComponentGraphUniqueId}'})
      MATCH (dec:Decision {branch: '${escapedComponentBranch}'})-[:DECISION_ON]->(comp)
      RETURN DISTINCT dec
    `;
    // graph_unique_id attaches this query to specific repository and branch

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for getGoverningItemsForComponent for ${componentId} (branch: ${componentBranch}) in repo ${repositoryName} returned no result.`,
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => {
        const decData = row.dec ?? row['dec'];
        return { ...decData, id: decData.id, graph_unique_id: undefined } as Decision;
      });
    } catch (error) {
      console.error(
        `Error executing getGoverningItemsForComponent for ${componentId} (branch: ${componentBranch}) in repo ${repositoryName}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  async updateComponentStatus(
    repositoryName: string,
    itemId: string,
    branch: string,
    status: ComponentStatus,
  ): Promise<Component | null> {
    const graphUniqueId = formatGraphUniqueId(repositoryName, branch, itemId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);
    const escapedStatus = this.escapeStr(status);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const query = `
      MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})
      SET c.status = '${escapedStatus}', c.updated_at = timestamp('${kuzuTimestamp}')
      RETURN c`;

    try {
      await KuzuDBClient.executeQuery(query);
      return this.findByIdAndBranch(repositoryName, itemId, branch);
    } catch (error) {
      console.error(
        `Error executing updateComponentStatus for ${itemId} (branch: ${branch}) in repo ${repositoryName} to status ${status}:`,
        error,
      );
      console.error('Query was:', query);
      throw error;
    }
  }

  async upsertComponentWithRelationships(component: {
    repository: string;
    branch?: string;
    id: string;
    name: string;
    kind: string;
    status: ComponentStatus;
    depends_on?: string[] | null;
  }): Promise<Component | null> {
    const repositoryNodeId = String(component.repository);

    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length === 0) {
      throw new Error(
        `Invalid repositoryNodeId format in component.repository: ${repositoryNodeId}`,
      );
    }
    const logicalRepositoryName = repoIdParts[0];

    const componentBranch = component.branch || 'main';
    const componentId = component.id;
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, componentBranch, componentId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const escapedName = this.escapeStr(component.name);
    const escapedKind = this.escapeStr(component.kind);
    const escapedStatus = this.escapeStr(component.status);
    const escapedLogicalId = this.escapeStr(componentId);
    const escapedComponentBranch = this.escapeStr(componentBranch);

    const upsertNodeQuery = `
        MATCH (repo:Repository {id: '${this.escapeStr(repositoryNodeId)}'}) 
        MERGE (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})
        ON CREATE SET 
            c.id = '${escapedLogicalId}',
            c.branch = '${escapedComponentBranch}',
            c.name = '${escapedName}',
            c.kind = '${escapedKind}',
            c.status = '${escapedStatus}',
            c.created_at = timestamp('${kuzuTimestamp}'),
            c.updated_at = timestamp('${kuzuTimestamp}')
        ON MATCH SET 
            c.name = '${escapedName}',
            c.kind = '${escapedKind}',
            c.status = '${escapedStatus}',
            c.id = '${escapedLogicalId}',        // Also set logical id/branch on match for consistency
            c.branch = '${escapedComponentBranch}',
            c.updated_at = timestamp('${kuzuTimestamp}')
        MERGE (repo)-[:HAS_COMPONENT]->(c)
        RETURN c`;

    try {
      await KuzuDBClient.executeQuery(upsertNodeQuery);
    } catch (error) {
      console.error(
        `Error upserting component node ${componentId} in repo ${logicalRepositoryName} (branch: ${componentBranch}):`,
        error,
      );
      console.error('Query was:', upsertNodeQuery);
      throw error;
    }

    const deleteDepsQuery = `
        MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})-[r:DEPENDS_ON]->()
        DELETE r`;
    await KuzuDBClient.executeQuery(deleteDepsQuery);

    if (component.depends_on && component.depends_on.length > 0) {
      for (const depId of component.depends_on) {
        const depGraphUniqueId = formatGraphUniqueId(logicalRepositoryName, componentBranch, depId);
        const escapedDepGraphUniqueId = this.escapeStr(depGraphUniqueId);

        const ensureDepNodeQuery = `
            MATCH (repo:Repository {id: '${this.escapeStr(repositoryNodeId)}'}) 
            MERGE (dep:Component {graph_unique_id: '${escapedDepGraphUniqueId}'})
            ON CREATE SET dep.id = '${this.escapeStr(depId)}', dep.branch = '${this.escapeStr(componentBranch)}', dep.name = 'Placeholder for ${this.escapeStr(depId)}', dep.kind='Unknown', dep.status='planned', dep.created_at=timestamp('${kuzuTimestamp}'), dep.updated_at=timestamp('${kuzuTimestamp}')
            MERGE (repo)-[:HAS_COMPONENT]->(dep)`;

        await KuzuDBClient.executeQuery(ensureDepNodeQuery);
        console.error(
          `DEBUG: upsertCompWithRel - Ensured/Created dependency node: ${escapedDepGraphUniqueId}`,
        );

        const checkCQuery = `MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN c.id AS componentId`;
        const checkDQuery = `MATCH (d:Component {graph_unique_id: '${escapedDepGraphUniqueId}'}) RETURN d.id AS depId`;
        const cResult = await KuzuDBClient.executeQuery(checkCQuery);
        const dResult = await KuzuDBClient.executeQuery(checkDQuery);
        const cRows = await cResult.getAll();
        const dRows = await dResult.getAll();
        console.error(
          `DEBUG: upsertCompWithRel - Pre-CREATE check: Found parent c (${escapedGraphUniqueId})? ${cRows.length > 0}. Found dep d (${escapedDepGraphUniqueId})? ${dRows.length > 0}`,
        );

        const addDepRelQuery = `
            MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) 
            MATCH (dep:Component {graph_unique_id: '${escapedDepGraphUniqueId}'})
            CREATE (c)-[r:DEPENDS_ON]->(dep) RETURN count(r)`;

        console.error(
          `DEBUG: upsertCompWithRel - Attempting DEPENDS_ON: ${escapedGraphUniqueId} -> ${escapedDepGraphUniqueId}`,
        );
        const relCreateResult = await KuzuDBClient.executeQuery(addDepRelQuery);
        const relCreateRows = await relCreateResult.getAll();
        console.error(
          `DEBUG: upsertCompWithRel - Executed CREATE for DEPENDS_ON, rows returned: ${relCreateRows.length}, content: ${JSON.stringify(relCreateRows)}`,
        );
      }
    }
    return this.findByIdAndBranch(logicalRepositoryName, componentId, componentBranch);
  }
}
