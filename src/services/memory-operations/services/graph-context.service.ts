import { BaseGraphOperations, GetItemContextualHistoryParams, ContextResult } from '../base/base-graph-operations';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

/**
 * Service responsible for context and history operations
 * Handles retrieval of contextual history for components, decisions, and rules
 */
export class GraphContextService extends BaseGraphOperations {
  /**
   * Retrieves the contextual history for a given item
   */
  async getItemContextualHistory(
    mcpContext: EnrichedRequestHandlerExtra,
    params: GetItemContextualHistoryParams,
  ): Promise<ContextResult[]> {
    const logger = this.createOperationLogger(mcpContext, 'getItemContextualHistory', params);
    const { repository, branch, itemId, itemType } = params;
    const repoId = this.createRepoId(repository, branch);

    logger.info(`Getting contextual history for ${itemType} ${itemId} in ${repoId}`);

    // Validate repository if repository repo is available
    const isValidRepo = await this.validateRepository(mcpContext, repository, branch);
    if (!isValidRepo) {
      return [];
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
        logger.error(`Invalid itemType provided to getItemContextualHistory: ${exhaustiveCheck}`);
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
    logger.debug(`GetItemContextualHistory Cypher: ${query.trim()}`, queryParams);

    try {
      const kuzuResults = await this.kuzuClient.executeQuery(query, queryParams);

      return kuzuResults.map((row: any) => {
        const ctxData = row.ctx.properties || row.ctx;

        const createdAt = this.parseTimestamp(ctxData.created_at);
        const updatedAt = this.parseTimestamp(ctxData.updated_at);

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
        `Error fetching contextual history for ${itemType} ${itemId} in ${repoId}:`,
        { error: error.toString(), stack: error.stack },
      );
      throw new Error(
        `Failed to fetch contextual history for ${itemType} ${itemId}: ${error.message}`,
      );
    }
  }

  /**
   * Get context summary for a repository
   */
  async getContextSummary(
    mcpContext: EnrichedRequestHandlerExtra,
    repository: string,
    branch: string,
  ): Promise<{
    totalContexts: number;
    recentContexts: ContextResult[];
    contextsByAgent: Record<string, number>;
  }> {
    const logger = this.createOperationLogger(mcpContext, 'getContextSummary', {
      repository,
      branch,
    });
    const repoId = this.createRepoId(repository, branch);

    logger.info(`Getting context summary for ${repoId}`);

    try {
      // Get total context count
      const countQuery = `
        MATCH (ctx:Context)
        WHERE ctx.graph_unique_id STARTS WITH $repoId AND ctx.branch = $branch
        RETURN count(ctx) AS totalCount
      `;

      // Get recent contexts (last 10)
      const recentQuery = `
        MATCH (ctx:Context)
        WHERE ctx.graph_unique_id STARTS WITH $repoId AND ctx.branch = $branch
        RETURN ctx
        ORDER BY ctx.created_at DESC
        LIMIT 10
      `;

      // Get contexts by agent
      const agentQuery = `
        MATCH (ctx:Context)
        WHERE ctx.graph_unique_id STARTS WITH $repoId AND ctx.branch = $branch
        RETURN ctx.agent AS agent, count(ctx) AS contextCount
        ORDER BY contextCount DESC
      `;

      const queryParams = { repoId, branch };

      const [countResult, recentResult, agentResult] = await Promise.all([
        this.kuzuClient.executeQuery(countQuery, queryParams),
        this.kuzuClient.executeQuery(recentQuery, queryParams),
        this.kuzuClient.executeQuery(agentQuery, queryParams),
      ]);

      const totalContexts = countResult[0]?.totalCount || 0;

      const recentContexts = recentResult.map((row: any) => {
        const ctxData = row.ctx.properties || row.ctx;
        return {
          id: ctxData.id?.toString() || `generated-ctx-${Math.random()}`,
          name: ctxData.name || null,
          summary: ctxData.summary || null,
          iso_date: ctxData.iso_date,
          created_at: this.parseTimestamp(ctxData.created_at),
          updated_at: this.parseTimestamp(ctxData.updated_at),
          agent: ctxData.agent || null,
          issue: ctxData.related_issue || ctxData.issue || null,
          decision_ids: [],
          observation_ids: [],
          repository: repoId,
          branch: branch,
        } as ContextResult;
      });

      const contextsByAgent: Record<string, number> = {};
      agentResult.forEach((row: any) => {
        const agent = row.agent || 'unknown';
        const count = row.contextCount || 0;
        contextsByAgent[agent] = count;
      });

      logger.info(`Context summary completed: ${totalContexts} total contexts`);

      return {
        totalContexts,
        recentContexts,
        contextsByAgent,
      };
    } catch (error: any) {
      logger.error(`Error getting context summary for ${repoId}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      throw new Error(`Failed to get context summary: ${error.message}`);
    }
  }
}
