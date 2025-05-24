// src/services/memory-operations/metadata.ops.ts
// Re-saving to try and clear any potential ts-node/jest cache issues.
import { MetadataRepository, RepositoryRepository } from '../../repositories';
import { Metadata } from '../../types';
import { MetadataContentSchema } from '../../mcp/schemas/tool-schemas';
import { z } from 'zod';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js';

// Define an interface for the augmented context
interface EnrichedRequestHandlerExtra
  extends RequestHandlerExtra<ServerRequest, ServerNotification> {
  logger: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
  session: Record<string, any>;
  sendProgress: (data: any) => Promise<void>; // sendNotification is async, so sendProgress might be too
}

/**
 * Retrieves metadata for a given repository and branch.
 *
 * @param mcpContext - The McpServerRequestContext.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param metadataRepo - Instance of MetadataRepository.
 * @returns A Promise resolving to the Metadata object or null if not found.
 */
export async function getMetadataOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  metadataRepo: MetadataRepository,
): Promise<z.infer<typeof MetadataContentSchema> | null> {
  const logger = mcpContext.logger || console;
  // Note: metadataRepo.findMetadata now also takes mcpContext.
  // It internally constructs the GID from repositoryName, branch, and metadataId.
  // So, direct use of repositoryRepo.findByName here to get repo.id is not strictly needed
  // for the metadataRepo.findMetadata call itself, unless other logic required it.

  try {
    logger.debug(`[metadata.ops] Attempting to find metadata for ${repositoryName}:${branch}`);
    // Pass mcpContext to findMetadata as per its definition in MetadataRepository
    const metadataNode = await metadataRepo.findMetadata(
      mcpContext,
      repositoryName,
      branch,
      'meta',
    );
    if (!metadataNode || !metadataNode.content) {
      logger.warn(
        `[metadata.ops] Metadata or metadata.content not found for ${repositoryName}:${branch}`,
      );
      return null;
    }
    logger.info(`[metadata.ops] Successfully retrieved metadata for ${repositoryName}:${branch}`);
    return metadataNode.content as z.infer<typeof MetadataContentSchema>;
  } catch (error: any) {
    logger.error(
      `[metadata.ops] Error in getMetadataOp for ${repositoryName}:${branch}: ${error.message}`,
      { error: error.toString() },
    );
    // Decide: throw error for MemoryService to catch, or return null?
    // Returning null allows MemoryService to decide on the final error structure for the tool.
    return null;
  }
}

/**
 * Updates metadata for a given repository and branch.
 *
 * @param mcpContext - The McpServerRequestContext.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param newMetadataContent - The full new metadata content object, conforming to MetadataContentSchema.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param metadataRepo - Instance of MetadataRepository.
 * @returns A Promise resolving to the updated metadata content (conforming to MetadataContentSchema) or null if update failed.
 */
export async function updateMetadataOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  newMetadataContent: z.infer<typeof MetadataContentSchema>,
  repositoryRepo: RepositoryRepository,
  metadataRepo: MetadataRepository,
): Promise<z.infer<typeof MetadataContentSchema> | null> {
  const logger = mcpContext.logger || console;
  const repoIdForLog = `${repositoryName}:${branch}`;
  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(`[metadata.ops] Repository not found: ${repoIdForLog} in updateMetadataOp`);
      return null;
    }
    logger.debug(
      `[metadata.ops] Found repository ${repoIdForLog} with ID ${repository.id} for metadata update.`,
    );

    const existingMetadataNode = await metadataRepo.findMetadata(
      mcpContext,
      repositoryName,
      branch,
      'meta',
    );
    if (existingMetadataNode) {
      logger.debug(`[metadata.ops] Existing metadata found for ${repoIdForLog}, will update.`);
    } else {
      logger.info(
        `[metadata.ops] No existing metadata for ${repoIdForLog}, will create new (implicitly via upsert).`,
      );
    }

    // Construct the content object for the database, ensuring it conforms to the internal Metadata['content'] type.
    // It merges data from newMetadataContent (Zod input) over existing or default values.
    const baseProjectContent = existingMetadataNode?.content?.project || {
      name: repositoryName,
      created: new Date().toISOString().split('T')[0], // Ensure this is string for DB
      description: undefined,
    }; // Base for project
    const baseTechStackContent = existingMetadataNode?.content?.tech_stack || {
      language: 'Unknown',
      framework: 'Unknown',
      datastore: 'Unknown',
    }; // Base for tech_stack

    const contentForDb: Metadata['content'] = {
      id: newMetadataContent.id || existingMetadataNode?.content?.id || 'meta',
      project: {
        name: newMetadataContent.project?.name || baseProjectContent.name,
        created: newMetadataContent.project?.created || baseProjectContent.created, // Must be a string
        description:
          newMetadataContent.project?.description !== undefined
            ? newMetadataContent.project.description
            : baseProjectContent.description,
      },
      tech_stack: {
        language: newMetadataContent.tech_stack?.language || baseTechStackContent.language,
        framework: newMetadataContent.tech_stack?.framework || baseTechStackContent.framework,
        datastore: newMetadataContent.tech_stack?.datastore || baseTechStackContent.datastore,
      },
      architecture:
        newMetadataContent.architecture || existingMetadataNode?.content?.architecture || 'unknown',
      memory_spec_version:
        newMetadataContent.memory_spec_version ||
        existingMetadataNode?.content?.memory_spec_version ||
        '3.0.0',
    };
    // If MetadataContentSchema has .catchall(z.any()) and Metadata['content'] supports extra fields:
    // Object.keys(newMetadataContent).forEach(key => {
    //   if (!['id', 'project', 'tech_stack', 'architecture', 'memory_spec_version'].includes(key)) {
    //     (contentForDb as any)[key] = (newMetadataContent as any)[key];
    //   }
    // });

    const finalMetadataToUpsert: Metadata = {
      id: existingMetadataNode?.id || 'meta',
      name: existingMetadataNode?.name || repositoryName,
      repository: repository.id,
      branch: branch,
      content: contentForDb,
      created_at: existingMetadataNode?.created_at || new Date(),
      updated_at: new Date(),
    };

    logger.debug(`[metadata.ops] Upserting metadata for ${repoIdForLog}`, {
      metadataIdToUpsert: finalMetadataToUpsert.id,
    });
    const upsertedMetadataNode = await metadataRepo.upsertMetadata(
      mcpContext,
      finalMetadataToUpsert,
    );

    if (!upsertedMetadataNode || !upsertedMetadataNode.content) {
      logger.error(
        `[metadata.ops] Failed to upsert metadata for ${repoIdForLog}. Upsert result was null or lacked content.`,
        { upsertedResult: upsertedMetadataNode },
      );
      return null;
    }
    logger.info(`[metadata.ops] Metadata successfully upserted for ${repoIdForLog}.`);
    return upsertedMetadataNode.content as z.infer<typeof MetadataContentSchema>;
  } catch (error: any) {
    logger.error(`[metadata.ops] Error in updateMetadataOp for ${repoIdForLog}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    return null; // Or rethrow for MemoryService to handle error construction for tool output
  }
}
