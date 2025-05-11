import { ContextRepository, RepositoryRepository } from '../../repositories';
import { Context } from '../../types';

/**
 * Retrieves the latest context entries for a repository and branch.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param limit - Optional limit for the number of context entries to return.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to an array of Context objects.
 */
export async function getLatestContextsOp(
  repositoryName: string,
  branch: string,
  limit: number | undefined,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context[]> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in getLatestContextsOp`);
    return [];
  }
  return contextRepo.getLatestContexts(String(repository.id!), limit);
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
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in getTodayContextOp`);
    return null;
  }
  const today = new Date().toISOString().split('T')[0];
  return contextRepo.getTodayContext(String(repository.id!), today);
}

interface UpdateContextOpParams {
  repositoryName: string;
  branch?: string;
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
  params: UpdateContextOpParams,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context | null> {
  const {
    repositoryName,
    branch = 'main',
    name,
    summary,
    agent,
    decision,
    issue,
    observation,
  } = params;

  const repo = await repositoryRepo.findByName(repositoryName, branch);
  console.error(
    `DEBUG: context.ops.ts - After findByName - repositoryName: ${repositoryName}, branch: ${branch}, repo: ${JSON.stringify(repo)}, repo.id: ${repo ? repo.id : 'repo_is_null'}`,
  );

  if (!repo || !repo.id) {
    console.warn(
      `Repository or Repository ID not found: ${repositoryName}:${branch} in updateContextOp. Repo was: ${JSON.stringify(repo)}`,
    );
    return null;
  }

  const todayDateString = new Date().toISOString().split('T')[0];
  const currentContext = await contextRepo.getTodayContext(String(repo.id), todayDateString);

  const contextName = name || params.summary || `Context-${todayDateString}`;

  if (!currentContext) {
    const finalIsoDateForCreate = new Date().toISOString().split('T')[0];
    console.error(
      `DEBUG: context.ops.ts: finalIsoDateForCreate for new context = >>>${finalIsoDateForCreate}<<<`,
    );
    const repoIdForCreate = String(repo.id); // Explicitly get it here
    console.error(
      `DEBUG: context.ops.ts - CREATE path - repo.id for upsert: >>>${repoIdForCreate}<<<, typeof repo.id: ${typeof repo.id}`,
    );
    return contextRepo.upsertContext({
      repository: repoIdForCreate,
      branch: branch,
      yaml_id: `context-${finalIsoDateForCreate}`,
      name: contextName,
      iso_date: finalIsoDateForCreate,
      summary: summary || '',
      agent: agent,
      related_issue: issue,
      decisions: decision ? [decision] : [],
      observations: observation ? [observation] : [],
    } as Context);
  } else {
    console.error(
      `DEBUG: context.ops.ts: iso_date from existing context = >>>${currentContext.iso_date}<<<`,
    );
    const repoIdForUpdate = String(repo.id); // Explicitly get it here
    console.error(
      `DEBUG: context.ops.ts - UPDATE path - repo.id for upsert: >>>${repoIdForUpdate}<<<, typeof repo.id: ${typeof repo.id}`,
    );
    const updatedData: Context = {
      ...currentContext,
      repository: repoIdForUpdate,
      branch: branch,
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
    };
    return contextRepo.upsertContext(updatedData);
  }
}
