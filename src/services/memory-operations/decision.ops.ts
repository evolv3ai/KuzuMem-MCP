import { KuzuDBClient } from '../../db/kuzu';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { DecisionRepository, RepositoryRepository } from '../../repositories';
import { Decision, DecisionInput } from '../../types';

/**
 * Creates or updates a decision in a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param decisionData - Data for the decision to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @returns A Promise resolving to the upserted Decision object or null if repository not found.
 */
export async function upsertDecisionOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  decisionData: DecisionInput,
  repositoryRepo: RepositoryRepository,
  decisionRepo: DecisionRepository,
): Promise<Decision | null> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[decision.ops.upsertDecisionOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return null;
  }

  const decisionToUpsert: Decision = {
    id: decisionData.id,
    repository: repository.id,
    branch: branch,
    name: decisionData.name,
    date: decisionData.date,
    context: decisionData.context || null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  logger.debug(
    `[decision.ops.upsertDecisionOp] Calling decisionRepo.upsertDecision for ${decisionToUpsert.id} in repo ${repository.id}`,
    { decisionToUpsert },
  );

  const upsertedDecision = await decisionRepo.upsertDecision(decisionToUpsert);

  if (!upsertedDecision) {
    logger.warn(
      `[decision.ops.upsertDecisionOp] decisionRepo.upsertDecision returned null for ${decisionData.id} in ${repositoryName}:${branch}`,
    );
    return null;
  }

  logger.info(
    `[decision.ops.upsertDecisionOp] Decision ${upsertedDecision.id} upserted successfully in ${repositoryName}:${branch}.`,
  );

  return normalizeDecision(upsertedDecision, repositoryName, branch);
}

/**
 * Retrieves all decisions for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @returns A Promise resolving to an array of active Decision objects.
 */
export async function getActiveDecisionsOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  decisionRepo: DecisionRepository,
): Promise<Decision[]> {
  const logger = mcpContext.logger;

  logger.debug(`[decision.ops.getActiveDecisionsOp] For ${repositoryName}:${branch}`);
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[decision.ops.getActiveDecisionsOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return [];
  }

  const allDecisions = await decisionRepo.getAllDecisions(repository.id, branch);
  logger.debug(
    `[decision.ops.getActiveDecisionsOp] Found ${allDecisions.length} decisions for ${repositoryName}:${branch}.`,
  );

  return allDecisions.map((dec: Decision) => normalizeDecision(dec, repositoryName, branch));
}

/**
 * Helper function to ensure decision has repository and branch fields populated
 */
function normalizeDecision(decision: Decision, repositoryName: string, branch: string): Decision {
  return {
    ...decision,
    repository: repositoryName,
    branch: branch,
  };
}

export async function deleteDecisionOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  repositoryRepo: RepositoryRepository,
  repositoryName: string,
  branch: string,
  decisionId: string,
): Promise<boolean> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[decision.ops.deleteDecisionOp] Repository ${repositoryName}:${branch} not found.`,
    );
    return false;
  }

  const graphUniqueId = `${repositoryName}:${branch}:${decisionId}`;
  const deleteQuery = `
    MATCH (d:Decision {graph_unique_id: $graphUniqueId})
    DETACH DELETE d
    RETURN 1 as deletedCount
  `;

  const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
  const deletedCount = result[0]?.deletedCount || 0;

  logger.info(
    `[decision.ops.deleteDecisionOp] Deleted ${deletedCount} decision(s) with ID ${decisionId}`,
  );
  return deletedCount > 0;
}
