import { z } from 'zod';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Context } from '../../types';
import { CoreService } from '../core/core.service';
import { IContextService, IServiceContainer } from '../core/service-container.interface';
import * as contextOps from '../memory-operations/context.ops';

export class ContextService extends CoreService implements IContextService {
  constructor(serviceContainer: IServiceContainer) {
    super(serviceContainer);
  }

  /**
   * Get today's context or create it if it doesn't exist
   */
  async getTodayContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Context | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[ContextService.getTodayContext] RepositoryProvider not initialized');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const todayIsoDate = new Date().toISOString().split('T')[0];
      const context = await contextRepo.getContextByDate(
        mcpContext,
        repositoryName,
        branch,
        todayIsoDate,
      );
      if (!context) {
        logger.info(
          `[ContextService.getTodayContext] No context found for today for ${repositoryName}:${branch}`,
        );
        return null;
      }
      logger.info(
        `[ContextService.getTodayContext] Retrieved today's context for ${repositoryName}:${branch}`,
      );
      return context;
    } catch (error: any) {
      logger.error(
        `[ContextService.getTodayContext] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return null;
    }
  }

  /**
   * Update today's context
   */
  async updateTodayContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    contextUpdate: Partial<
      Omit<Context, 'repository' | 'id' | 'iso_date' | 'branch' | 'created_at' | 'updated_at'>
    > & {
      issue?: string;
      decision?: string;
      observation?: string;
    },
    branch: string = 'main',
  ): Promise<Context | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[ContextService.updateTodayContext] RepositoryProvider not initialized');
      return null;
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[ContextService.updateTodayContext] Repository ${repositoryName}:${branch} not found.`,
        );
        return null;
      }
      const todayIsoDate = new Date().toISOString().split('T')[0];
      let currentContextInternal = await contextRepo.getContextByDate(
        mcpContext,
        repositoryName,
        branch,
        todayIsoDate,
      );
      const effectiveName =
        contextUpdate.name ||
        contextUpdate.summary ||
        currentContextInternal?.name ||
        `context-${todayIsoDate}`;

      if (!currentContextInternal) {
        logger.info(
          `[ContextService.updateTodayContext] No context for today, creating new one for ${repositoryName}:${branch}`,
        );
        const contextToCreate: Context = {
          repository: repository.id,
          branch: branch,
          id: `context-${todayIsoDate}`,
          name: effectiveName,
          iso_date: todayIsoDate,
          summary: contextUpdate.summary || '',
          agent: contextUpdate.agent,
          related_issue: contextUpdate.issue,
          decisions: contextUpdate.decision ? [contextUpdate.decision] : [],
          observations: contextUpdate.observation ? [contextUpdate.observation] : [],
          created_at: new Date(),
          updated_at: new Date(),
        } as Context;
        currentContextInternal = await contextRepo.upsertContext(mcpContext, contextToCreate);
      } else {
        logger.info(
          `[ContextService.updateTodayContext] Updating existing context for today for ${repositoryName}:${branch}`,
        );
        const updatedData: Context = {
          ...currentContextInternal,
          name: effectiveName,
          summary:
            contextUpdate.summary !== undefined
              ? contextUpdate.summary
              : currentContextInternal.summary,
          agent:
            contextUpdate.agent !== undefined ? contextUpdate.agent : currentContextInternal.agent,
          related_issue:
            contextUpdate.issue !== undefined
              ? contextUpdate.issue
              : currentContextInternal.related_issue,
          decisions:
            contextUpdate.decision && currentContextInternal.decisions
              ? Array.from(new Set([...currentContextInternal.decisions, contextUpdate.decision]))
              : contextUpdate.decision
                ? [contextUpdate.decision]
                : currentContextInternal.decisions || [],
          observations:
            contextUpdate.observation && currentContextInternal.observations
              ? Array.from(
                  new Set([...currentContextInternal.observations, contextUpdate.observation]),
                )
              : contextUpdate.observation
                ? [contextUpdate.observation]
                : currentContextInternal.observations || [],
          updated_at: new Date(),
        };
        currentContextInternal = await contextRepo.upsertContext(mcpContext, updatedData);
      }
      if (!currentContextInternal) {
        logger.error(
          `[ContextService.updateTodayContext] Failed to upsert context for ${repositoryName}:${branch}`,
        );
        return null;
      }
      logger.info(
        `[ContextService.updateTodayContext] Context for today updated/created for ${repositoryName}:${branch}`,
      );
      return currentContextInternal;
    } catch (error: any) {
      logger.error(
        `[ContextService.updateTodayContext] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return null;
    }
  }

  /**
   * Get latest contexts
   */
  async getLatestContexts(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    limit?: number,
  ): Promise<Context[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[ContextService.getLatestContexts] RepositoryProvider not initialized');
      return [];
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[ContextService.getLatestContexts] Repository ${repositoryName}:${branch} not found.`,
        );
        return [];
      }
      const contexts = await contextOps.getLatestContextsOp(
        mcpContext,
        repositoryName,
        branch,
        limit || 10,
        repositoryRepo,
        contextRepo,
      );
      logger.info(
        `[ContextService.getLatestContexts] Retrieved ${contexts.length} latest contexts for ${repositoryName}:${branch}`,
      );
      return contexts;
    } catch (error: any) {
      logger.error(
        `[ContextService.getLatestContexts] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  /**
   * Update today's context for a repository/branch (MCP tool compatibility)
   */
  async updateContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: z.infer<typeof toolSchemas.ContextInputSchema>,
  ): Promise<z.infer<typeof toolSchemas.ContextUpdateOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[ContextService.updateContext] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const contextRepo = this.repositoryProvider.getContextRepository(clientProjectRoot);

      const updatedCtxNode = await contextOps.updateContextOp(
        mcpContext,
        params.repository,
        params.branch,
        params,
        repositoryRepo,
        contextRepo,
      );

      if (!updatedCtxNode) {
        logger.warn(
          `[ContextService.updateContext] Failed to update context for ${params.repository}:${params.branch}. Ops function returned null.`,
        );
        return { success: false, message: 'Context not found or not updated', context: undefined };
      }
      logger.info(
        `[ContextService.updateContext] Context updated successfully for ${params.repository}:${params.branch}`,
      );
      return {
        success: true,
        message: 'Context updated successfully',
        context: updatedCtxNode as any,
      };
    } catch (error: any) {
      logger.error(
        `[ContextService.updateContext] Error for ${params.repository}:${params.branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }
}
