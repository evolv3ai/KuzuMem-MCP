import { DecisionRepository, RepositoryRepository } from '../../repositories';
import { Decision, DecisionStatus } from '../../types';
import { z } from 'zod';
import { AddDecisionInputSchema, DecisionSchema } from '../../mcp/schemas/tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';

// Helper function to parse timestamps from BaseEntity (Date | undefined) to string | null
// This can be shared or made a utility if used in multiple ops files.
function parseBaseEntityTimestamp(timestamp: Date | undefined): string | null {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return null;
}

/**
 * Creates or updates a decision in a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param decisionDataFromTool - Data for the decision to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @returns A Promise resolving to the upserted Decision object or null if repository not found or on error.
 */
export async function upsertDecisionOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  decisionDataFromTool: z.infer<typeof AddDecisionInputSchema>,
  repositoryRepo: RepositoryRepository,
  decisionRepo: DecisionRepository,
): Promise<z.infer<typeof DecisionSchema> | null> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.debug(`[decision.ops.upsertDecisionOp] Called for ${repoIdForLog}`, {
    decisionDataFromTool,
  });

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(`[decision.ops.upsertDecisionOp] Repository not found: ${repoIdForLog}`);
      return null;
    }

    const dataForRepo: Decision = {
      repository: repository.id,
      branch: branch,
      id: decisionDataFromTool.id,
      name: decisionDataFromTool.name,
      date: decisionDataFromTool.date, // Assuming AddDecisionInputSchema.date is already YYYY-MM-DD string
      context: decisionDataFromTool.context,
      status: decisionDataFromTool.status as DecisionStatus | undefined, // Zod enum handles validation
    };

    const upsertedDecision = await decisionRepo.upsertDecision(dataForRepo);
    if (!upsertedDecision) {
      logger.warn(
        `[decision.ops.upsertDecisionOp] decisionRepo.upsertDecision returned null for ${dataForRepo.id} in ${repoIdForLog}`,
      );
      return null;
    }
    logger.info(
      `[decision.ops.upsertDecisionOp] Decision upserted: ${upsertedDecision.id} for ${repoIdForLog}`,
    );
    return transformToZodDecision(upsertedDecision, repositoryName, branch, logger);
  } catch (error: any) {
    logger.error(`[decision.ops.upsertDecisionOp] Error for ${repoIdForLog}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
      decisionDataFromTool,
    });
    // Re-throw or return null based on desired error handling strategy for the service layer
    // For now, let's re-throw to make it visible. Could also return null.
    throw error;
  }
}

/**
 * Retrieves decisions for a repository and branch within a given date range.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param startDate - The start date of the range (YYYY-MM-DD).
 * @param endDate - The end date of the range (YYYY-MM-DD).
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @returns A Promise resolving to an array of Decision objects.
 */
export async function getDecisionsByDateRangeOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  startDate: string,
  endDate: string,
  repositoryRepo: RepositoryRepository,
  decisionRepo: DecisionRepository,
): Promise<z.infer<typeof DecisionSchema>[]> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.debug(`[decision.ops.getDecisionsByDateRangeOp] Called for ${repoIdForLog}`, {
    startDate,
    endDate,
  });

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(`[decision.ops.getDecisionsByDateRangeOp] Repository not found: ${repoIdForLog}`);
      return [];
    }

    const decisions = await decisionRepo.getDecisionsByDateRange(
      repository.id,
      branch,
      startDate,
      endDate,
    );
    logger.info(
      `[decision.ops.getDecisionsByDateRangeOp] Retrieved ${decisions.length} decisions for ${repoIdForLog}`,
    );
    return decisions.map((dec) => transformToZodDecision(dec, repositoryName, branch, logger));
  } catch (error: any) {
    logger.error(
      `[decision.ops.getDecisionsByDateRangeOp] Error for ${repoIdForLog}: ${error.message}`,
      {
        error: error.toString(),
        stack: error.stack,
        startDate,
        endDate,
      },
    );
    // Re-throw or return empty array based on desired error handling strategy
    // For now, let's re-throw. Could also return [].
    throw error;
  }
}

// Helper function to transform internal Decision to Zod DecisionSchema
function transformToZodDecision(
  decision: Decision,
  repositoryName: string,
  branch: string,
  logger: EnrichedRequestHandlerExtra['logger'],
): z.infer<typeof DecisionSchema> {
  if (!decision) {
    logger.error(
      '[decision.ops.transformToZodDecision] Received null or undefined decision. This indicates an issue upstream.',
    );
    // Consistent with other transform functions, throwing an error is better
    // as returning an empty object might hide issues.
    throw new Error('transformToZodDecision received null or undefined decision.');
  }

  let decisionDateString: string;
  const { date } = decision; // Destructure to help with type inference/checking

  // The Decision interface defines 'date' as string.
  // We need to ensure it's a YYYY-MM-DD string for the Zod schema.
  if (typeof date === 'string') {
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
      decisionDateString = date; // Already in correct format
    } else {
      // It's a string, but not YYYY-MM-DD. Try to parse it.
      logger.warn(
        `[decision.ops.transformToZodDecision] Decision date string ('${date}') is not in YYYY-MM-DD format. Attempting to parse.`,
        { decisionId: decision.id, repository: `${repositoryName}:${branch}` },
      );
      try {
        const parsedDate = new Date(date);
        // Check if parsing resulted in a valid date
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Invalid date string for new Date()');
        }
        decisionDateString = parsedDate.toISOString().split('T')[0];
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(decisionDateString)) {
          // Should not happen if toISOString().split('T')[0] works
          throw new Error('Parsed date was not YYYY-MM-DD after toISOString');
        }
      } catch (e: any) {
        logger.error(
          `[decision.ops.transformToZodDecision] Could not parse decision date string ('${date}') to YYYY-MM-DD. Error: ${e.message}. Using fallback 1970-01-01.`,
          { decisionId: decision.id, repository: `${repositoryName}:${branch}` },
        );
        decisionDateString = '1970-01-01';
      }
    }
  } else {
    // This case should ideally not be reached if 'date' strictly adheres to 'Decision' interface (string).
    // However, to be robust against unexpected types (e.g. from DB layer not conforming strictly):
    logger.warn(
      `[decision.ops.transformToZodDecision] Decision date was not a string (type: ${typeof date}). Using fallback 1970-01-01.`,
      { decisionId: decision.id, value: date, repository: `${repositoryName}:${branch}` },
    );
    decisionDateString = '1970-01-01';
  }

  return {
    id: decision.id, // Assuming decision.id is always present and a string
    name: decision.name, // Assuming decision.name is always present and a string
    date: decisionDateString,
    context: decision.context || null, // Allow null if not provided
    status: decision.status || null, // Allow null if not provided, Zod enum handles specific values
    repository: `${repositoryName}:${branch}`,
    branch: branch,
    created_at: parseBaseEntityTimestamp(decision.created_at),
    updated_at: parseBaseEntityTimestamp(decision.updated_at),
  };
}
