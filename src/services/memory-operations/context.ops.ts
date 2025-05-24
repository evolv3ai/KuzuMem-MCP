import { ContextRepository, RepositoryRepository } from '../../repositories';
import { Context } from '../../types';
import { z } from 'zod';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { ContextSchema, UpdateContextInputSchema } from '../../mcp/schemas/tool-schemas';

/**
 * Retrieves the latest context entries for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param limit - Optional limit for the number of context entries to return.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to an array of Context objects.
 */
export async function getLatestContextsOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  limit: number | undefined,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<z.infer<typeof ContextSchema>[]> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.debug(`[context.ops.getLatestContextsOp] Called for ${repoIdForLog}`, { limit });
  try {
    const repo = await repositoryRepo.findByName(repositoryName, branch);
    if (!repo || !repo.id) {
      logger.warn(`[context.ops.getLatestContextsOp] Repository not found: ${repoIdForLog}`);
      return [];
    }
    const internalContexts = await contextRepo.getLatestContexts(
      mcpContext,
      repo.id,
      branch,
      limit,
    );
    logger.info(
      `[context.ops.getLatestContextsOp] Retrieved ${internalContexts.length} internal contexts for ${repoIdForLog}`,
    );

    return internalContexts.map((ctx) =>
      transformToZodContext(ctx, repositoryName, branch, logger),
    );
  } catch (error: any) {
    logger.error(`[context.ops.getLatestContextsOp] Error for ${repoIdForLog}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Retrieves today's context for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to the Context object or null if not found.
 */
export async function getTodayContextOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<z.infer<typeof ContextSchema> | null> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.debug(`[context.ops.getTodayContextOp] Called for ${repoIdForLog}`);
  try {
    const today = new Date().toISOString().split('T')[0];
    const repo = await repositoryRepo.findByName(repositoryName, branch);
    if (!repo || !repo.id) {
      logger.warn(`[context.ops.getTodayContextOp] Repository not found: ${repoIdForLog}`);
      return null;
    }
    const ctx = await contextRepo.getContextByDate(mcpContext, repo.id, branch, today);
    if (!ctx) {
      logger.info(`[context.ops.getTodayContextOp] No context for today in ${repoIdForLog}`);
      return null;
    }
    logger.info(`[context.ops.getTodayContextOp] Retrieved today's context for ${repoIdForLog}`);
    return transformToZodContext(ctx, repositoryName, branch, logger);
  } catch (error: any) {
    logger.error(`[context.ops.getTodayContextOp] Error for ${repoIdForLog}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    return null;
  }
}

/**
 * Updates or creates today's context for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param params - Parameters for updating context including repositoryName, branch, and context fields.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @returns A Promise resolving to the updated or created Context object or null on failure.
 */
export async function updateContextOp(
  mcpContext: EnrichedRequestHandlerExtra,
  params: z.infer<typeof UpdateContextInputSchema>,
  repositoryRepo: RepositoryRepository,
  contextRepo: ContextRepository,
): Promise<z.infer<typeof ContextSchema> | null> {
  const logger = mcpContext.logger;
  const {
    repository: repositoryName,
    branch = 'main',
    id,
    name,
    summary,
    agent,
    issue,
    decision,
    observation,
  } = params;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.debug(`[context.ops.updateContextOp] Called for ${repoIdForLog}`, { params });

  try {
    const repo = await repositoryRepo.findByName(repositoryName, branch);
    if (!repo || !repo.id) {
      logger.warn(
        `[context.ops.updateContextOp] Repository or Repository ID not found: ${repoIdForLog}`,
        { repoObject: repo },
      );
      return null;
    }

    const todayDateString = new Date().toISOString().split('T')[0];
    const contextLogicalId = id || `context-${todayDateString}`;

    logger.debug(
      `[context.ops.updateContextOp] Attempting to find context by ID ${contextLogicalId} for repo ${repo.id}, branch ${branch}`,
    );
    let currentContextInternal = await contextRepo.findByIdAndBranch(
      mcpContext,
      repositoryName,
      contextLogicalId,
      branch,
    );

    const effectiveName = name || summary || currentContextInternal?.name || contextLogicalId;
    const now = new Date();

    if (!currentContextInternal) {
      logger.info(
        `[context.ops.updateContextOp] No context for ID ${contextLogicalId} in ${repoIdForLog}, creating new.`,
      );
      const contextToCreate: Context = {
        repository: repo.id,
        branch: branch,
        id: contextLogicalId,
        name: effectiveName,
        iso_date: contextLogicalId.startsWith('context-')
          ? contextLogicalId.substring(8)
          : todayDateString,
        summary: summary || '',
        agent: agent,
        related_issue: issue,
        decisions: decision ? [decision] : [],
        observations: observation ? [observation] : [],
        created_at: now,
        updated_at: now,
      } as Context;
      currentContextInternal = await contextRepo.upsertContext(mcpContext, contextToCreate);
      logger.info(
        `[context.ops.updateContextOp] New context created for ${contextLogicalId} in ${repoIdForLog}.`,
      );
    } else {
      logger.info(
        `[context.ops.updateContextOp] Updating existing context ${contextLogicalId} in ${repoIdForLog}.`,
      );
      const updatedData: Context = {
        ...currentContextInternal,
        name: effectiveName,
        summary: summary !== undefined ? summary : currentContextInternal.summary,
        agent: agent !== undefined ? agent : currentContextInternal.agent,
        related_issue: issue !== undefined ? issue : currentContextInternal.related_issue,
        decisions:
          decision && currentContextInternal.decisions
            ? Array.from(new Set([...currentContextInternal.decisions, decision]))
            : decision
              ? [decision]
              : currentContextInternal.decisions || [],
        observations:
          observation && currentContextInternal.observations
            ? Array.from(new Set([...currentContextInternal.observations, observation]))
            : observation
              ? [observation]
              : currentContextInternal.observations || [],
        updated_at: now,
      };
      currentContextInternal = await contextRepo.upsertContext(mcpContext, updatedData);
      logger.info(
        `[context.ops.updateContextOp] Context ${contextLogicalId} updated in ${repoIdForLog}.`,
      );
    }

    if (!currentContextInternal) {
      logger.error(
        `[context.ops.updateContextOp] Failed to upsert context for ${contextLogicalId} in ${repoIdForLog} - upsert returned null`,
      );
      return null;
    }

    return transformToZodContext(currentContextInternal, repositoryName, branch, logger);
  } catch (error: any) {
    logger.error(`[context.ops.updateContextOp] Error for ${repoIdForLog}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
      params,
    });
    throw error;
  }
}

// Helper to transform internal Context to Zod ContextSchema compliant object
function transformToZodContext(
  ctx: Context,
  repositoryName: string,
  branch: string,
  logger: EnrichedRequestHandlerExtra['logger'],
): z.infer<typeof ContextSchema> {
  if (!ctx) {
    logger.error(
      '[context.ops.transformToZodContext] Received null or undefined context. This indicates an issue upstream.',
    );
    throw new Error('transformToZodContext received null or undefined context.');
  }

  let transformedIsoDate: string;
  const originalIsoDateFromCtx = ctx.iso_date;

  if (typeof originalIsoDateFromCtx === 'string') {
    if (originalIsoDateFromCtx.includes('T')) {
      transformedIsoDate = originalIsoDateFromCtx.split('T')[0];
    } else {
      transformedIsoDate = originalIsoDateFromCtx;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transformedIsoDate)) {
      logger.warn(
        `[context.ops transform] ctx.iso_date string ('${originalIsoDateFromCtx}') is not valid YYYY-MM-DD. Correcting.`,
        { originalDate: originalIsoDateFromCtx },
      );
      transformedIsoDate = new Date().toISOString().split('T')[0];
    }
  } else {
    logger.warn(
      `[context.ops transform] ctx.iso_date was not a string as expected by Context type. Correcting.`,
      { originalDate: originalIsoDateFromCtx, type: typeof originalIsoDateFromCtx },
    );
    transformedIsoDate = new Date().toISOString().split('T')[0];
  }

  const parseTimestamp = (
    tsValue: Date | number | string | object | undefined | null,
    fieldName: string,
  ): string | null => {
    if (tsValue === null || tsValue === undefined) {
      return null;
    }

    if (tsValue instanceof Date) {
      return tsValue.toISOString();
    }

    if (typeof tsValue === 'number') {
      return new Date(tsValue / 1000).toISOString();
    }

    if (
      typeof tsValue === 'object' &&
      tsValue !== null &&
      'year' in tsValue &&
      'microsecond' in tsValue
    ) {
      const y = String((tsValue as any).year).padStart(4, '0');
      const mon = String((tsValue as any).month).padStart(2, '0');
      const d = String((tsValue as any).day).padStart(2, '0');
      const h = String((tsValue as any).hour).padStart(2, '0');
      const min = String((tsValue as any).minute).padStart(2, '0');
      const s = String((tsValue as any).second).padStart(2, '0');
      const micro = (tsValue as any).microsecond;
      const ms = String(Math.floor(micro / 1000)).padStart(3, '0');
      return `${y}-${mon}-${d}T${h}:${min}:${s}.${ms}Z`;
    }

    if (typeof tsValue === 'string') {
      const d = new Date(tsValue);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    }

    logger.warn(`[context.ops transform] Unexpected ${fieldName} format, could not parse:`, {
      value: tsValue,
      type: typeof tsValue,
    });
    return null;
  };

  return {
    id: ctx.id || `context-${transformedIsoDate}`,
    name: ctx.name || ctx.summary || `Context ${transformedIsoDate}`,
    summary: ctx.summary || null,
    iso_date: transformedIsoDate,
    created_at: parseTimestamp(ctx.created_at, 'created_at'),
    updated_at: parseTimestamp(ctx.updated_at, 'updated_at'),
    agent: ctx.agent || null,
    issue: ctx.related_issue || null,
    decision_ids: Array.isArray(ctx.decisions)
      ? ctx.decisions.map(String)
      : ctx.decisions
        ? [String(ctx.decisions)]
        : [],
    observation_ids: Array.isArray(ctx.observations)
      ? ctx.observations.map(String)
      : ctx.observations
        ? [String(ctx.observations)]
        : [],
    repository: `${repositoryName}:${branch}`,
    branch: branch,
  };
}
