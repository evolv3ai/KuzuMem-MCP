import { Rule } from '../types';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId } from '../utils/id.utils';

/**
 * Repository for Rule, using KuzuDB and Cypher queries.
 * Each instance is now tied to a specific KuzuDBClient.
 */
export class RuleRepository {
  private kuzuClient: KuzuDBClient;

  /**
   * Constructor requires an initialized KuzuDBClient instance.
   * @param kuzuClient An initialized KuzuDBClient.
   */
  public constructor(kuzuClient: KuzuDBClient) {
    if (!kuzuClient) {
      throw new Error('RuleRepository requires an initialized KuzuDBClient instance.');
    }
    this.kuzuClient = kuzuClient;
  }

  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  private formatStringArrayForCypher(arr: string[] | undefined | null): string {
    if (arr === undefined || arr === null || arr.length === 0) {
      return 'null';
    }
    const escapedItems = arr.map((item) => `'${this.escapeStr(item)}'`);
    return `[${escapedItems.join(', ')}]`;
  }

  private formatRule(ruleData: any): Rule {
    let created_str = ruleData.created;
    if (ruleData.created && typeof ruleData.created.toISOString === 'function') {
      created_str = ruleData.created.toISOString().split('T')[0];
    } else if (typeof ruleData.created === 'string') {
      created_str = ruleData.created;
    }
    return {
      ...ruleData,
      id: ruleData.id,
      created: created_str,
      triggers: Array.isArray(ruleData.triggers) ? ruleData.triggers : [],
      graph_unique_id: undefined,
    } as Rule;
  }

  /**
   * Get all active rules for a repository node and branch.
   */
  async getActiveRules(repositoryNodeId: string, ruleBranch: string): Promise<Rule[]> {
    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedRuleBranch = this.escapeStr(ruleBranch);
    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})-[:HAS_RULE]->(r:Rule {status: 'active', branch: '${escapedRuleBranch}'})
      RETURN r ORDER BY r.created DESC
    `;
    const result = await this.kuzuClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => this.formatRule(row.r ?? row['r']));
  }

  /**
   * Creates or updates a rule.
   * `rule.repository` is the Repository node PK (e.g., 'my-repo:main').
   * `rule.branch` is the branch of this Rule entity.
   * `rule.id` is the logical ID of this Rule entity.
   */
  async upsertRule(rule: Rule): Promise<Rule | null> {
    const repositoryNodeId = rule.repository;

    // Extract the logical repository name from the Repository Node ID
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 2) {
      // Expects 'repoName:repoBranch'
      throw new Error(`Invalid repositoryNodeId format in rule.repository: ${repositoryNodeId}`);
    }
    const logicalRepositoryName = repoIdParts[0];

    const ruleBranch = rule.branch;
    const logicalId = rule.id;
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, ruleBranch, logicalId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedLogicalId = this.escapeStr(logicalId);
    const escapedName = this.escapeStr(rule.name);
    const escapedCreated = this.escapeStr(rule.created);
    const cypherTriggersList = this.formatStringArrayForCypher(rule.triggers);
    const escapedContent = this.escapeStr(rule.content);
    const escapedStatus = this.escapeStr(rule.status || 'active');
    const escapedBranch = this.escapeStr(ruleBranch);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})
      MERGE (r:Rule {graph_unique_id: '${escapedGraphUniqueId}'})
      ON CREATE SET
        r.id = '${escapedLogicalId}',
        r.name = '${escapedName}',
        r.created = date('${escapedCreated}'), 
        r.triggers = ${cypherTriggersList}, 
        r.content = '${escapedContent}', 
        r.status = '${escapedStatus}', 
        r.branch = '${escapedBranch}',
        r.created_at = timestamp('${kuzuTimestamp}'),
        r.updated_at = timestamp('${kuzuTimestamp}')
      ON MATCH SET
        r.name = '${escapedName}',
        r.created = date('${escapedCreated}'),
        r.triggers = ${cypherTriggersList},
        r.content = '${escapedContent}',
        r.status = '${escapedStatus}',
        r.branch = '${escapedBranch}',
        r.updated_at = timestamp('${kuzuTimestamp}')
      MERGE (repo)-[:HAS_RULE]->(r)
      RETURN r`;

    await this.kuzuClient.executeQuery(query);
    return this.findByIdAndBranch(logicalRepositoryName, logicalId, ruleBranch);
  }

  /**
   * Find a rule by its logical ID and branch, within a given repository name.
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Rule | null> {
    const graphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const query = `
      MATCH (r:Rule {graph_unique_id: '${escapedGraphUniqueId}'})
      RETURN r LIMIT 1
    `;
    const result = await this.kuzuClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    const rawRuleData = rows[0].r ?? rows[0]['r'];
    if (!rawRuleData) {
      return null;
    }
    return this.formatRule(rawRuleData);
  }

  /**
   * Get all rules for a repository node and branch.
   */
  async getAllRules(repositoryNodeId: string, ruleBranch: string): Promise<Rule[]> {
    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedRuleBranch = this.escapeStr(ruleBranch);

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})-[:HAS_RULE]->(r:Rule {branch: '${escapedRuleBranch}'})
      RETURN r
      ORDER BY r.created DESC, r.name ASC
    `;
    const result = await this.kuzuClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => this.formatRule(row.r ?? row['r']));
  }
}
