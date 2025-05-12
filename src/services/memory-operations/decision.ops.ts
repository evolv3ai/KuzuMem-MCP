import { DecisionRepository, RepositoryRepository } from '../../repositories';
import { Decision } from '../../types';

/**
 * Input parameters for upserting a decision.
 */
interface UpsertDecisionData {
  id: string;
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
  decisionRepo: DecisionRepository,
): Promise<Decision | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in upsertDecisionOp`);
    return null;
  }

  const dataForRepo: Decision = {
    repository: repository.id,
    branch: branch,
    id: decisionData.id,
    name: decisionData.name,
    date: decisionData.date,
    context: decisionData.context,
    // created_at, updated_at will be handled by repository
  } as Decision;

  return decisionRepo.upsertDecision(dataForRepo);
}

/**
 * Retrieves decisions for a repository and branch within a given date range.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param startDate - The start date of the range (YYYY-MM-DD).
 * @param endDate - The end date of the range (YYYY-MM-DD).
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @returns A Promise resolving to an array of Decision objects.
 */
export async function getDecisionsByDateRangeOp(
  repositoryName: string,
  branch: string,
  startDate: string,
  endDate: string,
  repositoryRepo: RepositoryRepository,
  decisionRepo: DecisionRepository,
): Promise<Decision[]> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in getDecisionsByDateRangeOp`);
    return [];
  }
  // DecisionRepository.getDecisionsByDateRange expects the repositoryNodeId (PK of Repository) and decisionBranch.
  return decisionRepo.getDecisionsByDateRange(repository.id, branch, startDate, endDate);
}
