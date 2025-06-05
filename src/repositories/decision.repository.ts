import { Decision } from '../types';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId } from '../utils/id.utils';
import { RepositoryRepository } from './repository.repository';

/**
 * Repository for Decision, using KuzuDB and Cypher queries.
 * Each instance is now tied to a specific KuzuDBClient.
 */
export class DecisionRepository {
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository;

  /**
   * Constructor requires an initialized KuzuDBClient instance.
   * @param kuzuClient An initialized KuzuDBClient.
   */
  public constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    if (!kuzuClient) {
      throw new Error('DecisionRepository requires an initialized KuzuDBClient instance.');
    }
    if (!repositoryRepo) {
      throw new Error('DecisionRepository requires an initialized RepositoryRepository instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  private formatKuzuRowToDecision(
    kuzuRowData: any,
    repositoryName: string,
    branch: string,
  ): Decision {
    const rawDecision = kuzuRowData.properties || kuzuRowData;
    const logicalId = rawDecision.id?.toString();
    const graphUniqueId =
      rawDecision.graph_unique_id?.toString() ||
      formatGraphUniqueId(repositoryName, branch, logicalId);

    let decisionDate = rawDecision.date;
    if (rawDecision.date instanceof Date) {
      decisionDate = rawDecision.date.toISOString().split('T')[0];
    } else if (typeof rawDecision.date === 'number') {
      decisionDate = new Date(rawDecision.date).toISOString().split('T')[0];
    } else if (
      typeof rawDecision.date === 'object' &&
      rawDecision.date !== null &&
      'year' in rawDecision.date &&
      'month' in rawDecision.date &&
      'day' in rawDecision.date
    ) {
      decisionDate = `${String(rawDecision.date.year).padStart(4, '0')}-${String(rawDecision.date.month).padStart(2, '0')}-${String(rawDecision.date.day).padStart(2, '0')}`;
    }

    return {
      id: logicalId,
      graph_unique_id: graphUniqueId,
      name: rawDecision.name,
      context: rawDecision.context,
      date: decisionDate,
      branch: rawDecision.branch,
      repository: `${repositoryName}:${branch}`,
      status: rawDecision.status,
      created_at: rawDecision.created_at ? new Date(rawDecision.created_at) : new Date(),
      updated_at: rawDecision.updated_at ? new Date(rawDecision.updated_at) : new Date(),
    } as Decision;
  }

  /**
   * Get all decisions for a repository node and branch in a date range.
   */
  async getDecisionsByDateRange(
    repositoryNodeId: string,
    decisionBranch: string,
    startDate: string,
    endDate: string,
  ): Promise<Decision[]> {
    const query = `
      MATCH (repo:Repository {id: $repositoryNodeId})-[:HAS_DECISION]->(d:Decision)
      WHERE d.branch = $decisionBranch AND d.date >= date($startDate) AND d.date <= date($endDate) 
      RETURN d ORDER BY d.date DESC
    `;
    const params = { repositoryNodeId, decisionBranch, startDate, endDate };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToDecision(row.d, repoNameFromNodeId, decisionBranch),
      );
    } catch (error) {
      console.error(
        `[DecisionRepository] Error in getDecisionsByDateRange for ${repositoryNodeId}, branch ${decisionBranch}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Creates or updates a decision.
   * `decision.repository` is the Repository node PK (e.g., 'my-repo:main').
   * `decision.branch` is the branch of this Decision entity.
   * `decision.id` is the logical ID of this Decision entity.
   */
  async upsertDecision(decision: Decision): Promise<Decision | null> {
    const logger = console; // Placeholder logger
    const {
      repository: repositoryNodeId,
      branch,
      id: logicalId,
      name,
      date,
      context: decisionContext /*, status */,
    } = decision;
    const statusFromInput = (decision as any).status;

    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 1) {
      logger.error(`[DecisionRepository] Invalid repositoryNodeId format: ${repositoryNodeId}`);
      throw new Error(`Invalid repositoryNodeId format for upsertDecision: ${repositoryNodeId}`);
    }
    const logicalRepositoryName = repoIdParts[0];
    const effectiveBranch = repoIdParts.length > 1 ? repoIdParts[1] : branch;

    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, effectiveBranch, logicalId);
    const now = new Date();

    // Validate date format (YYYY-MM-DD string) from input 'decision.date'
    let kuzuDateString = decision.date; // Directly use the string from Decision type
    if (typeof kuzuDateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(kuzuDateString)) {
      logger.warn(
        `[DecisionRepository] Invalid or non-string date format for decision ${logicalId}: '${kuzuDateString}'. Defaulting to current date. Expected YYYY-MM-DD string.`,
      );
      kuzuDateString = new Date().toISOString().split('T')[0];
    }

    const propsOnCreate = {
      id: logicalId,
      graph_unique_id: graphUniqueId,
      name: name,
      date: kuzuDateString,
      branch: effectiveBranch,
      created_at: now.toISOString(),
    };

    const propsOnMatch = {
      name: name,
      date: kuzuDateString,
    };

    const refinedQuery = `
      MATCH (repo:Repository {id: $repositoryNodeIdParam})
      MERGE (d:Decision {graph_unique_id: $graphUniqueIdParam})
      ON CREATE SET 
        d.id = $propsOnCreateParam.id,
        d.graph_unique_id = $graphUniqueIdParam,
        d.branch = $propsOnCreateParam.branch,
        d.name = $propsOnCreateParam.name,
        d.context = $decisionContextParamForCreate,
        d.date = date($propsOnCreateParam.date),
        d.created_at = CASE 
          WHEN $propsOnCreateParam.created_at IS NOT NULL THEN timestamp($propsOnCreateParam.created_at) 
          ELSE current_timestamp() 
        END,
        d.updated_at = current_timestamp()
      ON MATCH SET 
        d.name = $nameParam, 
        d.context = $decisionContextParamForMatch,
        d.date = date($dateParam),
        d.updated_at = current_timestamp()
      MERGE (repo)-[:HAS_DECISION]->(d)
      RETURN d
    `;

    const queryParams = {
      repositoryNodeIdParam: repositoryNodeId,
      graphUniqueIdParam: graphUniqueId,
      propsOnCreateParam: propsOnCreate,
      decisionContextParamForCreate: decisionContext || null,
      nameParam: propsOnMatch.name,
      decisionContextParamForMatch: decisionContext || null,
      dateParam: propsOnMatch.date,
    };

    try {
      logger.debug(
        `[DecisionRepository] Upserting Decision GID ${graphUniqueId} for repo ${repositoryNodeId}`,
      );
      const result = await this.kuzuClient.executeQuery(refinedQuery, queryParams);
      if (result && result.length > 0 && result[0].d) {
        logger.info(
          `[DecisionRepository] Decision ${logicalId} upserted successfully for ${repositoryNodeId}`,
        );
        return this.formatKuzuRowToDecision(result[0].d, logicalRepositoryName, effectiveBranch);
      }
      logger.warn(
        `[DecisionRepository] UpsertDecision did not return a node for GID ${graphUniqueId}`,
      );
      return null;
    } catch (error: any) {
      logger.error(
        `[DecisionRepository] Error in upsertDecision for GID ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      throw error;
    }
  }

  /**
   * Find a decision by its logical ID and branch, within a given repository name.
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Decision | null> {
    const graphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);
    const query = `MATCH (d:Decision {graph_unique_id: $graphUniqueId}) RETURN d LIMIT 1`;
    const params = { graphUniqueId };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0 && result[0].d) {
        return this.formatKuzuRowToDecision(result[0].d, repositoryName, itemBranch);
      }
      return null;
    } catch (error) {
      console.error(
        `[DecisionRepository] Error in findByIdAndBranch for GID ${graphUniqueId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get all decisions for a repository node and branch.
   */
  async getAllDecisions(repositoryNodeId: string, decisionBranch: string): Promise<Decision[]> {
    const query = `
      MATCH (repo:Repository {id: $repositoryNodeId})-[:HAS_DECISION]->(d:Decision)
      WHERE d.branch = $decisionBranch
      RETURN d ORDER BY d.date DESC, d.name ASC
    `;
    const params = { repositoryNodeId, decisionBranch };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToDecision(row.d, repoNameFromNodeId, decisionBranch),
      );
    } catch (error) {
      console.error(
        `[DecisionRepository] Error in getAllDecisions for ${repositoryNodeId}, branch ${decisionBranch}:`,
        error,
      );
      return [];
    }
  }
}
