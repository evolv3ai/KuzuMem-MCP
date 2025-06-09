import { z } from 'zod'; // Import z for using z.infer with schema types
import { KuzuDBClient } from '../../db/kuzu'; // Import KuzuDBClient
import {
  ContextSchema, // For getGoverningItemsForComponentOp, getRelatedItemsOp that might return components
  DecisionSchema, // For getGoverningItemsForComponentOp
  GetGoverningItemsForComponentInputSchema, // Corrected: Was GetGoverningItemsForComponentOutputSchema
  GetGoverningItemsForComponentOutputSchema,
  // Traversal Output Schemas might also be relevant if their structure is complex
  // GetComponentDependenciesOutputSchema, // etc.
  GetItemContextualHistoryInputSchema,
  GetRelatedItemsInputSchema, // Corrected: Was GetRelatedItemsOutputSchema
  GetRelatedItemsOutputSchema,
  // ... import other Algo Zod Input/Output Schemas as they are refactored
  KCoreDecompositionInputSchema,
  KCoreDecompositionOutputSchema, // Example for next one
  LouvainCommunityDetectionInputSchema,
  LouvainCommunityDetectionOutputSchema,
  PageRankInputSchema,
  PageRankOutputSchema,
  RelatedItemBaseSchema, // For getGoverningItemsForComponentOp
  RuleSchema,
  ShortestPathInputSchema,
  ShortestPathOutputSchema,
  StronglyConnectedComponentsInputSchema,
  StronglyConnectedComponentsOutputSchema,
  WeaklyConnectedComponentsInputSchema,
  WeaklyConnectedComponentsOutputSchema,
} from '../../mcp/schemas/tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom'; // Added
import { RepositoryRepository } from '../../repositories';
import { formatGraphUniqueId } from '../../utils/id.utils'; // Ensure consistent graph_unique_id formatting

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
  params: z.infer<typeof GetItemContextualHistoryInputSchema>,
  repositoryRepo?: RepositoryRepository, // Optional, for validation if needed
): Promise<z.infer<typeof ContextSchema>[]> {
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
      // This case should be caught by Zod validation on itemType in the handler
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
      } as z.infer<typeof ContextSchema>;
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
  params: z.infer<typeof GetGoverningItemsForComponentInputSchema>,
): Promise<z.infer<typeof GetGoverningItemsForComponentOutputSchema>> {
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
      .filter((row: any) => row.d) // Filter out null results from OPTIONAL MATCH
      .map((row: any) => {
        const decisionData = row.d.properties || row.d;
        const createdAt = parseTimestamp(decisionData.created_at);
        const updatedAt = parseTimestamp(decisionData.updated_at);

        return {
          id: decisionData.id?.toString() || `generated-dec-${Math.random()}`,
          name: decisionData.name || '',
          date: decisionData.date || '1970-01-01', // Fallback date
          status: decisionData.status || 'pending',
          context: decisionData.context || null,
          created_at: createdAt,
          updated_at: updatedAt,
          repository: repoId,
          branch: branch,
        } as z.infer<typeof DecisionSchema>;
      });

    // Transform rule results
    const rules = ruleResults
      .filter((row: any) => row.r) // Filter out null results from OPTIONAL MATCH
      .map((row: any) => {
        const ruleData = row.r.properties || row.r;
        const createdAt = parseTimestamp(ruleData.created_at);
        const updatedAt = parseTimestamp(ruleData.updated_at);

        // Handle triggers array
        let triggers: string[] = [];
        if (ruleData.triggers) {
          triggers = Array.isArray(ruleData.triggers)
            ? ruleData.triggers.map(String)
            : [String(ruleData.triggers)];
        }

        return {
          id: ruleData.id?.toString() || `generated-rule-${Math.random()}`,
          name: ruleData.name || '',
          created: ruleData.created || '1970-01-01', // Fallback date
          content: ruleData.content || '',
          status: ruleData.status || 'active',
          triggers: triggers,
          created_at: createdAt,
          updated_at: updatedAt,
          repository: repoId,
          branch: branch,
        } as z.infer<typeof RuleSchema>;
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
  params: z.infer<typeof GetRelatedItemsInputSchema>,
): Promise<z.infer<typeof GetRelatedItemsOutputSchema>> {
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
      } as z.infer<typeof RelatedItemBaseSchema>;
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
  params: z.infer<typeof KCoreDecompositionInputSchema>,
): Promise<z.infer<typeof KCoreDecompositionOutputSchema>['results']> {
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

// ... (withProjectedGraph helper remains the same, ensure logger and error handling are correct) ...
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
  params: z.infer<typeof PageRankInputSchema>,
): Promise<z.infer<typeof PageRankOutputSchema>['results']> {
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
  params: z.infer<typeof LouvainCommunityDetectionInputSchema>,
): Promise<z.infer<typeof LouvainCommunityDetectionOutputSchema>['results']> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing Louvain on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
  ); // Added info log
  // logger.warn('[graph.ops] louvainCommunityDetectionOp not fully implemented with new signature.', { params }); // Kept warn if further work needed
  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL louvain('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, louvain_id AS communityId;`;
      logger.debug(`[graph.ops] Louvain Cypher: ${query}`); // Added debug log
      const kuzuResults = await kuzuClient.executeQuery(query, {}); // Corrected: executeQuery
      const communities = kuzuResults.map((r: any) => ({
        nodeId: r.nodeId?.toString(),
        communityId: Number(r.communityId),
      }));
      // Note: KuzuDB's Louvain algorithm does not return modularity score by default.
      // Modularity calculation would require a separate computation over the communities.
      return { communities, modularity: undefined };
    },
  );
}

/**
 * Executes Strongly Connected Components algorithm.
 */
export async function stronglyConnectedComponentsOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: z.infer<typeof StronglyConnectedComponentsInputSchema>,
): Promise<z.infer<typeof StronglyConnectedComponentsOutputSchema>['results']> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing SCC on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
  ); // Added info log
  // logger.warn('[graph.ops] stronglyConnectedComponentsOp not fully implemented with new signature.', { params });
  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL strongly_connected_components('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, group_id;`;
      logger.debug(`[graph.ops] SCC Cypher: ${query}`); // Added debug log
      const kuzuResults = await kuzuClient.executeQuery(query, {}); // Corrected: executeQuery

      // Group the results by group_id since we're not using GROUP BY in the query anymore
      const componentMap = new Map<number, string[]>();
      kuzuResults.forEach((r: any) => {
        const componentId = Number(r.group_id);
        const nodeId = String(r.nodeId);
        if (!componentMap.has(componentId)) {
          componentMap.set(componentId, []);
        }
        componentMap.get(componentId)!.push(nodeId);
      });

      const components = Array.from(componentMap.entries()).map(([component_id, nodes]) => ({
        component_id,
        nodes,
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
  params: z.infer<typeof WeaklyConnectedComponentsInputSchema>,
): Promise<z.infer<typeof WeaklyConnectedComponentsOutputSchema>['results']> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing WCC on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}`,
  ); // Added info log
  // logger.warn('[graph.ops] weaklyConnectedComponentsOp not fully implemented with new signature.', { params });
  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const query = `CALL weakly_connected_components('${params.projectedGraphName.replace(/'/g, "''")}') RETURN node.id AS nodeId, group_id;`;
      logger.debug(`[graph.ops] WCC Cypher: ${query}`); // Added debug log
      const kuzuResults = await kuzuClient.executeQuery(query, {}); // Corrected: executeQuery

      // Group the results by group_id since we're not using GROUP BY in the query anymore
      const componentMap = new Map<number, string[]>();
      kuzuResults.forEach((r: any) => {
        const componentId = Number(r.group_id);
        const nodeId = String(r.nodeId);
        if (!componentMap.has(componentId)) {
          componentMap.set(componentId, []);
        }
        componentMap.get(componentId)!.push(nodeId);
      });

      const components = Array.from(componentMap.entries()).map(([component_id, nodes]) => ({
        component_id,
        nodes,
      }));
      return { components };
    },
  );
}

/**
 * Finds the shortest path between two nodes.
 */
export async function shortestPathOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  params: z.infer<typeof ShortestPathInputSchema>,
): Promise<z.infer<typeof ShortestPathOutputSchema>['results']> {
  const logger = mcpContext.logger;
  logger.info(
    `[graph.ops] Executing Shortest Path on G: ${params.projectedGraphName}, R: ${params.repository}, B: ${params.branch}, From: ${params.startNodeId}, To: ${params.endNodeId}`,
  ); // Added info log
  // logger.warn('[graph.ops] shortestPathOp not fully implemented with new signature.', { params });
  return await withProjectedGraph(
    mcpContext,
    kuzuClient,
    params.projectedGraphName,
    params.nodeTableNames,
    params.relationshipTableNames,
    async () => {
      const { repository, branch, startNodeId, endNodeId } = params;
      // Construct graph_unique_id values using the shared utility for consistency.
      const startGraphId = formatGraphUniqueId(repository, branch, startNodeId);
      const endGraphId = formatGraphUniqueId(repository, branch, endNodeId);

      // Validate and sanitize the maximum traversal depth. Fallback to 10 if the provided value is invalid.
      const maxDepth =
        params.maxDepth && Number.isInteger(params.maxDepth) && params.maxDepth > 0
          ? params.maxDepth
          : 10;

      // Use a parameterised query to avoid potential Cypher injection issues.
      const query = `
        MATCH (start {graph_unique_id: $startGraphId}), (end {graph_unique_id: $endGraphId})
        MATCH p = (start)-[* SHORTEST 1..$maxDepth]-(end)
        RETURN p LIMIT 1
      `;
      const res = await kuzuClient.executeQuery(query, { startGraphId, endGraphId, maxDepth });

      if (!res || res.length === 0) {
        return { pathFound: false, path: [], length: 0 };
      }

      const pathObj = res[0].p;
      const nodesArr = (pathObj._nodes || []).map((n: any) => {
        const props = n._properties || n;
        return { id: props.id?.toString() || '', _label: (n._labels || [])[0] || 'Unknown' };
      });

      return {
        pathFound: true,
        path: nodesArr,
        length: nodesArr.length,
      };
    },
  );
}
