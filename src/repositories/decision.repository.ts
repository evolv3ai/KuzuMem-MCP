import { Decision } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId, parseGraphUniqueId } from '../utils/id.utils';

/**
 * Thread-safe singleton repository for Decision, using KuzuDB and Cypher queries
 */
export class DecisionRepository {
  private static instance: DecisionRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<DecisionRepository> {
    const release = await DecisionRepository.lock.acquire();
    try {
      if (!DecisionRepository.instance) {
        DecisionRepository.instance = new DecisionRepository();
      }
      return DecisionRepository.instance;
    } finally {
      release();
    }
  }

  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  private formatDecision(decisionData: any): Decision {
    let date_str = decisionData.date;
    if (decisionData.date instanceof Date) {
      date_str = decisionData.date.toISOString().split('T')[0];
    }
    return {
      ...decisionData,
      id: decisionData.id,
      date: date_str,
      graph_unique_id: undefined,
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
    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedDecisionBranch = this.escapeStr(decisionBranch);
    const escapedStartDate = this.escapeStr(startDate);
    const escapedEndDate = this.escapeStr(endDate);

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})-[:HAS_DECISION]->(d:Decision {branch: '${escapedDecisionBranch}'})
      WHERE d.date >= date('${escapedStartDate}') AND d.date <= date('${escapedEndDate}') 
      RETURN d ORDER BY d.date DESC
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => this.formatDecision(row.d ?? row['d']));
  }

  /**
   * Creates or updates a decision.
   * `decision.repository` is the Repository node PK (e.g., 'my-repo:main').
   * `decision.branch` is the branch of this Decision entity.
   * `decision.id` is the logical ID of this Decision entity.
   */
  async upsertDecision(decision: Decision): Promise<Decision | null> {
    const repositoryNodeId = decision.repository;

    // Extract the logical repository name from the Repository Node ID
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 2) {
      // Expects 'repoName:repoBranch'
      throw new Error(
        `Invalid repositoryNodeId format in decision.repository: ${repositoryNodeId}`,
      );
    }
    const logicalRepositoryName = repoIdParts[0];

    const decisionBranch = decision.branch;
    const logicalId = decision.id;
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, decisionBranch, logicalId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedLogicalId = this.escapeStr(logicalId);
    const escapedName = this.escapeStr(decision.name);
    const escapedContext = this.escapeStr(decision.context);
    const escapedDate = this.escapeStr(decision.date);
    const escapedBranch = this.escapeStr(decisionBranch);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})
      MERGE (d:Decision {graph_unique_id: '${escapedGraphUniqueId}'})
      ON CREATE SET
        d.id = '${escapedLogicalId}',
        d.name = '${escapedName}',
        d.context = '${escapedContext}',
        d.date = date('${escapedDate}'),
        d.branch = '${escapedBranch}',
        d.created_at = timestamp('${kuzuTimestamp}'),
        d.updated_at = timestamp('${kuzuTimestamp}')
      ON MATCH SET
        d.name = '${escapedName}',
        d.context = '${escapedContext}',
        d.date = date('${escapedDate}'),
        d.branch = '${escapedBranch}',
        d.updated_at = timestamp('${kuzuTimestamp}')
      MERGE (repo)-[:HAS_DECISION]->(d)
      RETURN d`;

    await KuzuDBClient.executeQuery(query);
    return this.findByIdAndBranch(logicalRepositoryName, logicalId, decisionBranch);
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
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const query = `
      MATCH (d:Decision {graph_unique_id: '${escapedGraphUniqueId}'})
      RETURN d LIMIT 1
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    const rawDecisionData = rows[0].d ?? rows[0]['d'];
    if (!rawDecisionData) {
      return null;
    }
    return this.formatDecision(rawDecisionData);
  }

  /**
   * Get all decisions for a repository node and branch.
   */
  async getAllDecisions(repositoryNodeId: string, decisionBranch: string): Promise<Decision[]> {
    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedDecisionBranch = this.escapeStr(decisionBranch);

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})-[:HAS_DECISION]->(d:Decision {branch: '${escapedDecisionBranch}'})
      RETURN d
      ORDER BY d.date DESC, d.name ASC
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => this.formatDecision(row.d ?? row['d']));
  }
}
