import { RuleRepository, RepositoryRepository } from '../../repositories';
import { Rule } from '../../types';
import { z } from 'zod';
import { AddRuleInputSchema, RuleSchema } from '../../mcp/schemas/tool-schemas';

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
 * @param ruleDataFromTool - Data for the rule to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @returns A Promise resolving to the upserted Rule object or null if repository not found.
 */
export async function upsertRuleOp(
  mcpContext: McpContext,
  repositoryName: string,
  branch: string,
  ruleDataFromTool: Omit<z.infer<typeof AddRuleInputSchema>, 'repository' | 'branch'>,
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<z.infer<typeof RuleSchema> | null> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.debug(`[rule.ops.upsertRuleOp] Called for ${repoIdForLog}`, { ruleDataFromTool });

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(`[rule.ops.upsertRuleOp] Repository not found: ${repoIdForLog}`);
      return null;
    }

    // Ensure status from Zod schema (which might be optional or have a default)
    // aligns with the strict 'active' | 'deprecated' of the internal Rule type.
    // AddRuleInputSchema should ideally use RuleStatusSchema for its status field.
    const statusForRepo: 'active' | 'deprecated' =
      ruleDataFromTool.status === 'active' || ruleDataFromTool.status === 'deprecated'
        ? ruleDataFromTool.status
        : 'active'; // Default to active if not provided or invalid

    const dataForRepo: Rule = {
      repository: repository.id,
      branch: branch,
      id: ruleDataFromTool.id,
      name: ruleDataFromTool.name,
      created: ruleDataFromTool.created, // string YYYY-MM-DD from Zod
      content: ruleDataFromTool.content,
      status: statusForRepo,
      triggers: ruleDataFromTool.triggers,
    } as Rule; // Cast as Rule, though properties should align

    const upsertedRule = await ruleRepo.upsertRule(dataForRepo); // Assuming no mcpContext needed based on previous findings
    if (!upsertedRule) {
      logger.warn(
        `[rule.ops.upsertRuleOp] ruleRepo.upsertRule returned null for ${dataForRepo.id} in ${repoIdForLog}`,
      );
      return null;
    }
    logger.info(`[rule.ops.upsertRuleOp] Rule upserted: ${upsertedRule.id} for ${repoIdForLog}`);
    return transformToZodRule(upsertedRule, repositoryName, branch, logger);
  } catch (error: any) {
    logger.error(`[rule.ops.upsertRuleOp] Error for ${repoIdForLog}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
      ruleDataFromTool,
    });
    throw error; // Re-throw for service layer to handle
  }
}

/**
 * Retrieves active rules for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @returns A Promise resolving to an array of active Rule objects.
 */
export async function getActiveRulesOp(
  mcpContext: McpContext,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<z.infer<typeof RuleSchema>[]> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.debug(`[rule.ops.getActiveRulesOp] Called for ${repoIdForLog}`);

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch); // Assuming no mcpContext
    if (!repository || !repository.id) {
      logger.warn(`[rule.ops.getActiveRulesOp] Repository not found: ${repoIdForLog}`);
      return [];
    }

    const rules = await ruleRepo.getActiveRules(repository.id, branch); // Assuming no mcpContext
    logger.info(
      `[rule.ops.getActiveRulesOp] Retrieved ${rules.length} active rules for ${repoIdForLog}`,
    );
    return rules.map((r) => transformToZodRule(r, repositoryName, branch, logger));
  } catch (error: any) {
    logger.error(`[rule.ops.getActiveRulesOp] Error for ${repoIdForLog}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    throw error; // Re-throw for service layer to handle
  }
}

// Helper function to transform internal Rule to Zod RuleSchema
function transformToZodRule(
  rule: Rule,
  repositoryName: string,
  branch: string,
  logger: any,
): z.infer<typeof RuleSchema> {
  if (!rule) {
    // Changed to throw error for consistency
    logger.error(
      '[rule.ops.transformToZodRule] Received null or undefined rule. This indicates an issue upstream.',
    );
    throw new Error('transformToZodRule received null or undefined rule.');
  }

  let createdDateString = rule.created;
  // Robust date string validation and correction, similar to other ops files
  if (typeof rule.created === 'string') {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(rule.created)) {
      logger.warn(
        `[rule.ops.transformToZodRule] Rule created date ('${rule.created}') is not YYYY-MM-DD. Attempting parse.`,
        { ruleId: rule.id, repository: `${repositoryName}:${branch}` },
      );
      try {
        const parsedDate = new Date(rule.created);
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Invalid date string for new Date()');
        }
        createdDateString = parsedDate.toISOString().split('T')[0];
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(createdDateString)) {
          throw new Error('Parsed date not YYYY-MM-DD');
        }
      } catch (e: any) {
        logger.error(
          `[rule.ops.transformToZodRule] Could not parse rule created date ('${rule.created}') to YYYY-MM-DD. Error: ${e.message}. Using fallback.`,
          { ruleId: rule.id, repository: `${repositoryName}:${branch}` },
        );
        createdDateString = '1970-01-01'; // Fallback date
      }
    }
    // else: date string is already in YYYY-MM-DD format, no action needed
  } else {
    logger.warn(
      `[rule.ops.transformToZodRule] Rule created date is not a string (type: ${typeof rule.created}). Using fallback.`,
      { ruleId: rule.id, value: rule.created, repository: `${repositoryName}:${branch}` },
    );
    createdDateString = '1970-01-01'; // Fallback date
  }

  return {
    id: rule.id,
    name: rule.name,
    created: createdDateString,
    content: rule.content || null,
    status: rule.status || null,
    triggers: rule.triggers || null,
    repository: `${repositoryName}:${branch}`,
    branch: branch,
    created_at: parseBaseEntityTimestamp(rule.created_at),
    updated_at: parseBaseEntityTimestamp(rule.updated_at),
  };
}
