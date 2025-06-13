import { KuzuDBClient } from '../db/kuzu';
import { Component, ComponentInput, ComponentStatus, Context, Decision } from '../types';
import { formatGraphUniqueId } from '../utils/id.utils';
import { RepositoryRepository } from './repository.repository';

/**
 * Repository for Component, using KuzuDB and Cypher queries.
 * An instance is tied to a specific KuzuDBClient.
 */
export class ComponentRepository {
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository;

  // Helper to escape strings for Cypher queries to prevent injection
  private escapeStr(value: string): string {
    if (typeof value !== 'string') {
      return ''; // Or throw an error, depending on desired strictness
    }
    // Basic escape: replace single quotes. Kuzu might have more specific needs.
    return value.replace(/'/g, "\\'");
  }

  /**
   * Constructor now public and requires a KuzuDBClient and RepositoryRepository.
   * @param kuzuClient An initialized KuzuDBClient instance.
   * @param repositoryRepo An initialized RepositoryRepository instance.
   */
  public constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    if (!kuzuClient) {
      throw new Error('ComponentRepository requires an initialized KuzuDBClient instance.');
    }
    if (!repositoryRepo) {
      throw new Error('ComponentRepository requires an initialized RepositoryRepository instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  /**
   * Helper to format Kuzu component data to internal Component type
   * @param kuzuRowData The raw data from KuzuDB
   * @param repositoryName The logical name of the repository
   * @param branch The branch of the component
   * @returns A formatted Component object
   */
  private formatKuzuRowToComponent(
    kuzuRowData: any,
    repositoryName: string,
    branch: string,
  ): Component {
    const rawComponent = kuzuRowData.properties || kuzuRowData;
    const logicalId = rawComponent.id?.toString();
    return {
      id: logicalId,
      name: rawComponent.name,
      kind: rawComponent.kind,
      status: rawComponent.status,
      branch: rawComponent.branch,
      repository: `${repositoryName}:${branch}`,
      depends_on: Array.isArray(rawComponent.depends_on)
        ? rawComponent.depends_on.map(String)
        : rawComponent.depends_on
          ? [String(rawComponent.depends_on)]
          : [],
      created_at: rawComponent.created_at ? new Date(rawComponent.created_at) : new Date(),
      updated_at: rawComponent.updated_at ? new Date(rawComponent.updated_at) : new Date(),
    } as Component;
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
    const logger = console; // Placeholder for actual logger
    const query = `
      MATCH (r:Repository {id: $repositoryNodeId})<-[:PART_OF]-(c:Component)
      WHERE c.status = $status AND c.branch = $componentBranch 
      RETURN c ORDER BY c.name ASC
    `;
    const params = { repositoryNodeId, status: 'active', componentBranch };
    try {
      logger.debug(
        `[ComponentRepository] Getting active components for ${repositoryNodeId}, branch ${componentBranch}`,
      );
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToComponent(row.c, repoNameFromNodeId, componentBranch),
      );
    } catch (error: any) {
      logger.error(
        `[ComponentRepository] Error in getActiveComponents for ${repositoryNodeId}, branch ${componentBranch}: ${error.message}`,
        { stack: error.stack },
      );
      return [];
    }
  }

  /**
   * Finds the shortest path between two components in a repository, assuming they are on the same branch.
   */
  async findShortestPath(
    repositoryName: string,
    startNodeId: string,
    startNodeBranch: string,
    endNodeId: string,
    params?: {
      relationshipTypes?: string[];
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
      algorithm?: string; // Keep for future use, though Kuzu shortest path Cypher is specific
      projectedGraphName?: string; // Will be used if Kuzu's path MATCH needs it
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
    },
  ): Promise<{ path: Component[]; length: number; error?: string | null }> {
    // Corrected return type
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
      arrowLeft = '<- '; // Added space for clarity in Cypher if needed
      arrowRight = '-';
    } else if (params?.direction === 'BOTH') {
      arrowLeft = '-';
      arrowRight = '-';
    }
    // Kuzu's *shortest* path variant usually implies finding one path. Default hop [1..10] is reasonable.
    const relationshipPattern = `[${relTypeString}* SHORTEST 1..10]`;

    const startGraphUniqueId = formatGraphUniqueId(repositoryName, startNodeBranch, startNodeId);
    const endGraphUniqueId = formatGraphUniqueId(repositoryName, startNodeBranch, endNodeId);

    const escapedStartGraphUniqueId = this.escapeStr(startGraphUniqueId);
    const escapedEndGraphUniqueId = this.escapeStr(endGraphUniqueId);

    // Standard Cypher for shortest path. Kuzu should support this.
    // Using projectedGraphName here is tricky if it's not a Kuzu CALL algo(graphName)
    // For now, assume the default graph contains the necessary data if projection isn't used by a CALL.
    // If Kuzu's MATCH...RETURN path needs explicit graph context, this query would need to change significantly.
    const query = `
      MATCH (startNode:Component {graph_unique_id: '${escapedStartGraphUniqueId}'}), 
            (endNode:Component {graph_unique_id: '${escapedEndGraphUniqueId}'})
      MATCH p = (startNode)${arrowLeft}${relationshipPattern}${arrowRight}(endNode)
      RETURN p AS path ORDER BY length(p) LIMIT 1
    `; // Added ORDER BY length(p) LIMIT 1 to ensure one shortest path

    console.error(`DEBUG: ComponentRepository.findShortestPath query: ${query}`);

    try {
      const result = await this.kuzuClient.executeQuery(query);
      if (!result || typeof result.getAll !== 'function') {
        console.warn(
          `Query for findShortestPath from ${startNodeId} to ${endNodeId} returned invalid result type.`,
        );
        return { path: [], length: 0, error: 'Query returned invalid result type.' };
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0 || !rows[0].path) {
        console.log(`DEBUG: No path found by query for ${startNodeId} -> ${endNodeId}`);
        return { path: [], length: 0, error: null }; // No path found is not an error, just empty result
      }

      const kuzuPathObject = rows[0].path; // This is Kuzu's path structure

      const nodes: Component[] = (kuzuPathObject._nodes || []).map((node: any) => ({
        ...(node._properties || node), // Kuzu node properties might be under _properties
        id: (node._properties || node).id,
        graph_unique_id: undefined,
      }));

      const pathLength = (kuzuPathObject._rels || []).length;

      return { path: nodes, length: pathLength, error: null };
    } catch (error: any) {
      console.error(
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

  async updateComponentStatus(
    repositoryName: string,
    itemId: string, // Logical ID of the component
    branch: string,
    status: ComponentStatus, // This is from '../types', e.g., 'active' | 'deprecated' | 'planned'
  ): Promise<Component | null> {
    const logger = console; // Placeholder for actual logger
    const graphUniqueId = formatGraphUniqueId(repositoryName, branch, itemId);
    const now = new Date(); // For updated_at timestamp

    const query = `
      MATCH (c:Component {graph_unique_id: $graphUniqueId})
      SET c.status = $status, c.updated_at = $updatedAt
      RETURN c
    `; // Kuzu might need specific timestamp formatting for $updatedAt, or driver handles Date obj

    const params = {
      graphUniqueId,
      status,
      updatedAt: now, // Pass Date object, Kuzu driver should handle conversion
    };

    try {
      logger.debug(
        `[ComponentRepository] Updating status for component ${graphUniqueId} to ${status}`,
      );
      const result = await this.kuzuClient.executeQuery(query, params);

      // Check if the update was successful and a node was returned
      if (result && result.length > 0 && result[0].c) {
        logger.info(
          `[ComponentRepository] Status updated for component ${graphUniqueId} to ${status}`,
        );
        // The RETURN c might give the updated node. Format it.
        return this.formatKuzuRowToComponent(result[0].c, repositoryName, branch);
      } else {
        // If MATCH failed or RETURN c was empty, the component might not exist or update failed silently
        logger.warn(
          `[ComponentRepository] Component ${graphUniqueId} not found or status update failed to return node.`,
        );
        // Attempt to fetch to confirm, or return null if update implies existence
        return this.findByIdAndBranch(repositoryName, itemId, branch);
      }
    } catch (error: any) {
      logger.error(
        `[ComponentRepository] Error executing updateComponentStatus for ${graphUniqueId} to status ${status}: ${error.message}`,
        { stack: error.stack, query, params },
      );
      throw error; // Re-throw for service layer to handle
    }
  }

  async upsertComponent(
    repositoryNodeId: string, // This is the internal _id of the Repository node (e.g., 'repoName:branch')
    component: ComponentInput, // Data for the component from service layer
  ): Promise<Component | null> {
    const logger = console; // Placeholder for actual logger if passed down
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 2) {
      logger.error(
        `[ComponentRepository] Invalid repositoryNodeId format: ${repositoryNodeId} in upsertComponent`,
      );
      throw new Error(`Invalid repositoryNodeId format: ${repositoryNodeId}`);
    }
    const logicalRepositoryName = repoIdParts[0];

    const componentId = String(component.id);
    const componentBranch = String(component.branch || 'main');
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, componentBranch, componentId);

    const now = new Date().toISOString();

    try {
      await this.kuzuClient.executeQuery('BEGIN TRANSACTION');

      // Simplified MERGE query - include id in MERGE for KuzuDB
      const upsertNodeQuery = `
        MERGE (c:Component {id: $componentId, graph_unique_id: $graphUniqueId})
        ON CREATE SET
          c.name = $name,
          c.kind = $kind,
          c.status = $status,
          c.branch = $branch,
          c.repository = $repository,
          c.created_at = $now,
          c.updated_at = $now
        ON MATCH SET
          c.name = $name,
          c.kind = $kind,
          c.status = $status,
          c.branch = $branch,
          c.repository = $repository,
          c.updated_at = $now
      `;
      await this.kuzuClient.executeQuery(upsertNodeQuery, {
        graphUniqueId,
        componentId,
        name: component.name,
        kind: component.kind || 'Unknown',
        status: component.status || 'active',
        branch: componentBranch,
        repository: repositoryNodeId,
        now,
      });

      // Attach to repository
      await this.kuzuClient.executeQuery(
        'MATCH (repo:Repository {id: $repoId}), (c:Component {graph_unique_id: $graphUniqueId}) MERGE (c)-[:PART_OF]->(repo)',
        { repoId: repositoryNodeId, graphUniqueId },
      );

      // Handle dependencies
      if (component.depends_on && component.depends_on.length > 0) {
        // First, delete existing dependencies for this component
        await this.kuzuClient.executeQuery(
          'MATCH (c:Component {graph_unique_id: $graphUniqueId})-[r:DEPENDS_ON]->() DELETE r',
          { graphUniqueId },
        );

        for (const depId of component.depends_on) {
          const depGraphUniqueId = formatGraphUniqueId(
            logicalRepositoryName,
            componentBranch,
            depId,
          );
          // Ensure dependency node exists (as a placeholder if needed)
          await this.kuzuClient.executeQuery(
            `MERGE (dep:Component {graph_unique_id: $depGraphUniqueId}) ON CREATE SET dep.id = $depId, dep.name = $depName, dep.status = 'planned', dep.branch = $branch`,
            {
              depGraphUniqueId,
              depId,
              depName: `Placeholder for ${depId}`,
              branch: componentBranch,
            },
          );

          // Create the new dependency relationship
          await this.kuzuClient.executeQuery(
            'MATCH (c:Component {graph_unique_id: $cId}), (d:Component {graph_unique_id: $dId}) MERGE (c)-[:DEPENDS_ON]->(d)',
            { cId: graphUniqueId, dId: depGraphUniqueId },
          );
        }
      }

      await this.kuzuClient.executeQuery('COMMIT');

      return this.findByIdAndBranch(logicalRepositoryName, componentId, componentBranch);
    } catch (error: any) {
      logger.error(
        `[ComponentRepository] ERROR in upsertComponent for ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      try {
        await this.kuzuClient.executeQuery('ROLLBACK');
      } catch (rollbackError: any) {
        logger.error(
          `[ComponentRepository] CRITICAL ERROR: Failed to ROLLBACK transaction for ${graphUniqueId}: ${rollbackError.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Find a component by its logical ID and branch, within a given repository context.
   * The repositoryId here refers to the name of the repository for ID formatting.
   * Also retrieves the component's dependencies.
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Component | null> {
    const logger = console; // Placeholder
    const graphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);

    try {
      logger.debug(`[ComponentRepository] Finding component by GID: ${graphUniqueId}`);

      // Step 1: Get the basic component info
      const query = `MATCH (c:Component {graph_unique_id: $graphUniqueId}) RETURN c LIMIT 1`;
      const result = await this.kuzuClient.executeQuery(query, { graphUniqueId });

      // Handle various result formats
      if (!result || result.length === 0) {
        logger.debug(`[ComponentRepository] Component not found for GID: ${graphUniqueId}`);
        return null;
      }

      // Check if we have a component in the result
      const componentNode = result[0]?.c;
      if (!componentNode) {
        logger.debug(
          `[ComponentRepository] Component result format invalid for GID: ${graphUniqueId}`,
        );
        return null;
      }

      // Get component data from the basic result
      const componentData = this.formatKuzuRowToComponent(
        componentNode,
        repositoryName,
        itemBranch,
      );

      // Step 2: Get the component's dependencies
      const depsQuery = `
        MATCH (c:Component {graph_unique_id: $graphUniqueId})-[:DEPENDS_ON]->(dep:Component)
        RETURN dep.id as depId
      `;

      const depsResult = await this.kuzuClient.executeQuery(depsQuery, { graphUniqueId });

      // Update the dependencies
      // First ensure depends_on is initialized as an array (Component interface has it as string[] | undefined)
      if (!componentData.depends_on) {
        componentData.depends_on = [];
      }

      if (depsResult && depsResult.length > 0) {
        // Assign the dependency IDs from the query result
        componentData.depends_on = depsResult.map((dep: any) => dep.depId);
        logger.debug(
          `[ComponentRepository] Found ${depsResult.length} dependencies for ${graphUniqueId}`,
        );
      } else {
        // If no dependencies found, ensure it's an empty array
        componentData.depends_on = [];
        logger.debug(`[ComponentRepository] No dependencies found for ${graphUniqueId}`);
      }

      return componentData;
    } catch (error: any) {
      logger.error(
        `[ComponentRepository] Error in findByIdAndBranch for GID ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      return null;
    }
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
    const result = await this.kuzuClient.executeQuery(query);

    // Check if result is a direct array (common KuzuDB return pattern)
    if (Array.isArray(result)) {
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
    }

    // Check if result has getAll method (alternative query result pattern)
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
    const result = await this.kuzuClient.executeQuery(query);

    // Check if result is a direct array (common KuzuDB return pattern)
    if (Array.isArray(result)) {
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
    }

    // Check if result has getAll method (alternative query result pattern)
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
      const result = await this.kuzuClient.executeQuery(query);
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

  // --- Graph Algorithm Methods ---
  async kCoreDecomposition(repositoryNodeId: string, k: number): Promise<any> {
    const globalProjectedGraphName = 'AllComponentsAndDependencies'; // Consistent name for this set of operations
    try {
      await this.kuzuClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(
        `Ensured graph projection '${globalProjectedGraphName}' exists or was created.`,
      );
    } catch (projectionError: any) {
      if (projectionError.message && projectionError.message.includes('already exists')) {
        console.warn(
          `Graph projection '${globalProjectedGraphName}' already exists. Proceeding with existing projection.`,
        );
      } else {
        console.error(
          `Could not ensure graph projection '${globalProjectedGraphName}'. An unexpected error occurred:`,
          projectionError,
        );
        throw projectionError; // Re-throw if it's not an "already exists" error
      }
    }

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const kValue = k;

    const query = `
      CALL k_core_decomposition('${globalProjectedGraphName}') YIELD node AS algo_component_node, k_degree
      WITH algo_component_node, k_degree
      WHERE k_degree >= ${kValue}
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, k_degree
    `;

    console.error(
      `Executing kCoreDecomposition for repo ${repositoryNodeId}, k=${kValue}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );

    try {
      const result = await this.kuzuClient.executeQuery(query);
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
      await this.kuzuClient.executeQuery(
        `CALL project_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON'])`,
      );
      console.error(`Ensured graph projection '${globalProjectedGraphName}' for Louvain.`);
    } catch (projectionError: any) {
      if (projectionError.message && projectionError.message.includes('already exists')) {
        console.warn(
          `Graph projection '${globalProjectedGraphName}' already exists. Proceeding with existing projection for Louvain.`,
        );
      } else {
        console.error(
          `Could not ensure graph projection '${globalProjectedGraphName}' for Louvain. An unexpected error occurred:`,
          projectionError,
        );
        throw projectionError;
      }
    }

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const louvainCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL louvain(${louvainCallParams}) YIELD node AS algo_component_node, louvain_id 
      WITH algo_component_node, louvain_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, louvain_id AS community_id 
      ORDER BY community_id, algo_component_node.name 
    `;

    console.error(
      `Executing louvainCommunityDetection for repo ${repositoryNodeId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );

    try {
      const result = await this.kuzuClient.executeQuery(query);
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
      // First check if the graph projection exists
      const checkQuery = `CALL show_graphs() RETURN name;`;
      const checkResult = await this.kuzuClient.executeQuery(checkQuery);
      const existingGraphs = checkResult.map((row: any) => row.name);

      if (!existingGraphs.includes(globalProjectedGraphName)) {
        // Create the graph projection if it doesn't exist
        await this.kuzuClient.executeQuery(
          `CALL create_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON']);`,
        );
        console.error(`Created graph projection '${globalProjectedGraphName}' for PageRank.`);
      } else {
        console.warn(
          `Graph projection '${globalProjectedGraphName}' already exists. Proceeding with existing projection for PageRank.`,
        );
      }
    } catch (projectionError: any) {
      console.error(
        `Could not ensure graph projection '${globalProjectedGraphName}' for PageRank. An unexpected error occurred:`,
        projectionError,
      );
      throw projectionError;
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
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, rank
      ORDER BY rank DESC
    `;

    console.error(
      `Executing pageRank for repo ${repositoryNodeId}. Call: CALL page_rank(${callParams})`,
      'Query:',
      query,
    );

    try {
      const result = await this.kuzuClient.executeQuery(query);
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
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      // First check if the graph projection exists
      const checkQuery = `CALL show_graphs() RETURN name;`;
      const checkResult = await this.kuzuClient.executeQuery(checkQuery);
      const existingGraphs = checkResult.map((row: any) => row.name);

      if (!existingGraphs.includes(globalProjectedGraphName)) {
        // Create the graph projection if it doesn't exist
        await this.kuzuClient.executeQuery(
          `CALL create_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON']);`,
        );
        console.error(`Created graph projection '${globalProjectedGraphName}' for SCC.`);
      } else {
        console.warn(
          `Graph projection '${globalProjectedGraphName}' already exists. Proceeding with existing projection for SCC.`,
        );
      }
    } catch (projectionError: any) {
      console.error(
        `Could not ensure graph projection '${globalProjectedGraphName}' for SCC. An unexpected error occurred:`,
        projectionError,
      );
      throw projectionError;
    }

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const sccCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL strongly_connected_components(${sccCallParams}) YIELD node AS algo_component_node, component_id AS group_id 
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    console.error(
      `Executing getStronglyConnectedComponents for repo ${repositoryNodeId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );
    try {
      const result = await this.kuzuClient.executeQuery(query);
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
    const globalProjectedGraphName = 'AllComponentsAndDependencies';
    try {
      // First check if the graph projection exists
      const checkQuery = `CALL show_graphs() RETURN name;`;
      const checkResult = await this.kuzuClient.executeQuery(checkQuery);
      const existingGraphs = checkResult.map((row: any) => row.name);

      if (!existingGraphs.includes(globalProjectedGraphName)) {
        // Create the graph projection if it doesn't exist
        await this.kuzuClient.executeQuery(
          `CALL create_graph('${globalProjectedGraphName}', ['Component'], ['DEPENDS_ON']);`,
        );
        console.error(`Created graph projection '${globalProjectedGraphName}' for WCC.`);
      } else {
        console.warn(
          `Graph projection '${globalProjectedGraphName}' already exists. Proceeding with existing projection for WCC.`,
        );
      }
    } catch (projectionError: any) {
      console.error(
        `Could not ensure graph projection '${globalProjectedGraphName}' for WCC. An unexpected error occurred:`,
        projectionError,
      );
      throw projectionError;
    }

    const escapedRepositoryNodeId = this.escapeStr(repositoryNodeId);
    const wccCallParams = `'${globalProjectedGraphName}'`;

    const query = `
      CALL weakly_connected_components(${wccCallParams}) YIELD node AS algo_component_node, component_id AS group_id
      WITH algo_component_node, group_id
      MATCH (repo:Repository {id: '${escapedRepositoryNodeId}'})<-[:PART_OF]-(algo_component_node)
      RETURN algo_component_node AS component, group_id
      ORDER BY group_id, algo_component_node.name
    `;

    console.error(
      `Executing getWeaklyConnectedComponents for repo ${repositoryNodeId}. Graph: ${globalProjectedGraphName}`,
      'Query:',
      query,
    );
    try {
      const result = await this.kuzuClient.executeQuery(query);
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
      const result = await this.kuzuClient.executeQuery(query);
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
      const result = await this.kuzuClient.executeQuery(query);
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
            c.id = '${escapedLogicalId}',        
            c.branch = '${escapedComponentBranch}',
            c.updated_at = timestamp('${kuzuTimestamp}')
        MERGE (c)-[:PART_OF]->(repo)
        RETURN c`;

    try {
      await this.kuzuClient.executeQuery(upsertNodeQuery);
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
    await this.kuzuClient.executeQuery(deleteDepsQuery);

    if (component.depends_on && component.depends_on.length > 0) {
      for (const depId of component.depends_on) {
        const depGraphUniqueId = formatGraphUniqueId(logicalRepositoryName, componentBranch, depId);
        const escapedDepGraphUniqueId = this.escapeStr(depGraphUniqueId);

        const ensureDepNodeQuery = `
            MATCH (repoDep:Repository {id: $repositoryNodeId})
            MERGE (dep:Component {graph_unique_id: $depGraphUniqueId})
            ON CREATE SET dep.id = $depId, dep.branch = $depBranch, dep.name = $depName, dep.kind = $depKind, dep.status = $depStatus, dep.repository = $repositoryNodeId, dep.created_at = $depCreatedAt, dep.updated_at = $depUpdatedAt
            MERGE (dep)-[:PART_OF]->(repoDep)`;

        await this.kuzuClient.executeQuery(ensureDepNodeQuery, {
          repositoryNodeId,
          depGraphUniqueId,
          depId,
          depBranch: componentBranch,
          depName: `Placeholder for ${depId}`,
          depKind: 'Unknown',
          depStatus: 'planned',
          depCreatedAt: nowIso,
          depUpdatedAt: nowIso,
        });
        console.error(
          `DEBUG: upsertCompWithRel - Ensured/Created dependency node: ${escapedDepGraphUniqueId}`,
        );

        const checkCQuery = `MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN c.id AS componentId`;
        const checkDQuery = `MATCH (d:Component {graph_unique_id: '${escapedDepGraphUniqueId}'}) RETURN d.id AS depId`;
        const cResult = await this.kuzuClient.executeQuery(checkCQuery);
        const dResult = await this.kuzuClient.executeQuery(checkDQuery);
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
        const relCreateResult = await this.kuzuClient.executeQuery(addDepRelQuery);
        const relCreateRows = await relCreateResult.getAll();
        console.error(
          `DEBUG: upsertCompWithRel - Executed CREATE for DEPENDS_ON, rows returned: ${relCreateRows.length}, content: ${JSON.stringify(relCreateRows)}`,
        );
      }
    }
    return this.findByIdAndBranch(logicalRepositoryName, componentId, componentBranch);
  }
}
