import { z } from 'zod';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Metadata, Repository } from '../../types';
import { ensureAbsolutePath } from '../../utils/path.utils';
import { CoreService } from '../core/core.service';

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
    clientProjectRoot = ensureAbsolutePath(clientProjectRoot);
    logger.info(`[MemoryBankService.initMemoryBank] Absolute CPR: ${clientProjectRoot}`);

    await mcpContext.sendProgress({
      status: 'in_progress',
      message: `Validating database path for ${repositoryName}:${branch}...`,
      percent: 25,
    });

    const validationResult = this.validateRepositoryProvider(logger);
    if (!validationResult.success) {
      return validationResult;
    }

    try {
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Creating Kuzu database client for ${repositoryName}:${branch}...`,
        percent: 45,
      });

      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Initializing repository structure...`,
        percent: 60,
      });

      const repository = await this.ensureRepository(clientProjectRoot, repositoryName, branch);

      await this.ensureMetadata(mcpContext, clientProjectRoot, repository, repositoryName, branch);

      return {
        success: true,
        message: `Memory bank initialized for ${repositoryName} (branch: ${branch})`,
        path: clientProjectRoot,
      };
    } catch (error: any) {
      logger.error(
        { error: error.message, stack: error.stack },
        'MemoryBankService.initMemoryBank CAUGHT EXCEPTION',
      );
      return { success: false, message: error.message || 'Failed to initialize memory bank' };
    }
  }

  /**
   * Validate that the repository provider is initialized
   */
  protected validateRepositoryProvider(
    logger: any,
  ): z.infer<typeof toolSchemas.InitMemoryBankOutputSchema> | { success: true } {
    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryBankService.initMemoryBank] CRITICAL: RepositoryProvider is NOT INITIALIZED.',
      );
      return {
        success: false,
        message: 'Critical error: RepositoryProvider not initialized in MemoryBankService',
      };
    }
    return { success: true };
  }

  /**
   * Ensure repository exists, create if it doesn't
   */
  private async ensureRepository(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
  ): Promise<Repository> {
    const repositoryRepo = this.repositoryProvider!.getRepositoryRepository(clientProjectRoot);

    let repository = await repositoryRepo.findByName(repositoryName, branch);

    if (!repository) {
      repository = await repositoryRepo.create({ name: repositoryName, branch });
    }
    if (!repository || !repository.id) {
      throw new Error(`Repository ${repositoryName}:${branch} could not be found or created.`);
    }

    return repository;
  }

  /**
   * Ensure metadata exists for the repository
   */
  private async ensureMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: Repository,
    repositoryName: string,
    branch: string,
  ): Promise<void> {
    const metadataRepo = this.repositoryProvider!.getMetadataRepository(clientProjectRoot);

    const existingMetadata = await metadataRepo.findMetadata(
      mcpContext,
      repositoryName,
      branch,
      'meta',
    );

    if (!existingMetadata) {
      const today = new Date().toISOString().split('T')[0];
      const metadataToCreate = {
        repository: repository.id,
        branch: branch,
        id: 'meta',
        name: repositoryName,
        content: {
          id: 'meta',
          project: { name: repositoryName, created: today },
          tech_stack: { language: 'Unknown', framework: 'Unknown', datastore: 'Unknown' },
          architecture: 'unknown',
          memory_spec_version: '3.0.0',
        },
      } as Metadata;
      await metadataRepo.upsertMetadata(mcpContext, metadataToCreate);
    }
  }

  async getOrCreateRepository(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    name: string,
    branch: string = 'main',
  ): Promise<Repository | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in getOrCreateRepository');
      throw new Error('RepositoryProvider not initialized');
    }
    await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const existingRepo = await repositoryRepo.findByName(name, branch);
    if (existingRepo) {
      return existingRepo;
    }
    try {
      logger.info(`Creating new repository ${name}/${branch} at root ${clientProjectRoot}`);
      return await repositoryRepo.create({ name, branch });
    } catch (error: any) {
      logger.error(`Failed to create repository ${name}/${branch}: ${error.message}`, {
        error: error.toString(),
      });
      return null;
    }
  }
}
