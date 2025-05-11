import { Context } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';

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

  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  /**
   * Get the latest N contexts for a repository, ordered by iso_date descending
   */
  /**
   * Get the latest N contexts for a repository, ordered by created_at descending
   */
  async getLatestContexts(
    repositoryId: string, // This is the synthetic repoId (name:branch)
    // branch parameter is redundant here as repoId includes it
    limit: number = 10,
  ): Promise<Context[]> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const query = `
      MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_CONTEXT]->(c:Context)
      RETURN c ORDER BY c.created_at DESC LIMIT ${limit}
    `; // limit is a number, directly interpolated
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => row.c as Context);
  }

  /**
   * Get the context for a repository for a specific iso_date
   */
  /**
   * Get the context for a repository for a specific iso_date
   */
  async getTodayContext(repositoryId: string, today: string): Promise<Context | null> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedToday = this.escapeStr(today);

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_CONTEXT]->(c:Context {iso_date: date('${escapedToday}')}) 
      RETURN c LIMIT 1
    `; // Used date() function for comparison
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }

    const rawContextData = rows[0].c ?? rows[0]['c'] ?? rows[0];
    if (!rawContextData) {
      return null;
    }

    // Ensure iso_date is consistently a 'YYYY-MM-DD' string
    let iso_date_str = rawContextData.iso_date;
    if (rawContextData.iso_date instanceof Date) {
      iso_date_str = rawContextData.iso_date.toISOString().split('T')[0];
    }

    return {
      ...rawContextData,
      iso_date: iso_date_str,
    } as Context;
  }

  /**
   * Upsert a context by repository_id and yaml_id
   */
  /**
   * Creates or updates context for a repository
   * Returns the upserted Context or null if not found
   */
  /**
   * Creates or updates context for a repository (only one context per repository/yaml_id)
   * Uses the synthetic repository id (id = name + ':' + branch)
   */
  async upsertContext(context: Context): Promise<Context | null> {
    const repositoryId = String(context.repository);
    console.error(
      `DEBUG: context.repository.ts - upsertContext - received context.repository: >>>${context.repository}<<<, type: ${typeof context.repository}`,
    );
    const escapedRepoId = this.escapeStr(repositoryId);
    console.error(
      `DEBUG: context.repository.ts - upsertContext - escapedRepoId: >>>${escapedRepoId}<<<`,
    );
    const escapedYamlId = this.escapeStr(context.yaml_id);
    const escapedName = this.escapeStr(context.name);
    const escapedSummary = this.escapeStr(context.summary);
    const escapedIsoDate = this.escapeStr(context.iso_date); // This is YYYY-MM-DD
    const escapedBranch = this.escapeStr(context.branch); // Define and escape branch
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const existing = await this.findByYamlId(repositoryId, context.yaml_id);

    if (existing) {
      const updateQuery = `
         MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_CONTEXT]->(c:Context {yaml_id: '${escapedYamlId}'})
         SET c.name = '${escapedName}', c.summary = '${escapedSummary}', c.iso_date = date('${escapedIsoDate}'), c.branch = '${escapedBranch}', c.updated_at = timestamp('${kuzuTimestamp}')
         RETURN c`; // Added c.branch to SET
      await KuzuDBClient.executeQuery(updateQuery);
      return this.findByYamlId(repositoryId, context.yaml_id);
    } else {
      const createQuery = `
         MATCH (repo:Repository {id: '${escapedRepoId}'})
         CREATE (repo)-[:HAS_CONTEXT]->(c:Context {
           yaml_id: '${escapedYamlId}',
           name: '${escapedName}',
           iso_date: date('${escapedIsoDate}'), 
           summary: '${escapedSummary}',
           branch: '${escapedBranch}', // Added branch to CREATE
           created_at: timestamp('${kuzuTimestamp}'),
           updated_at: timestamp('${kuzuTimestamp}')
         })
         RETURN c`;
      await KuzuDBClient.executeQuery(createQuery);
      return this.findByYamlId(repositoryId, context.yaml_id);
    }
  }

  /**
   * Find a context by repository_id and yaml_id
   */
  /**
   * Find a context by repository_id and yaml_id using synthetic id
   */
  async findByYamlId(
    repositoryId: string, // This is the synthetic repoId (name:branch)
    yaml_id: string,
    // branch parameter is redundant
  ): Promise<Context | null> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedYamlId = this.escapeStr(yaml_id);
    // Context nodes should be matched by yaml_id, not branch directly
    const query = `
      MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_CONTEXT]->(c:Context {yaml_id: '${escapedYamlId}'})
      RETURN c LIMIT 1
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }

    const rawContextData = rows[0].c ?? rows[0]['c'] ?? rows[0];
    if (!rawContextData) {
      return null;
    }

    let iso_date_str = rawContextData.iso_date;
    if (rawContextData.iso_date instanceof Date) {
      iso_date_str = rawContextData.iso_date.toISOString().split('T')[0];
    }

    return {
      ...rawContextData,
      iso_date: iso_date_str,
    } as Context;
  }
}
