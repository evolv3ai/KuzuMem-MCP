import { BaseGraphOperations, GetGoverningItemsParams, GoverningItemsResult } from '../base/base-graph-operations';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import { Decision, Rule } from '../../../types';

/**
 * Service responsible for governance operations
 * Handles retrieval of governing items (decisions, rules) for components
 */
export class GraphGovernanceService extends BaseGraphOperations {
  /**
   * Retrieves governing items (decisions, rules) for a component
   */
  async getGoverningItemsForComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    params: GetGoverningItemsParams,
  ): Promise<GoverningItemsResult> {
    const logger = this.createOperationLogger(mcpContext, 'getGoverningItemsForComponent', params);
    const { repository, branch, componentId } = params;
    const repoId = this.createRepoId(repository, branch);
    const componentGraphId = this.createComponentGraphId(repository, branch, componentId);

    logger.info(`Getting governing items for component ${componentId} in ${repoId}`);

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

      logger.debug(`Decisions query: ${decisionsQuery.trim()}`, queryParams);
      logger.debug(`Rules query: ${rulesQuery.trim()}`, queryParams);

      const [decisionResults, ruleResults] = await Promise.all([
        this.kuzuClient.executeQuery(decisionsQuery, queryParams),
        this.kuzuClient.executeQuery(rulesQuery, queryParams),
      ]);

      // Transform decision results
      const decisions = decisionResults
        .filter((row: any) => row.d)
        .map((row: any) => {
          const decisionData = row.d.properties || row.d;
          const createdAtStr = this.parseTimestamp(decisionData.created_at);
          const updatedAtStr = this.parseTimestamp(decisionData.updated_at);

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
          const createdAtStr = this.parseTimestamp(ruleData.created_at);
          const updatedAtStr = this.parseTimestamp(ruleData.updated_at);

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
        `Found ${decisions.length} decisions and ${rules.length} rules governing component ${componentId}`,
      );

      return {
        status: 'complete',
        decisions,
        rules,
        message: `Successfully retrieved ${decisions.length} decisions and ${rules.length} rules governing component ${componentId}`,
      };
    } catch (error: any) {
      logger.error(
        `Error fetching governing items for component ${componentId} in ${repoId}:`,
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
   * Get governance summary for a repository
   */
  async getGovernanceSummary(
    mcpContext: EnrichedRequestHandlerExtra,
    repository: string,
    branch: string,
  ): Promise<{
    totalDecisions: number;
    totalRules: number;
    decisionsByStatus: Record<string, number>;
    rulesByStatus: Record<string, number>;
    governedComponents: number;
  }> {
    const logger = this.createOperationLogger(mcpContext, 'getGovernanceSummary', {
      repository,
      branch,
    });
    const repoId = this.createRepoId(repository, branch);

    logger.info(`Getting governance summary for ${repoId}`);

    try {
      // Get total decisions count
      const decisionsCountQuery = `
        MATCH (d:Decision)
        WHERE d.graph_unique_id STARTS WITH $repoId AND d.branch = $branch
        RETURN count(d) AS totalDecisions
      `;

      // Get total rules count
      const rulesCountQuery = `
        MATCH (r:Rule)
        WHERE r.graph_unique_id STARTS WITH $repoId AND r.branch = $branch
        RETURN count(r) AS totalRules
      `;

      // Get decisions by status
      const decisionsByStatusQuery = `
        MATCH (d:Decision)
        WHERE d.graph_unique_id STARTS WITH $repoId AND d.branch = $branch
        RETURN d.status AS status, count(d) AS count
      `;

      // Get rules by status
      const rulesByStatusQuery = `
        MATCH (r:Rule)
        WHERE r.graph_unique_id STARTS WITH $repoId AND r.branch = $branch
        RETURN r.status AS status, count(r) AS count
      `;

      // Get governed components count
      const governedComponentsQuery = `
        MATCH (c:Component)
        WHERE c.graph_unique_id STARTS WITH $repoId AND c.branch = $branch
        AND ((c)-[:GOVERNED_BY]->(:Decision) OR (c)-[:GOVERNED_BY_RULE]->(:Rule))
        RETURN count(DISTINCT c) AS governedComponents
      `;

      const queryParams = { repoId, branch };

      const [
        decisionsCountResult,
        rulesCountResult,
        decisionsByStatusResult,
        rulesByStatusResult,
        governedComponentsResult,
      ] = await Promise.all([
        this.kuzuClient.executeQuery(decisionsCountQuery, queryParams),
        this.kuzuClient.executeQuery(rulesCountQuery, queryParams),
        this.kuzuClient.executeQuery(decisionsByStatusQuery, queryParams),
        this.kuzuClient.executeQuery(rulesByStatusQuery, queryParams),
        this.kuzuClient.executeQuery(governedComponentsQuery, queryParams),
      ]);

      const totalDecisions = decisionsCountResult[0]?.totalDecisions || 0;
      const totalRules = rulesCountResult[0]?.totalRules || 0;
      const governedComponents = governedComponentsResult[0]?.governedComponents || 0;

      const decisionsByStatus: Record<string, number> = {};
      decisionsByStatusResult.forEach((row: any) => {
        const status = row.status || 'unknown';
        const count = row.count || 0;
        decisionsByStatus[status] = count;
      });

      const rulesByStatus: Record<string, number> = {};
      rulesByStatusResult.forEach((row: any) => {
        const status = row.status || 'unknown';
        const count = row.count || 0;
        rulesByStatus[status] = count;
      });

      logger.info(
        `Governance summary completed: ${totalDecisions} decisions, ${totalRules} rules, ${governedComponents} governed components`,
      );

      return {
        totalDecisions,
        totalRules,
        decisionsByStatus,
        rulesByStatus,
        governedComponents,
      };
    } catch (error: any) {
      logger.error(`Error getting governance summary for ${repoId}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      throw new Error(`Failed to get governance summary: ${error.message}`);
    }
  }
}
