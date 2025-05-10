import { Context } from '../types';
import { Mutex } from '../utils/mutex';
const { KuzuDBClient } = require("../db/kuzu");

/**
 * Thread-safe singleton repository for Context, using KuzuDB and Cypher queries
 */
export class ContextRepository {
  private static instance: ContextRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<ContextRepository> {
    const release = await ContextRepository.lock.acquire();
    try {
      if (!ContextRepository.instance) {
        ContextRepository.instance = new ContextRepository();
      }
      return ContextRepository.instance;
    } finally {
      release();
    }
  }

  /**
   * Get the latest N contexts for a repository, ordered by iso_date descending
   */
  async getLatestContexts(repositoryId: number, limit: number = 10): Promise<Context[]> {
    const result = await this.conn.query(
      'MATCH (c:Context {repository_id: $repositoryId}) RETURN c ORDER BY c.iso_date DESC LIMIT $limit',
      { repositoryId, limit }
    );
    if (!result) return [];
    return result.map((row: any) => row.get('c'));
  }

  /**
   * Get the context for a repository for a specific iso_date
   */
  async getTodayContext(repositoryId: number, today: string): Promise<Context | null> {
    const result = await this.conn.query(
      'MATCH (c:Context {repository_id: $repositoryId, iso_date: $today}) RETURN c LIMIT 1',
      { repositoryId, today }
    );
    if (!result || result.length === 0) return null;
    return result[0].get('c');
  }

  /**
   * Upsert a context by repository_id and yaml_id
   */
  /**
   * Creates or updates context for a repository
   * Returns the upserted Context or null if not found
   */
  async upsertContext(context: Context): Promise<Context | null> {
    const existing = await this.findByYamlId(context.repository_id, context.yaml_id);
    if (existing) {
      await this.conn.query(
        'MATCH (c:Context {repository_id: $repository_id, yaml_id: $yaml_id}) SET c.agent = $agent, c.related_issue = $related_issue, c.summary = $summary, c.decisions = $decisions, c.observations = $observations RETURN c',
        {
          repository_id: context.repository_id,
          yaml_id: context.yaml_id,
          agent: context.agent,
          related_issue: context.related_issue,
          summary: context.summary,
          decisions: context.decisions,
          observations: context.observations
        }
      );
      return {
        ...existing,
        agent: context.agent,
        related_issue: context.related_issue,
        summary: context.summary,
        decisions: context.decisions,
        observations: context.observations
      };
    } else {
      await this.conn.query(
        'CREATE (c:Context {repository_id: $repository_id, yaml_id: $yaml_id, iso_date: $iso_date, agent: $agent, related_issue: $related_issue, summary: $summary, decisions: $decisions, observations: $observations}) RETURN c',
        {
          repository_id: context.repository_id,
          yaml_id: context.yaml_id,
          iso_date: context.iso_date,
          agent: context.agent,
          related_issue: context.related_issue,
          summary: context.summary,
          decisions: context.decisions,
          observations: context.observations
        }
      );
      // Return the newly created context
      return this.findByYamlId(context.repository_id, context.yaml_id);
    }
  }

  /**
   * Find a context by repository_id and yaml_id
   */
  async findByYamlId(repository_id: number, yaml_id: string): Promise<Context | null> {
    const result = await this.conn.query(
      'MATCH (c:Context {repository_id: $repository_id, yaml_id: $yaml_id}) RETURN c LIMIT 1',
      { repository_id, yaml_id }
    );
    if (!result || result.length === 0) return null;
    return result[0].get('c');
  }
}

