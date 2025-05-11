import { Rule } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';

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

  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  private escapeJsonProp(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    try {
      const jsonString = JSON.stringify(value);
      return `'${this.escapeStr(jsonString)}'`;
    } catch (e) {
      console.error('Failed to stringify JSON for escapeJsonProp', value, e);
      return 'null';
    }
  }

  private formatStringArrayForCypher(arr: string[] | undefined | null): string {
    if (arr === undefined || arr === null || arr.length === 0) {
      return 'null'; // Cypher keyword null for empty or null arrays
    }
    const escapedItems = arr.map((item) => `'${this.escapeStr(item)}'`);
    return `[${escapedItems.join(', ')}]`;
  }

  /**
   * Get all active rules for a repository (status = 'active'), ordered by created descending
   */
  async getActiveRules(repositoryId: string, branch: string): Promise<Rule[]> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedBranch = this.escapeStr(branch);
    const query = `MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_RULE]->(r:Rule {status: 'active', branch: '${escapedBranch}'}) RETURN r ORDER BY r.created DESC`;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => {
      const rawRuleData = row.r as any;
      let created_str = rawRuleData.created;
      if (rawRuleData.created instanceof Date) {
        created_str = rawRuleData.created.toISOString().split('T')[0];
      }
      return { ...rawRuleData, created: created_str } as Rule;
    });
  }

  /**
   * Upsert a rule by repository and yaml_id
   */
  /**
   * Creates or updates a rule for a repository
   * Returns the upserted Rule or null if not found
   */
  async upsertRule(rule: Rule): Promise<Rule | null> {
    const repositoryId = String(rule.repository);
    const branch = String(rule.branch);
    const yamlId = String(rule.yaml_id);

    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedBranch = this.escapeStr(branch);
    const escapedYamlId = this.escapeStr(yamlId);
    const escapedName = this.escapeStr(rule.name);
    const escapedCreated = this.escapeStr(rule.created);
    const cypherTriggersList = this.formatStringArrayForCypher(rule.triggers); // Use new helper
    const escapedContent = this.escapeStr(rule.content);
    const escapedStatus = this.escapeStr(rule.status || 'active');
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const existing = await this.findByYamlId(repositoryId, yamlId, branch);

    if (existing) {
      const updateQuery = `MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_RULE]->(r:Rule {yaml_id: '${escapedYamlId}', branch: '${escapedBranch}'})
         SET r.name = '${escapedName}', r.triggers = ${cypherTriggersList}, r.content = '${escapedContent}', r.status = '${escapedStatus}', r.updated_at = timestamp('${kuzuTimestamp}')
         RETURN r`;
      await KuzuDBClient.executeQuery(updateQuery);
      return this.findByYamlId(repositoryId, yamlId, branch);
    } else {
      const createQuery = `MATCH (repo:Repository {id: '${escapedRepoId}'})
         CREATE (repo)-[:HAS_RULE]->(r:Rule {
           yaml_id: '${escapedYamlId}', 
           name: '${escapedName}', 
           created: date('${escapedCreated}'), 
           triggers: ${cypherTriggersList}, 
           content: '${escapedContent}', 
           status: '${escapedStatus}', 
           branch: '${escapedBranch}',
           created_at: timestamp('${kuzuTimestamp}'),
           updated_at: timestamp('${kuzuTimestamp}')
          })
         RETURN r`;
      await KuzuDBClient.executeQuery(createQuery);
      return this.findByYamlId(repositoryId, yamlId, branch);
    }
  }

  /**
   * Find a rule by repository and yaml_id
   */
  async findByYamlId(repositoryId: string, yaml_id: string, branch: string): Promise<Rule | null> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedYamlId = this.escapeStr(yaml_id);
    const escapedBranch = this.escapeStr(branch);
    const query = `MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_RULE]->(r:Rule {yaml_id: '${escapedYamlId}', branch: '${escapedBranch}'}) RETURN r LIMIT 1`;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    const rawRuleData = rows[0].r ?? rows[0]['r'] ?? rows[0];
    if (!rawRuleData) {
      return null;
    }
    let created_str = rawRuleData.created;
    if (rawRuleData.created instanceof Date) {
      created_str = rawRuleData.created.toISOString().split('T')[0];
    }
    return { ...rawRuleData, created: created_str } as Rule;
  }

  /**
   * Get all rules for a repository and branch.
   * @param repositoryId The synthetic ID of the repository (name + ':' + branch).
   * @param branch The branch name.
   * @returns A promise that resolves to an array of Rule objects.
   */
  async getAllRules(repositoryId: string, branch: string): Promise<Rule[]> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const escapedBranch = this.escapeStr(branch);

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_RULE]->(r:Rule {branch: '${escapedBranch}'})
      RETURN r
      ORDER BY r.created DESC, r.name ASC
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
      const rawRuleData = row.r as any;
      let created_str = rawRuleData.created;
      if (rawRuleData.created instanceof Date) {
        created_str = rawRuleData.created.toISOString().split('T')[0];
      }
      return { ...rawRuleData, created: created_str } as Rule;
    });
  }
}
