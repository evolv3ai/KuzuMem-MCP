import { RuleRepository, RepositoryRepository } from '../../repositories';
import { Rule, RuleInput } from '../../types';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';

// Simple context type to avoid SDK import issues
type McpContext = {
  logger: any;
};

// Helper function to parse timestamps from BaseEntity (Date | undefined) to string | null
// This can be shared or made a utility if used in multiple ops files.
function parseBaseEntityTimestamp(timestamp: Date | undefined): string | null {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return null;
}

/**
 * Creates or updates a rule in a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param ruleData - Data for the rule to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @returns A Promise resolving to the upserted Rule object or null if repository not found.
 */
export async function upsertRuleOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  ruleData: RuleInput,
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<Rule | null> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(`[rule.ops.upsertRuleOp] Repository not found: ${repositoryName}/${branch}`);
    return null;
  }

  const ruleToUpsert: Rule = {
    id: ruleData.id,
    repository: repository.id,
    branch: branch,
    name: ruleData.name,
    created: ruleData.created,
    triggers: ruleData.triggers || null,
    content: ruleData.content || null,
    status: ruleData.status || 'active',
    created_at: new Date(),
    updated_at: new Date(),
  };

  logger.debug(
    `[rule.ops.upsertRuleOp] Calling ruleRepo.upsertRule for ${ruleToUpsert.id} in repo ${repository.id}`,
    { ruleToUpsert },
  );

  const upsertedRule = await ruleRepo.upsertRule(ruleToUpsert);

  if (!upsertedRule) {
    logger.warn(
      `[rule.ops.upsertRuleOp] ruleRepo.upsertRule returned null for ${ruleData.id} in ${repositoryName}:${branch}`,
    );
    return null;
  }

  logger.info(
    `[rule.ops.upsertRuleOp] Rule ${upsertedRule.id} upserted successfully in ${repositoryName}:${branch}.`,
  );

  return normalizeRule(upsertedRule, repositoryName, branch);
}

/**
 * Retrieves all active rules for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @returns A Promise resolving to an array of active Rule objects.
 */
export async function getActiveRulesOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<Rule[]> {
  const logger = mcpContext.logger;

  logger.debug(`[rule.ops.getActiveRulesOp] For ${repositoryName}:${branch}`);
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(`[rule.ops.getActiveRulesOp] Repository not found: ${repositoryName}/${branch}`);
    return [];
  }

  const activeRules = await ruleRepo.getActiveRules(repository.id, branch);
  logger.debug(
    `[rule.ops.getActiveRulesOp] Found ${activeRules.length} active rules for ${repositoryName}:${branch}.`,
  );

  return activeRules.map((rule: Rule) => normalizeRule(rule, repositoryName, branch));
}

/**
 * Helper function to ensure rule has repository and branch fields populated
 */
function normalizeRule(rule: Rule, repositoryName: string, branch: string): Rule {
  return {
    ...rule,
    repository: repositoryName,
    branch: branch,
  };
}
