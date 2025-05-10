import { DecisionRepository, RepositoryRepository } from "../../repositories";
import { Decision } from "../../types";

/**
 * Input parameters for upserting a decision.
 */
interface UpsertDecisionData {
  yaml_id: string;
  name: string;
  date: string; // Expecting YYYY-MM-DD string format
  context?: string; // Optional context description
  // Add other fields from Decision type as necessary, excluding repository_id and branch if handled separately
}

/**
 * Creates or updates a decision in a repository.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param decisionData - Data for the decision to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @returns A Promise resolving to the upserted Decision object or null if repository not found.
 */
export async function upsertDecisionOp(
  repositoryName: string,
  branch: string,
  decisionData: UpsertDecisionData,
  repositoryRepo: RepositoryRepository,
  decisionRepo: DecisionRepository
): Promise<Decision | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in upsertDecisionOp`
    );
    return null;
  }

  const dataForRepo: Decision = {
    repository: String(repository.id!),
    branch: branch, // Use the function's branch parameter
    yaml_id: decisionData.yaml_id,
    name: decisionData.name,
    date: decisionData.date,
    context: decisionData.context,
    // Ensure all required fields for DecisionRepository.upsertDecision are present
  };

  return decisionRepo.upsertDecision(dataForRepo);
}
