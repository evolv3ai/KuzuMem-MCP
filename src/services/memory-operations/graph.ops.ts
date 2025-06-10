import {
  RepositoryRepository,
  // Presumed: ComponentRepository or a dedicated GraphRepository might be needed
  // For now, let's include ComponentRepository if graph ops are on components.
  ComponentRepository,
} from '../../repositories';
import { Component, Context, Decision, Rule } from '../../types'; // Added Context and Decision imports
import { KuzuDBClient } from '../../db/kuzu'; // Import KuzuDBClient
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom'; // Added

// TypeScript interfaces for graph operations

// Common types
interface GraphOperationParams {
  clientProjectRoot: string;
  repository: string;
  branch: string;
}

// Contextual History
interface GetItemContextualHistoryParams extends GraphOperationParams {
  itemId: string;
  itemType: 'Component' | 'Decision' | 'Rule';
}

interface ContextResult {
  id: string;
  name: string | null;
  summary: string | null;
  iso_date: string;
  created_at: string | null;
  updated_at: string | null;
  agent: string | null;
  issue: string | null;
  decision_ids: string[];
  observation_ids: string[];
  repository: string;
  branch: string;
}

// Governing Items
interface GetGoverningItemsParams extends GraphOperationParams {
  componentId: string;
}

interface GoverningItemsResult {
  status: 'complete' | 'error';
  decisions: Decision[];
  rules: Rule[];
  message: string;
}

// Related Items
interface GetRelatedItemsParams extends GraphOperationParams {
  startItemId: string;
  depth?: number;
  relationshipFilter?: string;
  targetNodeTypeFilter?: string;
}

interface RelatedItem {
  id: string;
  name: string;
  type: string;
  distance: number;
  repository: string;
  branch: string;
}

interface RelatedItemsResult {
  status: 'complete' | 'error';
  relatedItems: RelatedItem[];
  message: string;
}

// Algorithm common types
interface ProjectedGraphParams extends GraphOperationParams {
  projectedGraphName: string;
  nodeTableNames: string[];
  relationshipTableNames: string[];
}

// PageRank
interface PageRankParams extends ProjectedGraphParams {
  dampingFactor?: number;
  maxIterations?: number;
}

interface PageRankResult {
  ranks: Array<{
    nodeId: string;
    score: number;
  }>;
}

// K-Core Decomposition
interface KCoreParams extends ProjectedGraphParams {
  k: number;
}

interface KCoreResult {
  k: number;
  components: Array<{
    nodeId: string;
    coreness: number;
  }>;
}

// Community Detection
interface LouvainParams extends ProjectedGraphParams {}

interface LouvainResult {
  communities: Array<{
    nodeId: string;
    communityId: number;
  }>;
}

// Connected Components
interface ConnectedComponentsParams extends ProjectedGraphParams {}

interface ConnectedComponentsResult {
  components: Array<{
    nodeId: string;
    componentId: number;
  }>;
}

// Shortest Path
interface ShortestPathParams extends ProjectedGraphParams {
  startNodeId: string;
  endNodeId: string;
}

interface ShortestPathResult {
  exists: boolean;
  path?: string[];
  distance?: number;
}

// This file is a placeholder for graph-related operations.
// Implementations will depend on the capabilities of the underlying repositories
// (e.g., ComponentRepository or a dedicated GraphRepository for Kùzu graph queries)
// and the specific requirements of the graph-based tools.

// Shared helper for timestamp parsing (can be moved to a common util if not already)
function parseTimestamp(value: any): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    // Kuzu often returns microseconds
    return new Date(value / 1000).toISOString();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return null;
}

/**
 * Retrieves the contextual history for a given item.
 */
export async function getItemContextualHistoryOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: GetItemContextualHistoryParams,
  repositoryRepo?: RepositoryRepository,
): Promise<ContextResult[]> {
  const logger = mcpContext.logger;
  const { repository, branch, itemId, itemType } = params;
  const repoId = `${repository}:${branch}`;
  logger.info(`[graph.ops] Getting contextual history for ${itemType} ${itemId} in ${repoId}`);

  if (repositoryRepo) {
    const repoNode = await repositoryRepo.findByName(repository, branch);
    if (!repoNode) {
      logger.warn(`[graph.ops] Repository ${repoId} not found for getItemContextualHistoryOp.`);
      return [];
    }
  }

  let relMatchClause: string;
  const itemNodeLabel = itemType;

  switch (itemType) {
    case 'Component':
      relMatchClause = `(ctx:Context)-[:CONTEXT_OF]->(item:\`${itemNodeLabel}\` {id: $itemId})`;
      break;
    case 'Decision':
      relMatchClause = `(ctx:Context)-[:CONTEXT_OF_DECISION]->(item:\`${itemNodeLabel}\` {id: $itemId})`;
      break;
    case 'Rule':
      relMatchClause = `(ctx:Context)-[:CONTEXT_OF_RULE]->(item:\`${itemNodeLabel}\` {id: $itemId})`;
      break;
    default:
      const exhaustiveCheck: never = itemType;
      logger.error(
        `[graph.ops] Invalid itemType provided to getItemContextualHistoryOp: ${exhaustiveCheck}`,
      );
      throw new Error(`Invalid itemType: ${exhaustiveCheck}`);
  }

  const query = `
    MATCH ${relMatchClause}
    WHERE item.graph_unique_id STARTS WITH $repoId AND item.branch = $branch 
      AND ctx.graph_unique_id STARTS WITH $repoId AND ctx.branch = $branch
    RETURN ctx
    ORDER BY ctx.created_at DESC
  `;

  const queryParams = { itemId, repoId, branch };
  logger.debug(`[graph.ops] GetItemContextualHistory Cypher: ${query.trim()}`, queryParams);

  try {
    const kuzuResults = await kuzuClient.executeQuery(query, queryParams);

    return kuzuResults.map((row: any) => {
      const ctxData = row.ctx.properties || row.ctx;

      const createdAt = parseTimestamp(ctxData.created_at);
      const updatedAt = parseTimestamp(ctxData.updated_at);

      // Ensure decision_ids and observation_ids are string arrays
      let decisionIds: string[] = [];
      if (ctxData.decision_ids) {
        decisionIds = Array.isArray(ctxData.decision_ids)
          ? ctxData.decision_ids.map(String)
          : [String(ctxData.decision_ids)];
      } else if (ctxData.decisions) {
        // Fallback for older data structure if needed
        decisionIds = Array.isArray(ctxData.decisions)
          ? ctxData.decisions.map(String)
          : [String(ctxData.decisions)];
      }

      let observationIds: string[] = [];
      if (ctxData.observation_ids) {
        observationIds = Array.isArray(ctxData.observation_ids)
          ? ctxData.observation_ids.map(String)
          : [String(ctxData.observation_ids)];
      } else if (ctxData.observations) {
        // Fallback
        observationIds = Array.isArray(ctxData.observations)
          ? ctxData.observations.map(String)
          : [String(ctxData.observations)];
      }

      return {
        id: ctxData.id?.toString() || `generated-ctx-${Math.random()}`, // Ensure ID
        name: ctxData.name || null,
        summary: ctxData.summary || null,
        iso_date: ctxData.iso_date,
        created_at: createdAt,
        updated_at: updatedAt,
        agent: ctxData.agent || null,
        issue: ctxData.related_issue || ctxData.issue || null,
        decision_ids: decisionIds,
        observation_ids: observationIds,
        repository: repoId,
        branch: branch,
      } as ContextResult;
    });
  } catch (error: any) {
    logger.error(
      `[graph.ops] Error fetching contextual history for ${itemType} ${itemId} in ${repoId}:`,
      { error: error.toString(), stack: error.stack },
    );
    throw new Error(
      `Failed to fetch contextual history for ${itemType} ${itemId}: ${error.message}`,
    );
  }
}

/**
 * Retrieves governing items (decisions, rules) for a component.
 */
export async function getGoverningItemsForComponentOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: GetGoverningItemsParams,
): Promise<GoverningItemsResult> {
  const logger = mcpContext.logger;
  const { repository, branch, componentId } = params;
  const repoId = `${repository}:${branch}`;
  const componentGraphId = `${repoId}:${componentId}`;

  logger.info(`[graph.ops] Getting governing items for component ${componentId} in ${repoId}`, {
    params,
  });

  try {
    // Query for decisions that govern this component
    const decisionsQuery = `
      MATCH (c:Component {graph_unique_id: $componentGraphId})
      OPTIONAL MATCH (c)-[:GOVERNED_BY]->(d:Decision) 
      WHERE d.graph_unique_id STARTS WITH $repoId AND d.branch = $branch 
      RETURN d
    `;

    // Query for rules that govern this component
    const rulesQuery = `
      MATCH (c:Component {graph_unique_id: $componentGraphId})
      OPTIONAL MATCH (c)-[:GOVERNED_BY_RULE]->(r:Rule) 
      WHERE r.graph_unique_id STARTS WITH $repoId AND r.branch = $branch 
      RETURN r
    `;

    const queryParams = { componentGraphId, repoId, branch };

    logger.debug(`[graph.ops] Decisions query: ${decisionsQuery.trim()}`, queryParams);
    logger.debug(`[graph.ops] Rules query: ${rulesQuery.trim()}`, queryParams);

    const [decisionResults, ruleResults] = await Promise.all([
      kuzuClient.executeQuery(decisionsQuery, queryParams),
      kuzuClient.executeQuery(rulesQuery, queryParams),
    ]);

    // Transform decision results
    const decisions = decisionResults
      .filter((row: any) => row.d)
      .map((row: any) => {
        const decisionData = row.d.properties || row.d;
        const createdAtStr = parseTimestamp(decisionData.created_at);
        const updatedAtStr = parseTimestamp(decisionData.updated_at);
        
        return {
          id: decisionData.id?.toString() || `generated-dec-${Math.random()}`,
          name: decisionData.name || '',
          date: decisionData.date || '1970-01-01',
          context: decisionData.context || null,
          status: decisionData.status,
          repository: repository,
          branch: branch,
          created_at: createdAtStr ? new Date(createdAtStr) : undefined,
          updated_at: updatedAtStr ? new Date(updatedAtStr) : undefined,
        } as Decision;
      });

    // Transform rule results
    const rules = ruleResults
      .filter((row: any) => row.r)
      .map((row: any) => {
        const ruleData = row.r.properties || row.r;
        const createdAtStr = parseTimestamp(ruleData.created_at);
        const updatedAtStr = parseTimestamp(ruleData.updated_at);
        
        let triggers: string[] = [];
        if (ruleData.triggers) {
          triggers = Array.isArray(ruleData.triggers)
            ? ruleData.triggers.map(String)
            : [String(ruleData.triggers)];
        }

        return {
          id: ruleData.id?.toString() || `generated-rule-${Math.random()}`,
          name: ruleData.name || '',
          created: ruleData.created || '1970-01-01',
          content: ruleData.content || null,
          status: ruleData.status,
          triggers: triggers.length > 0 ? triggers : null,
          repository: repository,
          branch: branch,
          created_at: createdAtStr ? new Date(createdAtStr) : undefined,
          updated_at: updatedAtStr ? new Date(updatedAtStr) : undefined,
        } as Rule;
      });

    logger.info(
      `[graph.ops] Found ${decisions.length} decisions and ${rules.length} rules governing component ${componentId}`,
    );

    return {
      status: 'complete',
      decisions,
      rules,
      message: `Successfully retrieved ${decisions.length} decisions and ${rules.length} rules governing component ${componentId}`,
    };
  } catch (error: any) {
    logger.error(
      `[graph.ops] Error fetching governing items for component ${componentId} in ${repoId}:`,
      { error: error.toString(), stack: error.stack },
    );

    return {
      status: 'error',
      decisions: [],
      rules: [],
      message: `Failed to fetch governing items: ${error.message}`,
    };
  }
}

/**
 * Retrieves related items within a certain number of hops in the graph.
 */
export async function getRelatedItemsOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: GetRelatedItemsParams,
): Promise<RelatedItemsResult> {
  const logger = mcpContext.logger;
  const { repository, branch, startItemId, depth, relationshipFilter, targetNodeTypeFilter } =
    params;
  const repoId = `${repository}:${branch}`;

  logger.info(`[graph.ops] Getting related items for ${startItemId} in ${repoId}`, { params });

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
    logger.debug(`[graph.ops] Related items query: ${query.trim()}`, queryParams);

    const results = await kuzuClient.executeQuery(query, queryParams);

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
      `[graph.ops] Found ${relatedItems.length} related items for ${startItemId} within ${maxDepth} hops`,
    );

    return {
      status: 'complete',
      relatedItems,
      message: `Successfully retrieved ${relatedItems.length} related items within ${maxDepth} hops`,
    };
  } catch (error: any) {
    logger.error(`[graph.ops] Error fetching related items for ${startItemId} in ${repoId}:`, {
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
 * Executes K-Core Decomposition algorithm.
 */
export async function kCoreDecompositionOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: KCoreParams,
): Promise<KCoreResult> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing K-Core Decomposition on G: ${params.projectedGraphName}, k: ${params.k}, R: ${params.repository}, B: ${params.branch}`,
  );

  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL k_core_decomposition('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, k_degree;`;
      logger.debug(`[graph.ops] K-Core Cypher: ${query}`);
      const kuzuResults = await kuzuClient.executeQuery(query, {});

      const components = kuzuResults.map((row: any) => ({
        nodeId: row.nodeId?.toString(),
        coreness: Number(row.k_degree),
      }));
      return { k: params.k, components };
    },
  );
}

// Helper function for projected graph operations
async function withProjectedGraph(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  projectionName: string,
  nodeTables: string[],
  relTables: string[],
  callback: () => Promise<any>,
): Promise<any> {
  const logger = mcpContext.logger;
  const nodeTableNamesArray = `[${nodeTables.map((n) => `'${n}'`).join(', ')}]`;
  const relTableNamesArray = `[${relTables.map((r) => `'${r}'`).join(', ')}]`;
  const safeProjectionName = projectionName.replace(/[^a-zA-Z0-9_]/g, '_');

  // Use correct KuzuDB syntax for projected graphs
  const createProjectionQuery = `CALL project_graph('${safeProjectionName}', ${nodeTableNamesArray}, ${relTableNamesArray});`;
  const dropProjectionQuery = `CALL drop_projected_graph('${safeProjectionName}');`;

  try {
    logger.debug(
      `[graph.ops] Creating projected graph: ${safeProjectionName} with query: ${createProjectionQuery}`,
    );
    await kuzuClient.executeQuery(createProjectionQuery, {});
    return await callback();
  } finally {
    try {
      logger.debug(`[graph.ops] Dropping projected graph: ${safeProjectionName}`);
      await kuzuClient.executeQuery(dropProjectionQuery, {});
    } catch (dropError: any) {
      logger.error(`[graph.ops] Error dropping projected graph ${safeProjectionName}:`, {
        error: dropError.toString(),
        stack: dropError.stack,
      });
    }
  }
}

/**
 * Executes PageRank algorithm.
 */
export async function pageRankOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: PageRankParams,
): Promise<PageRankResult> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing PageRank on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
  );
  const safeProjectionName = params.projectedGraphName.replace(/[^a-zA-Z0-9_]/g, '_');

  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
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

      logger.debug(`[graph.ops] PageRank Cypher: ${prQuery}`);
      const kuzuResults = await kuzuClient.executeQuery(prQuery, {});

      const ranks = kuzuResults.map((row: any) => ({
        nodeId: row.nodeId?.toString(),
        score: typeof row.rank === 'number' ? row.rank : parseFloat(row.rank || '0'),
      }));
      return { ranks };
    },
  );
}

/**
 * Executes Louvain Community Detection algorithm.
 */
export async function louvainCommunityDetectionOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: LouvainParams,
): Promise<LouvainResult> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing Louvain Community Detection on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
  );

  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL louvain('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, community_id;`;
      logger.debug(`[graph.ops] Louvain Cypher: ${query}`);
      const kuzuResults = await kuzuClient.executeQuery(query, {});

      const communities = kuzuResults.map((row: any) => ({
        nodeId: row.nodeId?.toString(),
        communityId: Number(row.community_id),
      }));
      return { communities };
    },
  );
}

/**
 * Executes Strongly Connected Components algorithm.
 */
export async function stronglyConnectedComponentsOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: ConnectedComponentsParams,
): Promise<ConnectedComponentsResult> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing Strongly Connected Components on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
  );

  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL strongly_connected_components('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, component_id;`;
      logger.debug(`[graph.ops] Strongly Connected Components Cypher: ${query}`);
      const kuzuResults = await kuzuClient.executeQuery(query, {});

      const components = kuzuResults.map((row: any) => ({
        nodeId: row.nodeId?.toString(),
        componentId: Number(row.component_id),
      }));
      return { components };
    },
  );
}

/**
 * Executes Weakly Connected Components algorithm.
 */
export async function weaklyConnectedComponentsOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: ConnectedComponentsParams,
): Promise<ConnectedComponentsResult> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing Weakly Connected Components on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
  );

  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL weakly_connected_components('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, component_id;`;
      logger.debug(`[graph.ops] Weakly Connected Components Cypher: ${query}`);
      const kuzuResults = await kuzuClient.executeQuery(query, {});

      const components = kuzuResults.map((row: any) => ({
        nodeId: row.nodeId?.toString(),
        componentId: Number(row.component_id),
      }));
      return { components };
    },
  );
}

/**
 * Executes Shortest Path algorithm.
 */
export async function shortestPathOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: ShortestPathParams,
): Promise<ShortestPathResult> {
  const logger = mcpContext.logger;
  const { repository, branch, startNodeId, endNodeId } = params;
  const repoId = `${repository}:${branch}`;

  logger.info(
    `[graph.ops] Finding shortest path from ${startNodeId} to ${endNodeId} in ${repoId}`,
    { params },
  );

  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL shortest_path('${params.projectedGraphName.replace(/'/g, "''")}', '${startNodeId.replace(/'/g, "''")}', '${endNodeId.replace(/'/g, "''")}') RETURN path, path_length;`;
      logger.debug(`[graph.ops] Shortest Path Cypher: ${query}`);

      try {
        const kuzuResults = await kuzuClient.executeQuery(query, {});

        if (kuzuResults && kuzuResults.length > 0) {
          const pathData = kuzuResults[0];
          const path = pathData.path || [];
          const distance = pathData.path_length || 0;

          return {
            exists: true,
            path: Array.isArray(path) ? path.map(String) : [String(path)],
            distance: Number(distance),
          };
        }

        return { exists: false };
      } catch (error: any) {
        logger.warn(`[graph.ops] No path found from ${startNodeId} to ${endNodeId}`);
        return { exists: false };
      }
    },
  );
}
