import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { CoreService } from '../core/core.service';
import * as metadataOps from '../memory-operations/metadata.ops';
import { SnapshotService } from '../snapshot.service';

export class MetadataService extends CoreService {
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

  async getMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.GetMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      const errorMessage = 'RepositoryProvider not initialized in getMetadata';
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const metadataContent = await metadataOps.getMetadataOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
      );

      if (!metadataContent) {
        logger.warn(
          `[MetadataService.getMetadata] No metadata found for ${repositoryName}:${branch}`,
        );
        return null;
      }
      const metadataResult = {
        id: metadataContent.id,
        project: {
          name: metadataContent.content?.project?.name || repositoryName,
          created: metadataContent.content?.project?.created || new Date().toISOString(),
          description: metadataContent.content?.project?.description,
        },
        tech_stack: metadataContent.content?.tech_stack || {},
        architecture: metadataContent.content?.architecture || '',
        memory_spec_version: metadataContent.content?.memory_spec_version || '1.0',
      };
      logger.info(
        `[MetadataService.getMetadata] Metadata retrieved for ${repositoryName}:${branch}`,
      );
      return metadataResult;
    } catch (error: any) {
      logger.error(`Error in getMetadata for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
      });
      // Re-throw the original error to maintain the stack trace and let the caller handle it
      throw error;
    }
  }

  async updateMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    metadataContentChanges: any,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.UpdateMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('RepositoryProvider not initialized in updateMetadata');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const updatedContent = await metadataOps.updateMetadataOp(
        mcpContext,
        repositoryName,
        branch,
        metadataContentChanges,
        repositoryRepo,
      );

      if (!updatedContent) {
        logger.warn(
          `Failed to update metadata for ${repositoryName}:${branch}. updateMetadataOp returned null.`,
        );
        return null;
      }
      logger.info(`Metadata updated successfully for ${repositoryName}:${branch}.`);
      return {
        success: true,
        message: `Metadata updated successfully`,
      };
    } catch (error: any) {
      logger.error(`Error in updateMetadata for ${repositoryName}:${branch}: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  }
}
