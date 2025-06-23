import { z } from 'zod';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { CoreService } from '../core/core.service';
import { RepositoryProvider } from '../../db/repository-provider';
import { KuzuDBClient } from '../../db/kuzu';
import { SnapshotService } from '../snapshot.service';

export class MetadataService extends CoreService {

  async getMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.GetMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;

    try {
      // Get repository and KuzuDB client
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);

      if (!repository) {
        logger.warn(
          `[MetadataService.getMetadata] Repository ${repositoryName}:${branch} not found`,
        );
        return null;
      }

      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Query for metadata node
      const metadataQuery = `
        MATCH (r:Repository {id: $repositoryId})-[:HAS_METADATA]->(m:Metadata)
        RETURN m
        LIMIT 1
      `;

      const result = await kuzuClient.executeQuery(metadataQuery, {
        repositoryId: repository.id,
      });

      if (result && result.length > 0) {
        const metadata = result[0].m;
        return {
          id: metadata.id || 'meta',
          project: {
            name: metadata.project_name || repositoryName,
            created:
              metadata.project_created ||
              repository.created_at?.toISOString() ||
              new Date().toISOString(),
          },
          tech_stack: metadata.tech_stack ? JSON.parse(metadata.tech_stack) : {},
          architecture: metadata.architecture || '',
          memory_spec_version: metadata.memory_spec_version || '3.0.0',
        };
      }

      // Return default metadata if none exists
      return {
        id: 'meta',
        project: {
          name: repositoryName,
          created: repository.created_at?.toISOString() || new Date().toISOString(),
        },
        tech_stack: {},
        architecture: '',
        memory_spec_version: '3.0.0',
      };
    } catch (error: any) {
      logger.error(`[MetadataService.getMetadata] Error: ${error.message}`, {
        error: error.toString(),
      });
      throw error;
    }
  }

  async updateMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    metadataContentChanges: any,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.UpdateMetadataOutputSchema> | null> {
    const logger = mcpContext.logger || console;

    try {
      // Get repository and KuzuDB client
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);

      if (!repository) {
        logger.error(
          `[MetadataService.updateMetadata] Repository ${repositoryName}:${branch} not found`,
        );
        return {
          success: false,
          message: `Repository ${repositoryName}:${branch} not found`,
        };
      }

      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Prepare metadata fields
      const now = new Date();
      const metadataId = `${repositoryName}-${branch}-metadata`;

      // Use MERGE to create or update metadata
      const updateQuery = `
        MATCH (r:Repository {id: $repositoryId})
        MERGE (r)-[:HAS_METADATA]->(m:Metadata {id: $metadataId})
        ON CREATE SET
          m.id = $metadataId,
          m.project_name = $projectName,
          m.project_created = $projectCreated,
          m.tech_stack = $techStack,
          m.architecture = $architecture,
          m.memory_spec_version = $memorySpecVersion,
          m.created_at = $now,
          m.updated_at = $now
        ON MATCH SET
          m.project_name = COALESCE($projectName, m.project_name),
          m.tech_stack = COALESCE($techStack, m.tech_stack),
          m.architecture = COALESCE($architecture, m.architecture),
          m.memory_spec_version = COALESCE($memorySpecVersion, m.memory_spec_version),
          m.updated_at = $now
        RETURN m
      `;

      const params = {
        repositoryId: repository.id,
        metadataId,
        projectName: metadataContentChanges.project?.name || repositoryName,
        projectCreated:
          metadataContentChanges.project?.created ||
          repository.created_at?.toISOString() ||
          new Date().toISOString(),
        techStack: metadataContentChanges.tech_stack
          ? JSON.stringify(metadataContentChanges.tech_stack)
          : null,
        architecture: metadataContentChanges.architecture || null,
        memorySpecVersion: metadataContentChanges.memory_spec_version || '3.0.0',
        now,
      };

      const result = await kuzuClient.executeQuery(updateQuery, params);

      if (result && result.length > 0) {
        logger.info(
          `[MetadataService.updateMetadata] Successfully updated metadata for ${repositoryName}:${branch}`,
        );
        return {
          success: true,
          message: `Metadata updated successfully for ${repositoryName}:${branch}`,
        };
      } else {
        logger.error(
          `[MetadataService.updateMetadata] Failed to update metadata for ${repositoryName}:${branch}`,
        );
        return {
          success: false,
          message: `Failed to update metadata for ${repositoryName}:${branch}`,
        };
      }
    } catch (error: any) {
      logger.error(`[MetadataService.updateMetadata] Error: ${error.message}`, {
        error: error.toString(),
      });
      return {
        success: false,
        message: `Error updating metadata: ${error.message}`,
      };
    }
  }
}
