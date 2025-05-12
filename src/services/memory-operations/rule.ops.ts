import { RuleRepository, RepositoryRepository } from '../../repositories';
import { Rule } from '../../types';

/**
 * Input parameters for upserting a rule.
 * Corresponds to Omit<Rule, 'repository' | 'branch'> & { id: string } used in MemoryService.
 */
interface UpsertRuleData {
  id: string; // Renamed from yaml_id
  name: string;
  created: string; // Expecting YYYY-MM-DD string format
  content?: string;
  status?: 'active' | 'deprecated';
  triggers?: string[];
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
  branch: string, // This is the branch for the Rule entity
  ruleData: UpsertRuleData,
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<Rule | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    // Check repository.id
    console.warn(`Repository not found: ${repositoryName}/${branch} in upsertRuleOp`);
    return null;
  }

  const dataForRepo: Rule = {
    ...(ruleData as Omit<Rule, 'repository' | 'branch' | 'created_at' | 'updated_at'>), // Spread ruleData, ensuring types match
    id: ruleData.id, // Explicitly ensure logical id is from ruleData
    repository: repository.id, // Repository Node PK
    branch: branch, // Branch for this Rule entity
    status: ruleData.status || 'active',
    // created_at, updated_at will be handled by repository
    // Other fields like name, created, content, triggers are from ruleData
  } as Rule; // Cast to satisfy Rule type

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
  branch: string, // This is the branch for the Rule entities
  repositoryRepo: RepositoryRepository,
  ruleRepo: RuleRepository,
): Promise<Rule[]> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    // Check repository.id
    console.warn(`Repository not found: ${repositoryName}/${branch} in getActiveRulesOp`);
    return [];
  }
  // RuleRepository.getActiveRules expects repositoryNodeId (PK of Repository) and ruleBranch.
  return ruleRepo.getActiveRules(repository.id, branch);
}
