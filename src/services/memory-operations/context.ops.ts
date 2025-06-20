import { KuzuDBClient } from '../../db/kuzu';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { ContextRepository, RepositoryRepository } from '../../repositories';
import { Context, ContextInput } from '../../types';

/**
 * Fetches the latest contexts for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param limit - The maximum number of contexts to retrieve.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to an array of Context objects.
 */
export async function getLatestContextsOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  limit: number,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context[]> {
  const logger = mcpContext.logger;
  logger.debug(
    `[context.ops.getLatestContextsOp] For ${repositoryName}:${branch} with limit ${limit}`,
  );

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[context.ops.getLatestContextsOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return [];
  }

  const contexts = await contextRepo.getLatestContexts(mcpContext, repository.id, branch, limit);
  logger.debug(
    `[context.ops.getLatestContextsOp] Found ${contexts.length} contexts for ${repositoryName}:${branch}.`,
  );
  return contexts;
}

/**
 * Creates a new context for a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param contextData - Data for the context to be created.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to the created Context object or null if repository not found.
 */
export async function createContextOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  contextData: ContextInput,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context | null> {
  const logger = mcpContext.logger;
  logger.debug(`[context.ops.createContextOp] For ${repositoryName}:${branch}`, {
    contextData,
  });

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(`[context.ops.createContextOp] Repository not found: ${repositoryName}/${branch}`);
    return null;
  }

  const contextId = `context-${new Date().toISOString().split('T')[0]}`;
  const contextToCreate: Context = {
    id: contextId,
    repository: repository.id,
    branch: branch,
    name: contextData.summary || contextId,
    iso_date: new Date().toISOString().split('T')[0],
    agent: contextData.agent,
    summary: contextData.summary,
    observation: contextData.observation,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const createdContext = await contextRepo.upsertContext(mcpContext, contextToCreate);

  if (!createdContext) {
    logger.warn(`[context.ops.createContextOp] contextRepo.upsertContext returned null.`);
    return null;
  }
  logger.info(
    `[context.ops.createContextOp] Context ${createdContext.id} created successfully in ${repositoryName}:${branch}.`,
  );
  return createdContext;
}

/**
 * Updates a context for a repository based on provided data.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param contextData - Data for updating the context.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to the created/updated Context object or null if repository not found.
 */
export async function updateContextOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  contextData: ContextInput,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<Context | null> {
  const logger = mcpContext.logger;
  logger.debug(`[context.ops.updateContextOp] For ${repositoryName}:${branch}`, {
    contextData,
  });

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(`[context.ops.updateContextOp] Repository not found: ${repositoryName}/${branch}`);
    return null;
  }

  const agent = contextData.agent;
  const summary = contextData.summary;
  const observation = contextData.observation;

  if (!agent || !summary) {
    logger.error(
      `[context.ops.updateContextOp] Missing required fields: agent="${agent}", summary="${summary}"`,
    );
    return null;
  }

  // Create new context instead of updating existing one
  // This preserves history in the graph database
  const contextId = `context-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
  const contextToCreate: Context = {
    id: contextId,
    repository: repository.id,
    branch: branch,
    name: summary || contextId,
    iso_date: new Date().toISOString().split('T')[0],
    agent: agent,
    summary: summary,
    observation: observation,
    observations: observation ? [observation] : [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const createdContext = await contextRepo.upsertContext(mcpContext, contextToCreate);

  if (!createdContext) {
    logger.error(
      `[context.ops.updateContextOp] Failed to create new context for ${repositoryName}:${branch}`,
    );
    return null;
  }

  logger.info(
    `[context.ops.updateContextOp] Context ${createdContext.id} created as update for ${repositoryName}:${branch}.`,
  );
  return createdContext;
}

/**
 * Helper function to ensure context has repository and branch fields populated
 */
function normalizeContext(context: Context, repositoryName: string, branch: string): Context {
  return {
    ...context,
    repository: repositoryName,
    branch: branch,
  };
}

export async function deleteContextOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  repositoryRepo: RepositoryRepository,
  repositoryName: string,
  branch: string,
  contextId: string,
): Promise<boolean> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(`[context.ops.deleteContextOp] Repository ${repositoryName}:${branch} not found.`);
    return false;
  }

  const graphUniqueId = `${repositoryName}:${branch}:${contextId}`;
  const deleteQuery = `
    MATCH (c:Context {graph_unique_id: $graphUniqueId})
    DETACH DELETE c
    RETURN 1 as deletedCount
  `;

  const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
  const deletedCount = result[0]?.deletedCount || 0;

  logger.info(
    `[context.ops.deleteContextOp] Deleted ${deletedCount} context(s) with ID ${contextId}`,
  );
  return deletedCount > 0;
}
