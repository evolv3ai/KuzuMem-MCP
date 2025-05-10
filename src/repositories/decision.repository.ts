import { Decision } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from "../db/kuzu";

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

  /**
   * Get all decisions for a repository in a date range, ordered by date descending
   */
  async getDecisionsByDateRange(
    repositoryId: number,
    startDate: string,
    endDate: string
  ): Promise<Decision[]> {
    const result = await this.conn.query(
      'MATCH (d:Decision {repository_id: $repositoryId}) WHERE d.date >= $startDate AND d.date <= $endDate RETURN d ORDER BY d.date DESC',
      { repositoryId, startDate, endDate }
    );
    if (!result) return [];
    return result.map((row: any) => row.get('d'));
  }

  /**
   * Upsert a decision by repository_id and yaml_id
   */
  /**
   * Creates or updates a decision for a repository
   * Returns the upserted Decision or null if not found
   */
  async upsertDecision(decision: Decision): Promise<Decision | null> {
    const existing = await this.findByYamlId(decision.repository_id, decision.yaml_id);
    if (existing) {
      await this.conn.query(
        'MATCH (d:Decision {repository_id: $repository_id, yaml_id: $yaml_id}) SET d.name = $name, d.context = $context, d.date = $date RETURN d',
        {
          repository_id: decision.repository_id,
          yaml_id: decision.yaml_id,
          name: decision.name,
          context: decision.context,
          date: decision.date
        }
      );
      return {
        ...existing,
        name: decision.name,
        context: decision.context,
        date: decision.date
      };
    } else {
      await this.conn.query(
        'CREATE (d:Decision {repository_id: $repository_id, yaml_id: $yaml_id, name: $name, context: $context, date: $date}) RETURN d',
        {
          repository_id: decision.repository_id,
          yaml_id: decision.yaml_id,
          name: decision.name,
          context: decision.context,
          date: decision.date
        }
      );
      // Return the newly created decision
      return this.findByYamlId(decision.repository_id, decision.yaml_id);
    }
  }

  /**
   * Find a decision by repository_id and yaml_id
   */
  async findByYamlId(repository_id: number, yaml_id: string): Promise<Decision | null> {
    const result = await this.conn.query(
      'MATCH (d:Decision {repository_id: $repository_id, yaml_id: $yaml_id}) RETURN d LIMIT 1',
      { repository_id, yaml_id }, () => {}
    );
    if (!result || typeof result.getAll !== 'function') return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].get('d');
  }
}

