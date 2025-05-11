import { Decision } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';

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

  /**
   * Get all decisions for a repository in a date range, ordered by date descending
   */
  async getDecisionsByDateRange(
    repositoryId: string,
    branch: string,
    startDate: string,
    endDate: string,
  ): Promise<Decision[]> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedBranch = this.escapeStr(branch);
    const escapedStartDate = this.escapeStr(startDate);
    const escapedEndDate = this.escapeStr(endDate);

    const query = `MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_DECISION]->(d:Decision {branch: '${escapedBranch}'}) WHERE d.date >= '${escapedStartDate}' AND d.date <= '${escapedEndDate}' RETURN d ORDER BY d.date DESC`;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => {
      const rawDecisionData = row.d as any;
      let date_str = rawDecisionData.date;
      if (rawDecisionData.date instanceof Date) {
        date_str = rawDecisionData.date.toISOString().split('T')[0];
      }
      return { ...rawDecisionData, date: date_str } as Decision;
    });
  }

  /**
   * Upsert a decision by repository and yaml_id
   */
  /**
   * Creates or updates a decision for a repository
   * Returns the upserted Decision or null if not found
   */
  async upsertDecision(decision: Decision): Promise<Decision | null> {
    const repositoryId = String(decision.repository);
    const branch = String(decision.branch);
    const yamlId = String(decision.yaml_id);

    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedBranch = this.escapeStr(branch);
    const escapedYamlId = this.escapeStr(yamlId);
    const escapedName = this.escapeStr(decision.name);
    const escapedContext = this.escapeStr(decision.context);
    const escapedDate = this.escapeStr(decision.date);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const existing = await this.findByYamlId(repositoryId, yamlId, branch);

    if (existing) {
      const updateQuery = `MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_DECISION]->(d:Decision {yaml_id: '${escapedYamlId}', branch: '${escapedBranch}'})
         SET d.name = '${escapedName}', d.context = '${escapedContext}', d.date = date('${escapedDate}'), d.updated_at = timestamp('${kuzuTimestamp}')
         RETURN d`;
      await KuzuDBClient.executeQuery(updateQuery);
      return this.findByYamlId(repositoryId, yamlId, branch);
    } else {
      const createQuery = `MATCH (repo:Repository {id: '${escapedRepoId}'})
         CREATE (repo)-[:HAS_DECISION]->(d:Decision {
           yaml_id: '${escapedYamlId}', 
           name: '${escapedName}', 
           context: '${escapedContext}', 
           date: date('${escapedDate}'), 
           branch: '${escapedBranch}',
           created_at: timestamp('${kuzuTimestamp}'),
           updated_at: timestamp('${kuzuTimestamp}')
          })
         RETURN d`;
      await KuzuDBClient.executeQuery(createQuery);
      return this.findByYamlId(repositoryId, yamlId, branch);
    }
  }

  /**
   * Find a decision by repository and yaml_id
   */
  async findByYamlId(
    repositoryId: string,
    yaml_id: string,
    branch: string,
  ): Promise<Decision | null> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedYamlId = this.escapeStr(yaml_id);
    const escapedBranch = this.escapeStr(branch);
    const query = `MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_DECISION]->(d:Decision {yaml_id: '${escapedYamlId}', branch: '${escapedBranch}'}) RETURN d LIMIT 1`;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    const rawDecisionData = rows[0].d ?? rows[0]['d'] ?? rows[0];
    if (!rawDecisionData) {
      return null;
    }
    let date_str = rawDecisionData.date;
    if (rawDecisionData.date instanceof Date) {
      date_str = rawDecisionData.date.toISOString().split('T')[0];
    }
    return { ...rawDecisionData, date: date_str } as Decision;
  }

  /**
   * Get all decisions for a repository and branch.
   * @param repositoryId The synthetic ID of the repository (name + ':' + branch).
   * @param branch The branch name.
   * @returns A promise that resolves to an array of Decision objects.
   */
  async getAllDecisions(repositoryId: string, branch: string): Promise<Decision[]> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedBranch = this.escapeStr(branch);

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_DECISION]->(d:Decision {branch: '${escapedBranch}'})
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
    return rows.map((row: any) => {
      const rawDecisionData = row.d as any;
      let date_str = rawDecisionData.date;
      if (rawDecisionData.date instanceof Date) {
        date_str = rawDecisionData.date.toISOString().split('T')[0];
      }
      return { ...rawDecisionData, date: date_str } as Decision;
    });
  }
}
