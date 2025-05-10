import { Rule } from "../types";
import { Mutex } from "../utils/mutex";
import { KuzuDBClient } from "../db/kuzu";

/**
 * Thread-safe singleton repository for Rule, using KuzuDB and Cypher queries
 */
export class RuleRepository {
  private static instance: RuleRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<RuleRepository> {
    const release = await RuleRepository.lock.acquire();
    try {
      if (!RuleRepository.instance) {
        RuleRepository.instance = new RuleRepository();
      }
      return RuleRepository.instance;
    } finally {
      release();
    }
  }

  /**
   * Get all active rules for a repository (status = 'active'), ordered by created descending
   */
  async getActiveRules(repositoryId: string): Promise<Rule[]> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repositoryId}'})-[:HAS_RULE]->(r:Rule {status: 'active'}) RETURN r ORDER BY r.created DESC`
    );
    if (!result || typeof result.getAll !== "function") return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    return rows.map((row: any) => row.r ?? row["r"] ?? row);
  }

  /**
   * Upsert a rule by repository_id and yaml_id
   */
  /**
   * Creates or updates a rule for a repository
   * Returns the upserted Rule or null if not found
   */
  async upsertRule(rule: Rule): Promise<Rule | null> {
    const existing = await this.findByYamlId(
      String(rule.repository_id),
      String(rule.yaml_id)
    );
    if (existing) {
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: '${String(
          rule.repository_id
        )}'})-[:HAS_RULE]->(r:Rule {yaml_id: '${String(
          rule.yaml_id
        )}'}) SET r.name = '${rule.name}', r.triggers = '${
          rule.triggers
        }', r.content = '${rule.content}', r.status = '${rule.status}' RETURN r`
      );
      return {
        ...existing,
        name: rule.name,
        triggers: rule.triggers,
        content: rule.content,
        status: rule.status,
      };
    } else {
      const now = new Date().toISOString();
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: '${String(
          rule.repository_id
        )}'}) CREATE (repo)-[:HAS_RULE]->(r:Rule {yaml_id: '${String(
          rule.yaml_id
        )}', name: '${rule.name}', triggers: '${rule.triggers}', content: '${
          rule.content
        }', status: '${rule.status}', created: timestamp('${now}')}) RETURN r`
      );
      // Return the newly created rule
      return this.findByYamlId(
        String(rule.repository_id),
        String(rule.yaml_id)
      );
    }
  }

  /**
   * Find a rule by repository_id and yaml_id
   */
  async findByYamlId(
    repositoryId: string,
    yaml_id: string
  ): Promise<Rule | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repositoryId}'})-[:HAS_RULE]->(r:Rule {yaml_id: '${yaml_id}'}) RETURN r LIMIT 1`
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].r ?? rows[0]["r"] ?? rows[0];
  }
}
