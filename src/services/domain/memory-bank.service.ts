import * as path from 'path';
import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { Metadata } from '../../types';
import { CoreService } from '../core/core.service';
import { SnapshotService } from '../snapshot.service';

export class MemoryBankService extends CoreService {
  constructor(
    repositoryProvider: RepositoryProvider,
    getKuzuClient: (
      mcpContext: EnrichedRequestHandlerExtra,
      clientProjectRoot: string,
    ) => Promise<KuzuDBClient>,
    getSnapshotService: (
      mcpContext: EnrichedRequestHandlerExtra,
      clientProjectRoot: string,
    ) => Promise<SnapshotService>,
  ) {
    super(repositoryProvider, getKuzuClient, getSnapshotService);
  }

  async initMemoryBank(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.InitMemoryBankOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryBankService.initMemoryBank] ENTERED. Repo: ${repositoryName}:${branch}, CPR: ${clientProjectRoot}`,
    );
    clientProjectRoot = this.ensureAbsoluteRoot(clientProjectRoot);
    logger.info(`[MemoryBankService.initMemoryBank] Absolute CPR: ${clientProjectRoot}`);

    await mcpContext.sendProgress({
      status: 'in_progress',
      message: `Validating database path for ${repositoryName}:${branch}...`,
      percent: 25,
    });

    if (!this.repositoryProvider) {
      logger.error(
        '[MemoryBankService.initMemoryBank] CRITICAL: RepositoryProvider is NOT INITIALIZED.',
      );
      return {
        success: false,
        message: 'Critical error: RepositoryProvider not initialized in MemoryBankService',
      };
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

      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataRepo = this.repositoryProvider.getMetadataRepository(clientProjectRoot);

      let repository = await repositoryRepo.findByName(repositoryName, branch);

      if (!repository) {
        repository = await repositoryRepo.create({ name: repositoryName, branch });
      }
      if (!repository || !repository.id) {
        throw new Error(`Repository ${repositoryName}:${branch} could not be found or created.`);
      }

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

  private ensureAbsoluteRoot(clientProjectRoot: string): string {
    if (!path.isAbsolute(clientProjectRoot)) {
      return path.resolve(clientProjectRoot);
    }
    return clientProjectRoot;
  }

  async getOrCreateRepository(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    name: string,
    branch: string = 'main',
  ): Promise<any | null> {
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
