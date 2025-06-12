import { KuzuDBClient } from '../db/kuzu';
import { Decision } from '../types';
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
      context: decisionContext,
    } = decision;

    const [logicalRepositoryName] = repositoryNodeId.split(':');
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, branch, logicalId);
    const now = new Date().toISOString();

    const query = `
      MERGE (d:Decision {id: $id})
      ON CREATE SET
        d.graph_unique_id = $graphUniqueId,
        d.title = $name,
        d.dateCreated = $date,
        d.rationale = $context,
        d.status = $status,
        d.created_at = $now,
        d.updated_at = $now
      ON MATCH SET
        d.title = $name,
        d.dateCreated = $date,
        d.rationale = $context,
        d.status = $status,
        d.updated_at = $now
      RETURN d
    `;

    const params = {
      id: logicalId,
      graphUniqueId,
      name,
      date,
      context: decisionContext,
      status: (decision as any).status || 'proposed',
      now,
    };

    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0) {
        return this.formatKuzuRowToDecision(result[0].d, logicalRepositoryName, branch);
      }
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
