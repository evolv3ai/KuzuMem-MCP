import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { CoreService } from '../core/core.service';
import { SnapshotService } from '../snapshot.service';

export class MetadataService extends CoreService {
  constructor(
    repositoryProvider: RepositoryProvider,
    getKuzuClient: (
      mcpContext: ToolHandlerContext,
      clientProjectRoot: string,
    ) => Promise<KuzuDBClient>,
    getSnapshotService: (
      mcpContext: ToolHandlerContext,
      clientProjectRoot: string,
    ) => Promise<SnapshotService>,
  ) {
    super(repositoryProvider, getKuzuClient, getSnapshotService);
  }

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
        logger.error(
          `[MetadataService.getMetadata] Repository ${repositoryName}:${branch} not found`,
        );
        return null;
      }

      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Query for metadata with backward compatibility for schema migration
      const query = `
        MATCH (r:Repository {id: $repositoryId})-[:HAS_METADATA]->(m:Metadata)
        RETURN m
      `;

      const params = { repositoryId: repository.id };
      const result = await kuzuClient.executeQuery(query, params);

      if (result && result.length > 0) {
        const metadata = result[0].m;

        // Parse the content JSON field with backward compatibility
        let parsedContent: any = {};
        if (metadata.content) {
          try {
            parsedContent = JSON.parse(metadata.content);
          } catch (parseError) {
            logger.warn(
              `[MetadataService.getMetadata] Invalid JSON in content for ${repositoryName}:${branch}, checking for legacy fields`,
              {
                content: metadata.content,
                parseError: parseError instanceof Error ? parseError.message : String(parseError),
              },
            );

            // BACKWARD COMPATIBILITY: Check for legacy separate fields
            if (metadata.tech_stack || metadata.architecture || metadata.project_name) {
              logger.info(
                `[MetadataService.getMetadata] Found legacy metadata fields for ${repositoryName}:${branch}, migrating to new format`,
              );

              // Migrate legacy fields to new JSON content format
              parsedContent = {
                project: {
                  name: metadata.project_name || repositoryName,
                  created: repository.created_at?.toISOString() || new Date().toISOString(),
                },
                tech_stack: metadata.tech_stack ? JSON.parse(metadata.tech_stack) : {},
                architecture: metadata.architecture || '',
                memory_spec_version: metadata.memory_spec_version || '3.0.0',
              };

              // Update the metadata record with the new format
              await this.migrateLegacyMetadata(
                mcpContext,
                clientProjectRoot,
                repositoryName,
                branch,
                parsedContent,
              );
            } else {
              parsedContent = {};
            }
          }
        } else {
          // BACKWARD COMPATIBILITY: Check for legacy separate fields when no content field exists
          if (metadata.tech_stack || metadata.architecture || metadata.project_name) {
            logger.info(
              `[MetadataService.getMetadata] Found legacy metadata fields for ${repositoryName}:${branch}, migrating to new format`,
            );

            parsedContent = {
              project: {
                name: metadata.project_name || repositoryName,
                created: repository.created_at?.toISOString() || new Date().toISOString(),
              },
              tech_stack: metadata.tech_stack ? JSON.parse(metadata.tech_stack) : {},
              architecture: metadata.architecture || '',
              memory_spec_version: metadata.memory_spec_version || '3.0.0',
            };

            // Update the metadata record with the new format
            await this.migrateLegacyMetadata(
              mcpContext,
              clientProjectRoot,
              repositoryName,
              branch,
              parsedContent,
            );
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

  /**
   * Migrate legacy metadata fields to new JSON content format
   * This ensures backward compatibility during schema transition
   */
  private async migrateLegacyMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    parsedContent: any,
  ): Promise<void> {
    const logger = mcpContext.logger || console;

    try {
      logger.info(
        `[MetadataService.migrateLegacyMetadata] Migrating legacy metadata for ${repositoryName}:${branch}`,
      );

      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const repository = await repositoryRepo.findByName(repositoryName, branch);

      if (!repository) {
        logger.error(
          `[MetadataService.migrateLegacyMetadata] Repository not found: ${repositoryName}:${branch}`,
        );
        return;
      }

      const now = new Date();
      const metadataId = `${repositoryName}-${branch}-metadata`;
      const graphUniqueId = `${repositoryName}:${branch}:metadata:${metadataId}`;

      // Update the metadata with new JSON content format and clear legacy fields
      const migrationQuery = `
        MATCH (r:Repository {id: $repositoryId})-[:HAS_METADATA]->(m:Metadata)
        SET
          m.content = $content,
          m.updated_at = $now,
          m.tech_stack = NULL,
          m.architecture = NULL,
          m.project_name = NULL
        RETURN m
      `;

      const content = JSON.stringify(parsedContent);
      const params = {
        repositoryId: repository.id,
        content,
        now,
      };

      await kuzuClient.executeQuery(migrationQuery, params);

      logger.info(
        `[MetadataService.migrateLegacyMetadata] Successfully migrated metadata for ${repositoryName}:${branch}`,
      );
    } catch (error: any) {
      logger.error(
        `[MetadataService.migrateLegacyMetadata] Error migrating metadata for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      // Don't throw - migration failure shouldn't break the main operation
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
