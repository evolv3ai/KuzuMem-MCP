// src/services/memory-operations/metadata.ops.ts
// Re-saving to try and clear any potential ts-node/jest cache issues.
import { RepositoryRepository } from '../../repositories';
import { Repository, Metadata } from '../../types';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';

/**
 * Retrieves metadata for a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @returns A Promise resolving to the Metadata object or null if not found.
 */
export async function getMetadataOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
): Promise<Metadata | null> {
  const logger = mcpContext.logger;
  logger.debug(`[metadata.ops.getMetadataOp] For ${repositoryName}:${branch}`);

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(`[metadata.ops.getMetadataOp] Repository not found: ${repositoryName}/${branch}`);
      return null;
    }

    // Transform Repository to Metadata
    const metadata: Metadata = {
      id: repository.id,
      name: repositoryName,
      repository: repositoryName,
      branch: branch,
      content: {
        id: repository.id,
        project: {
          name: repositoryName,
          created: repository.created_at?.toISOString() || new Date().toISOString(),
          description: repository.name,
        },
        tech_stack: {},
        architecture: 'unknown',
        memory_spec_version: '1.0.0',
      },
      created_at: repository.created_at,
      updated_at: repository.updated_at,
    };

    logger.info(`[metadata.ops.getMetadataOp] Retrieved metadata for ${repositoryName}:${branch}`);
    return metadata;
  } catch (error: any) {
    logger.error(
      `[metadata.ops.getMetadataOp] Error for ${repositoryName}:${branch}: ${error.message}`,
      {
        error: error.toString(),
        stack: error.stack,
      },
    );
    throw error;
  }
}

/**
 * Updates metadata for a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param metadataContent - The metadata content to update.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @returns A Promise resolving to the updated Metadata object or null if not found.
 */
export async function updateMetadataOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  metadataContent: Partial<Metadata['content']>,
  repositoryRepo: RepositoryRepository,
): Promise<Metadata | null> {
  const logger = mcpContext.logger;
  logger.debug(`[metadata.ops.updateMetadataOp] For ${repositoryName}:${branch}`, {
    metadataContent,
  });

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(
        `[metadata.ops.updateMetadataOp] Repository not found: ${repositoryName}/${branch}`,
      );
      return null;
    }

    // Since Repository doesn't have metadata fields, we return a mock updated metadata
    // In a real implementation, you might want to store metadata separately
    const now = new Date();
    const metadata: Metadata = {
      id: repository.id,
      name: repositoryName,
      repository: repositoryName,
      branch: branch,
      content: {
        id: repository.id,
        project: {
          name: repositoryName,
          created: repository.created_at?.toISOString() || now.toISOString(),
          description: metadataContent.project?.description || repository.name,
        },
        tech_stack: metadataContent.tech_stack || {},
        architecture: metadataContent.architecture || 'unknown',
        memory_spec_version: metadataContent.memory_spec_version || '1.0.0',
      },
      created_at: repository.created_at,
      updated_at: now,
    };

    logger.info(`[metadata.ops.updateMetadataOp] Updated metadata for ${repositoryName}:${branch}`);
    return metadata;
  } catch (error: any) {
    logger.error(
      `[metadata.ops.updateMetadataOp] Error for ${repositoryName}:${branch}: ${error.message}`,
      {
        error: error.toString(),
        stack: error.stack,
      },
    );
    throw error;
  }
}

/**
 * Initializes a repository and creates initial metadata.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @returns A Promise resolving to the created Repository object or null on failure.
 */
export async function initializeRepositoryOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
): Promise<Repository | null> {
  const logger = mcpContext.logger;
  logger.debug(`[metadata.ops.initializeRepositoryOp] Initializing ${repositoryName}:${branch}`);

  try {
    // Check if repository already exists
    const existingRepo = await repositoryRepo.findByName(repositoryName, branch);
    if (existingRepo) {
      logger.info(
        `[metadata.ops.initializeRepositoryOp] Repository already exists: ${repositoryName}:${branch}`,
      );
      return existingRepo;
    }

    // Create new repository using create method that expects single name parameter
    const newRepo = await repositoryRepo.create({
      name: repositoryName,
      branch: branch,
    });
    if (!newRepo) {
      logger.error(
        `[metadata.ops.initializeRepositoryOp] Failed to create repository: ${repositoryName}:${branch}`,
      );
      return null;
    }

    logger.info(
      `[metadata.ops.initializeRepositoryOp] Repository created: ${repositoryName}:${branch}`,
    );
    return newRepo;
  } catch (error: any) {
    logger.error(
      `[metadata.ops.initializeRepositoryOp] Error for ${repositoryName}:${branch}: ${error.message}`,
      {
        error: error.toString(),
        stack: error.stack,
      },
    );
    throw error;
  }
}
