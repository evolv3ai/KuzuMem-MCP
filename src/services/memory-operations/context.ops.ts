import { ContextRepository, RepositoryRepository } from "../../repositories";
import { Context } from "../../types";

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
  contextRepo: ContextRepository
): Promise<Context[]> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in getLatestContextsOp`
    );
    return [];
  }
  return contextRepo.getLatestContexts(String(repository.id!), branch, limit);
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
  contextRepo: ContextRepository
): Promise<Context | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in getTodayContextOp`
    );
    return null;
  }
  const today = new Date().toISOString().split("T")[0];
  return contextRepo.getTodayContext(String(repository.id!), branch, today);
}

interface UpdateContextOpParams {
  repositoryName: string;
  branch?: string;
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
  contextRepo: ContextRepository
): Promise<Context | null> {
  const {
    repositoryName,
    branch = "main",
    summary,
    agent,
    decision,
    issue,
    observation,
  } = params;

  const repo = await repositoryRepo.findByName(repositoryName, branch);
  if (!repo) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in updateContextOp`
    );
    return null;
  }

  const todayDate = new Date().toISOString().split("T")[0];
  let currentContext = await contextRepo.getTodayContext(
    String(repo.id!),
    branch,
    todayDate
  );

  if (!currentContext) {
    // Create new context for today
    // Temporary 'as any' for array fields until ContextRepository.upsertContext types are confirmed to handle string[]
    return contextRepo.upsertContext({
      repository: String(repo.id!),
      yaml_id: `context-${todayDate}`,
      iso_date: todayDate,
      agent: agent ?? undefined,
      related_issue: (issue ? [issue] : []) as any,
      summary: summary || "",
      decisions: (decision ? [decision] : []) as any,
      observations: (observation ? [observation] : []) as any,
      branch,
    });
  } else {
    // Merge updates with existing context
    // Temporary 'as any' for array fields
    const updatedData = {
      ...currentContext,
      agent: agent ?? currentContext.agent,
      summary: summary ?? currentContext.summary,
      related_issue: (issue
        ? Array.from(new Set([...(currentContext.related_issue || []), issue]))
        : currentContext.related_issue) as any,
      decisions: (decision
        ? Array.from(new Set([...(currentContext.decisions || []), decision]))
        : currentContext.decisions) as any,
      observations: (observation
        ? Array.from(
            new Set([...(currentContext.observations || []), observation])
          )
        : currentContext.observations) as any,
      branch, // Ensure branch is part of the upsert data for ContextRepository if needed
    };
    return contextRepo.upsertContext(updatedData);
  }
}
