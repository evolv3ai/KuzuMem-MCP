import { Rule } from '../types';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId } from '../utils/id.utils';
import { RepositoryRepository } from './repository.repository';

/**
 * Repository for Rule, using KuzuDB and Cypher queries.
 * Each instance is now tied to a specific KuzuDBClient.
 */
export class RuleRepository {
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository;

  /**
   * Constructor requires an initialized KuzuDBClient instance.
   * @param kuzuClient An initialized KuzuDBClient.
   */
  public constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    if (!kuzuClient) {
      throw new Error('RuleRepository requires an initialized KuzuDBClient instance.');
    }
    if (!repositoryRepo) {
      throw new Error('RuleRepository requires an initialized RepositoryRepository instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  private formatKuzuRowToRule(kuzuRowData: any, repositoryName: string, branch: string): Rule {
    const rawRule = kuzuRowData.properties || kuzuRowData;
    const logicalId = rawRule.id?.toString();
    const graphUniqueId =
      rawRule.graph_unique_id?.toString() || formatGraphUniqueId(repositoryName, branch, logicalId);

    let createdDate = rawRule.created;
    if (rawRule.created instanceof Date) {
      createdDate = rawRule.created.toISOString().split('T')[0];
    } else if (typeof rawRule.created === 'number') {
      createdDate = new Date(rawRule.created).toISOString().split('T')[0];
    } else if (
      typeof rawRule.created === 'object' &&
      rawRule.created !== null &&
      'year' in rawRule.created
    ) {
      createdDate = `${String(rawRule.created.year).padStart(4, '0')}-${String(rawRule.created.month).padStart(2, '0')}-${String(rawRule.created.day).padStart(2, '0')}`;
    }

    return {
      id: logicalId,
      graph_unique_id: graphUniqueId,
      name: rawRule.name,
      created: createdDate,
      triggers: Array.isArray(rawRule.triggers) ? rawRule.triggers.map(String) : [],
      content: rawRule.content,
      status: rawRule.status,
      branch: rawRule.branch,
      repository: `${repositoryName}:${branch}`,
      created_at: rawRule.created_at ? new Date(rawRule.created_at) : new Date(),
      updated_at: rawRule.updated_at ? new Date(rawRule.updated_at) : new Date(),
    } as Rule;
  }

  /**
   * Get all active rules for a repository node and branch.
   */
  async getActiveRules(repositoryNodeId: string, ruleBranch: string): Promise<Rule[]> {
    const query = `
      MATCH (repo:Repository {id: $repositoryNodeId})-[:HAS_RULE]->(r:Rule)
      WHERE r.status = $status AND r.branch = $ruleBranch 
      RETURN r ORDER BY r.created DESC
    `;
    const params = { repositoryNodeId, status: 'active', ruleBranch };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToRule(row.r, repoNameFromNodeId, ruleBranch),
      );
    } catch (error) {
      console.error(
        `[RuleRepository] Error in getActiveRules for ${repositoryNodeId}, branch ${ruleBranch}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Creates or updates a rule.
   * `rule.repository` is the Repository node PK (e.g., 'my-repo:main').
   * `rule.branch` is the branch of this Rule entity.
   * `rule.id` is the logical ID of this Rule entity.
   */
  async upsertRule(rule: Rule): Promise<Rule | null> {
    const logger = console; // Placeholder logger
    const {
      repository: repositoryNodeId,
      branch,
      id: logicalId,
      name,
      created,
      content,
      status,
      triggers,
    } = rule;
    const statusFromInput = (rule as any).status; // Assuming internal Rule type will be updated for status

    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 1) {
      logger.error(`[RuleRepository] Invalid repositoryNodeId format: ${repositoryNodeId}`);
      throw new Error(`Invalid repositoryNodeId format for upsertRule: ${repositoryNodeId}`);
    }
    const logicalRepositoryName = repoIdParts[0];
    const effectiveBranch = repoIdParts.length > 1 ? repoIdParts[1] : branch;

    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, effectiveBranch, logicalId);
    const now = new Date();

    // Validate 'created' date format (YYYY-MM-DD string) from input 'rule.created'
    let kuzuCreatedDateString = rule.created; // Directly use the string from Rule type
    if (
      typeof kuzuCreatedDateString !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(kuzuCreatedDateString)
    ) {
      logger.warn(
        `[RuleRepository] Invalid or non-string 'created' date for rule ${logicalId}: '${kuzuCreatedDateString}'. Defaulting to current date. Expected YYYY-MM-DD string.`,
      );
      kuzuCreatedDateString = new Date().toISOString().split('T')[0];
    }

    const propsOnCreate = {
      id: logicalId,
      graph_unique_id: graphUniqueId,
      name: name,
      created: kuzuCreatedDateString,
      triggers: Array.isArray(triggers) ? triggers.map(String) : triggers ? [String(triggers)] : [],
      content: content || null,
      status: statusFromInput || 'active',
      branch: effectiveBranch,
      created_at: now,
      updated_at: now,
    };

    const propsOnMatch = {
      name: name,
      created: kuzuCreatedDateString,
      triggers: Array.isArray(triggers) ? triggers.map(String) : triggers ? [String(triggers)] : [],
      content: content || null,
      status: statusFromInput || 'active',
      updated_at: now,
    };

    const query = `
      MATCH (repo:Repository {id: $repositoryNodeIdParam})
      MERGE (r:Rule {graph_unique_id: $graphUniqueIdParam})
      ON CREATE SET 
        r.id = $idParam,
        r.name = $nameParam,
        r.created = date($createdDateParam),
        r.triggers = $triggersParam,
        r.content = $contentParam,
        r.status = $statusParam,
        r.branch = $branchParam,
        r.created_at = $createdAtParam,
        r.updated_at = $updatedAtParam
      ON MATCH SET 
        r.name = $nameParam, 
        r.created = date($createdDateParam), 
        r.triggers = $triggersParam, 
        r.content = $contentParam, 
        r.status = $statusParam, 
        r.updated_at = $updatedAtParam 
      MERGE (repo)-[:HAS_RULE]->(r)
      RETURN r
    `;

    const queryParams = {
      repositoryNodeIdParam: repositoryNodeId,
      graphUniqueIdParam: graphUniqueId,
      idParam: propsOnCreate.id,
      nameParam: propsOnCreate.name,
      createdDateParam: propsOnCreate.created,
      triggersParam: propsOnCreate.triggers,
      contentParam: propsOnCreate.content,
      statusParam: propsOnCreate.status,
      branchParam: propsOnCreate.branch,
      createdAtParam: propsOnCreate.created_at,
      updatedAtParam: now, // Use current time for both create and update
    };

    try {
      logger.debug(
        `[RuleRepository] Upserting Rule GID ${graphUniqueId} for repo ${repositoryNodeId}`,
      );
      const result = await this.kuzuClient.executeQuery(query, queryParams);
      if (result && result.length > 0 && result[0].r) {
        logger.info(
          `[RuleRepository] Rule ${logicalId} upserted successfully for ${repositoryNodeId}`,
        );
        return this.formatKuzuRowToRule(result[0].r, logicalRepositoryName, effectiveBranch);
      }
      logger.warn(`[RuleRepository] UpsertRule did not return a node for GID ${graphUniqueId}`);
      return null;
    } catch (error: any) {
      logger.error(
        `[RuleRepository] Error in upsertRule for GID ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      throw error;
    }
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
    const query = `MATCH (r:Rule {graph_unique_id: $graphUniqueId}) RETURN r LIMIT 1`;
    const params = { graphUniqueId };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0 && result[0].r) {
        return this.formatKuzuRowToRule(result[0].r, repositoryName, itemBranch);
      }
      return null;
    } catch (error) {
      console.error(`[RuleRepository] Error in findByIdAndBranch for GID ${graphUniqueId}:`, error);
      return null;
    }
  }

  /**
   * Get all rules for a repository node and branch.
   */
  async getAllRules(repositoryNodeId: string, ruleBranch: string): Promise<Rule[]> {
    const query = `
      MATCH (repo:Repository {id: $repositoryNodeId})-[:HAS_RULE]->(r:Rule)
      WHERE r.branch = $ruleBranch
      RETURN r ORDER BY r.created DESC, r.name ASC
    `;
    const params = { repositoryNodeId, ruleBranch };
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (!result) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToRule(row.r, repoNameFromNodeId, ruleBranch),
      );
    } catch (error) {
      console.error(
        `[RuleRepository] Error in getAllRules for ${repositoryNodeId}, branch ${ruleBranch}:`,
        error,
      );
      return [];
    }
  }
}