import { Rule } from '../types';
import { Mutex } from '../utils/mutex';
const { KuzuDBClient } = require("../db/kuzu");

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
  async getActiveRules(repositoryId: number): Promise<Rule[]> {
    const result = await this.conn.query(
      'MATCH (r:Rule {repository_id: $repositoryId, status: "active"}) RETURN r ORDER BY r.created DESC',
      { repositoryId }
    );
    if (!result) return [];
    return result.map((row: any) => row.get('r'));
  }

  /**
   * Upsert a rule by repository_id and yaml_id
   */
  /**
   * Creates or updates a rule for a repository
   * Returns the upserted Rule or null if not found
   */
  async upsertRule(rule: Rule): Promise<Rule | null> {
    const existing = await this.findByYamlId(rule.repository_id, rule.yaml_id);
    if (existing) {
      await this.conn.query(
        'MATCH (r:Rule {repository_id: $repository_id, yaml_id: $yaml_id}) SET r.name = $name, r.triggers = $triggers, r.content = $content, r.status = $status RETURN r',
        {
          repository_id: rule.repository_id,
          yaml_id: rule.yaml_id,
          name: rule.name,
          triggers: rule.triggers,
          content: rule.content,
          status: rule.status
        }
      );
      return {
        ...existing,
        name: rule.name,
        triggers: rule.triggers,
        content: rule.content,
        status: rule.status
      };
    } else {
      await this.conn.query(
        'CREATE (r:Rule {repository_id: $repository_id, yaml_id: $yaml_id, name: $name, triggers: $triggers, content: $content, status: $status, created: datetime()}) RETURN r',
        {
          repository_id: rule.repository_id,
          yaml_id: rule.yaml_id,
          name: rule.name,
          triggers: rule.triggers,
          content: rule.content,
          status: rule.status
        }
      );
      // Return the newly created rule
      return this.findByYamlId(rule.repository_id, rule.yaml_id);
    }
  }

  /**
   * Find a rule by repository_id and yaml_id
   */
  async findByYamlId(repository_id: number, yaml_id: string): Promise<Rule | null> {
    const result = await this.conn.query(
      'MATCH (r:Rule {repository_id: $repository_id, yaml_id: $yaml_id}) RETURN r LIMIT 1',
      { repository_id, yaml_id }
    );
    if (!result || result.length === 0) return null;
    return result[0].get('r');
  }
}

