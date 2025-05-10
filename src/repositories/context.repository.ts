import { Context } from "../types";
import { Mutex } from "../utils/mutex";
import { KuzuDBClient } from "../db/kuzu";

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
  /**
   * Get the latest N contexts for a repository, ordered by created_at descending
   */
  async getLatestContexts(
    repositoryId: string,
    limit: number = 10
  ): Promise<Context[]> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repositoryId}'})-[:HAS_CONTEXT]->(c:Context)
       RETURN c ORDER BY c.created_at DESC LIMIT ${limit}`
    );
    if (!result || typeof result.getAll !== "function") return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    return rows.map((row: any) => row.c ?? row["c"] ?? row);
  }

  /**
   * Get the context for a repository for a specific iso_date
   */
  /**
   * Get the context for a repository for a specific iso_date
   */
  async getTodayContext(
    repositoryId: string,
    today: string
  ): Promise<Context | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repositoryId}'})-[:HAS_CONTEXT]->(c:Context {iso_date: '${today}'}) RETURN c LIMIT 1`
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].c ?? rows[0]["c"] ?? rows[0];
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
    const existing = await this.findByYamlId(
      String(context.repository),
      String(context.yaml_id)
    );
    if (existing) {
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: '${context.repository}'})-[:HAS_CONTEXT]->(c:Context {yaml_id: '${context.yaml_id}'})
         SET c.agent = '${context.agent}', c.related_issue = '${context.related_issue}', c.summary = '${context.summary}', c.decisions = '${context.decisions}', c.observations = '${context.observations}'
         RETURN c`
      );
      return {
        ...existing,
        agent: context.agent,
        related_issue: context.related_issue,
        summary: context.summary,
        decisions: context.decisions,
        observations: context.observations,
      };
    } else {
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: '${context.repository}'})
         CREATE (repo)-[:HAS_CONTEXT]->(c:Context {
           repository: '${context.repository}',
           yaml_id: '${context.yaml_id}',
           iso_date: '${context.iso_date}',
           agent: '${context.agent}',
           related_issue: '${context.related_issue}',
           summary: '${context.summary}',
           decisions: '${context.decisions}',
           observations: '${context.observations}'
         })
         RETURN c`
      );
      return this.findByYamlId(
        String(context.repository),
        String(context.yaml_id)
      );
    }
  }

  /**
   * Find a context by repository_id and yaml_id
   */
  /**
   * Find a context by repository_id and yaml_id using synthetic id
   */
  async findByYamlId(
    repositoryId: string,
    yaml_id: string
  ): Promise<Context | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repositoryId}'})-[:HAS_CONTEXT]->(c:Context {yaml_id: '${yaml_id}'}) RETURN c LIMIT 1`
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].c ?? rows[0]["c"] ?? rows[0];
  }
}
