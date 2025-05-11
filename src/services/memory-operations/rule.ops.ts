import { RuleRepository, RepositoryRepository } from '../../repositories';
import { Rule } from '../../types';

/**
 * Input parameters for upserting a rule.
 * Corresponds to Omit<Rule, 'repository_id'> used in MemoryService,
 * plus ensuring branch is handled correctly if part of Rule type for repo layer.
 */
interface UpsertRuleData {
  yaml_id: string;
  name: string;
  created: string; // Expecting YYYY-MM-DD string format
  content?: string;
  status?: 'active' | 'deprecated';
  triggers?: string[];
  // branch?: string; // If branch is part of Rule type passed to repo
}

/**
 * Creates or updates a rule in a repository.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param ruleData - Data for the rule to be upserted (should not contain repository_id).
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @returns A Promise resolving to the upserted Rule object or null if repository not found.
 */
export async function upsertRuleOp(
  repositoryName: string,
  branch: string,
  ruleData: UpsertRuleData, // Effectively Omit<Rule, 'repository' | 'branch'> if repo needs separate branch
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<Rule | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in upsertRuleOp`);
    return null;
  }

  // Data as expected by ruleRepo.upsertRule, which takes an object including
  // 'repository' (the ID) and 'branch', plus other rule fields.
  const dataForRepo: Rule = {
    ...ruleData,
    repository: String(repository.id!),
    branch: branch,
    status: ruleData.status || 'active', // Default status if not provided
    // Ensure all required fields from Rule type are present
  };

  return ruleRepo.upsertRule(dataForRepo);
}

/**
 * Retrieves active rules for a repository and branch.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @returns A Promise resolving to an array of active Rule objects.
 */
export async function getActiveRulesOp(
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<Rule[]> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in getActiveRulesOp`);
    return [];
  }
  // RuleRepository.getActiveRules expects repositoryId (synthetic) and branch.
  return ruleRepo.getActiveRules(String(repository.id!), branch);
}
