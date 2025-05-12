import { ContextRepository, RepositoryRepository } from '../../repositories';
import { Context } from '../../types';

/**
 * Retrieves the latest context entries for a repository and branch.
 *
 * @param repositoryNodeId - The node primary key of the repository.
 * @param branch - The branch of the repository.
 * @param limit - Optional limit for the number of context entries to return.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to an array of Context objects.
 */
export async function getLatestContextsOp(
  repositoryNodeId: string,
  branch: string,
  limit: number | undefined,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context[]> {
  return contextRepo.getLatestContexts(repositoryNodeId, branch, limit);
}

/**
 * Retrieves today's context for a repository and branch.
 * (Note: ContextRepository.getTodayContext needs three arguments: repoId, branch, dateString)
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to the Context object or null if not found.
 */
export async function getTodayContextOp(
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context | null> {
  const today = new Date().toISOString().split('T')[0];
  return contextRepo.getContextByDate(repositoryName, branch, today);
}

// Moved interface definition before its use
interface UpdateContextOpParams {
  repositoryName: string;
  branch?: string;
  id?: string; // Added optional logical id for the context
  name?: string;
  summary?: string;
  agent?: string;
  decision?: string;
  issue?: string;
  observation?: string;
}

/**
 * Updates or creates today's context for a repository and branch.
 *
 * @param params - Parameters for updating context including repositoryName, branch, and context fields.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to the updated or created Context object or null on failure.
 */
export async function updateContextOp(
  params: UpdateContextOpParams, // Now defined above
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context | null> {
  const {
    repositoryName,
    branch = 'main',
    id,
    name,
    summary,
    agent,
    decision,
    issue,
    observation,
  } = params;

  const repo = await repositoryRepo.findByName(repositoryName, branch);
  if (!repo || !repo.id) {
    console.warn(
      `Repository or Repository ID not found: ${repositoryName}:${branch} in updateContextOp. Repo was: ${JSON.stringify(repo)}`,
    );
    return null;
  }

  const todayDateString = new Date().toISOString().split('T')[0];
  const contextLogicalId = id || `context-${todayDateString}`;

  const currentContext = await contextRepo.findByIdAndBranch(
    repositoryName,
    contextLogicalId,
    branch,
  );

  const contextName = name || summary || contextLogicalId;

  if (!currentContext) {
    const contextToCreate: Context = {
      repository: repo.id,
      branch: branch,
      id: contextLogicalId,
      name: contextName,
      iso_date: todayDateString,
      summary: summary || '',
      agent: agent,
      related_issue: issue,
      decisions: decision ? [decision] : [],
      observations: observation ? [observation] : [],
    } as Context;
    return contextRepo.upsertContext(contextToCreate);
  } else {
    const updatedData: Context = {
      ...currentContext,
      name: contextName,
      summary: summary ?? currentContext.summary,
      agent: agent ?? currentContext.agent,
      related_issue: issue ?? currentContext.related_issue,
      decisions: decision
        ? Array.from(new Set([...(currentContext.decisions || []), decision]))
        : currentContext.decisions,
      observations: observation
        ? Array.from(new Set([...(currentContext.observations || []), observation]))
        : currentContext.observations,
      repository: currentContext.repository,
      branch: currentContext.branch,
      id: currentContext.id,
      iso_date: currentContext.iso_date,
    };
    return contextRepo.upsertContext(updatedData);
  }
}
