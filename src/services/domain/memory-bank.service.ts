import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Metadata, Repository } from '../../types';
import { ensureAbsolutePath } from '../../utils/path.utils';
import { CoreService } from '../core/core.service';
import * as repositoryOps from '../memory-operations/repository.ops';
import { SnapshotService } from '../snapshot.service';

export class MemoryBankService extends CoreService {
  async initMemoryBank(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.InitMemoryBankOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryBankService.initMemoryBank] ENTERED. Repo: ${repositoryName}:${branch}, CPR: ${clientProjectRoot}`,
    );

    if (!this.repositoryProvider) {
      logger.error('[MemoryBankService.initMemoryBank] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    clientProjectRoot = ensureAbsolutePath(clientProjectRoot);
    logger.info(`[MemoryBankService.initMemoryBank] Absolute CPR: ${clientProjectRoot}`);

    try {
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Validating database path for ${repositoryName}:${branch}...`,
        percent: 25,
      });

      // Initialize KuzuDB client and repositories
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Creating repository ${repositoryName}:${branch}...`,
        percent: 50,
      });

      // Create or get the repository
      const repository = await repositoryOps.getOrCreateRepositoryOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
      );

      if (!repository) {
        logger.error(
          `[MemoryBankService.initMemoryBank] Failed to create repository ${repositoryName}:${branch}`,
        );
        return {
          success: false,
          message: `Failed to create repository ${repositoryName}:${branch}`,
          path: clientProjectRoot,
        };
      }

      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Memory bank initialization complete for ${repositoryName}:${branch}`,
        percent: 100,
      });

      logger.info(
        `[MemoryBankService.initMemoryBank] Successfully initialized memory bank for ${repositoryName}:${branch}`,
      );

      return {
        success: true,
        message: `Memory bank initialized for ${repositoryName} (branch: ${branch})`,
        path: clientProjectRoot,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryBankService.initMemoryBank] Error initializing memory bank for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return {
        success: false,
        message: `Failed to initialize memory bank: ${error.message}`,
        path: clientProjectRoot,
      };
    }
  }

  async getOrCreateRepository(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    name: string,
    branch: string = 'main',
  ): Promise<Repository> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryBankService.getOrCreateRepository] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const repository = await repositoryOps.getOrCreateRepositoryOp(
        mcpContext,
        name,
        branch,
        repositoryRepo,
      );

      if (!repository) {
        const errorMessage = `Failed to create or retrieve repository ${name}:${branch}`;
        logger.error(`[MemoryBankService.getOrCreateRepository] ${errorMessage}`);
        throw new Error(errorMessage);
      }

      logger.info(
        `[MemoryBankService.getOrCreateRepository] Repository ${name}:${branch} retrieved/created successfully`,
      );

      return repository;
    } catch (error: any) {
      logger.error(
        `[MemoryBankService.getOrCreateRepository] Error for ${name}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }
}
