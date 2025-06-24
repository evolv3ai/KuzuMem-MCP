import { z } from 'zod';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { CoreService } from '../core/core.service';

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

        // Parse the content JSON field
        let parsedContent: any = {};
        if (metadata.content) {
          try {
            parsedContent = JSON.parse(metadata.content);
          } catch (parseError) {
            logger.warn(
              `[MetadataService.getMetadata] Invalid JSON in content for ${repositoryName}:${branch}, using empty object`,
              {
                content: metadata.content,
                parseError: parseError instanceof Error ? parseError.message : String(parseError),
              },
            );
            parsedContent = {};
          }
        }

        return {
          id: metadata.id || 'meta',
          project: {
            name: parsedContent.project?.name || metadata.name || repositoryName,
            created:
              parsedContent.project?.created ||
              repository.created_at?.toISOString() ||
              new Date().toISOString(),
          },
          tech_stack: parsedContent.tech_stack || {},
          architecture: parsedContent.architecture || '',
          memory_spec_version: parsedContent.memory_spec_version || '3.0.0',
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
      const graphUniqueId = `${repositoryName}:${branch}:metadata:${metadataId}`;

      // Use MERGE to create or update metadata - must use graph_unique_id as primary key
      const updateQuery = `
        MATCH (r:Repository {id: $repositoryId})
        MERGE (r)-[:HAS_METADATA]->(m:Metadata {graph_unique_id: $graphUniqueId})
        ON CREATE SET
          m.graph_unique_id = $graphUniqueId,
          m.id = $metadataId,
          m.branch = $branch,
          m.name = $projectName,
          m.content = $content,
          m.created_at = $now,
          m.updated_at = $now
        ON MATCH SET
          m.name = COALESCE($projectName, m.name),
          m.content = COALESCE($content, m.content),
          m.updated_at = $now
        RETURN m
      `;

      // Create content object with all metadata
      const content = JSON.stringify({
        project: {
          name: metadataContentChanges.project?.name || repositoryName,
          created:
            metadataContentChanges.project?.created ||
            repository.created_at?.toISOString() ||
            new Date().toISOString(),
        },
        tech_stack: metadataContentChanges.tech_stack || {},
        architecture: metadataContentChanges.architecture || '',
        memory_spec_version: metadataContentChanges.memory_spec_version || '3.0.0',
      });

      const params = {
        repositoryId: repository.id,
        graphUniqueId,
        metadataId,
        branch,
        projectName: metadataContentChanges.project?.name || repositoryName,
        content,
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
