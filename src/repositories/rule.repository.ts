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
  async getActiveRules(repository: string, branch: string): Promise<Rule[]> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repository}'})-[:HAS_RULE]->(r:Rule {status: 'active', branch: '${branch}'}) RETURN r ORDER BY r.created DESC`
    );
    if (!result || typeof result.getAll !== "function") return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    return rows.map((row: any) => row.r ?? row["r"] ?? row);
  }

  /**
   * Upsert a rule by repository and yaml_id
   */
  /**
   * Creates or updates a rule for a repository
   * Returns the upserted Rule or null if not found
   */
  async upsertRule(rule: Rule): Promise<Rule | null> {
    const existing = await this.findByYamlId(
      String(rule.repository),
      String(rule.yaml_id),
      String(rule.branch)
    );
    if (existing) {
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: '${String(
          rule.repository
        )}'})-[:HAS_RULE]->(r:Rule {yaml_id: '${String(
          rule.yaml_id
        )}', branch: '${String(rule.branch)}'}) SET r.name = '${
          rule.name
        }', r.triggers = '${rule.triggers}', r.content = '${
          rule.content
        }', r.status = '${rule.status}' RETURN r`
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
          rule.repository
        )}'}) CREATE (repo)-[:HAS_RULE]->(r:Rule {yaml_id: '${String(
          rule.yaml_id
        )}', name: '${rule.name}', triggers: '${rule.triggers}', content: '${
          rule.content
        }', status: '${rule.status}', branch: '${String(
          rule.branch
        )}', created: timestamp('${now}')}) RETURN r`
      );
      // Return the newly created rule
      return this.findByYamlId(
        String(rule.repository),
        String(rule.yaml_id),
        String(rule.branch)
      );
    }
  }

  /**
   * Find a rule by repository and yaml_id
   */
  async findByYamlId(
    repository: string,
    yaml_id: string,
    branch: string
  ): Promise<Rule | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repository}'})-[:HAS_RULE]->(r:Rule {yaml_id: '${yaml_id}', branch: '${branch}'}) RETURN r LIMIT 1`
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].r ?? rows[0]["r"] ?? rows[0];
  }

  /**
   * Get all rules for a repository and branch.
   * @param repositoryId The synthetic ID of the repository (name + ':' + branch).
   * @param branch The branch name.
   * @returns A promise that resolves to an array of Rule objects.
   */
  async getAllRules(repositoryId: string, branch: string): Promise<Rule[]> {
    const safeRepositoryId = repositoryId.replace(/'/g, "\\'");
    const safeBranch = branch.replace(/'/g, "\\'");

    const query = `
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_RULE]->(r:Rule {branch: '${safeBranch}'})
      RETURN r
      ORDER BY r.created DESC, r.name ASC
    `;
    // console.log("Executing getAllRules query:", query);
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== "function") {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => row.r ?? row["r"] ?? row);
  }
}
