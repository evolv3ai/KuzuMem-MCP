import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { RepositoryRepository } from '../../repositories/repository.repository';
import { Repository } from '../../types';

/**
 * Get or create a repository
 */
export async function getOrCreateRepositoryOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
): Promise<Repository | null> {
  const logger = mcpContext.logger || console;

  try {
    // First try to find existing repository
    let repository = await repositoryRepo.findByName(repositoryName, branch);
    
    if (repository) {
      logger.info(
        `[repository.ops.getOrCreateRepositoryOp] Found existing repository: ${repositoryName}:${branch}`,
      );
      return repository;
    }

    // Create new repository if not found
    logger.info(
      `[repository.ops.getOrCreateRepositoryOp] Creating new repository: ${repositoryName}:${branch}`,
    );

    const newRepository: Repository = {
      id: `${repositoryName}-${branch}-${Date.now()}`,
      name: repositoryName,
      branch: branch,
      created_at: new Date(),
      updated_at: new Date(),
    };

    repository = await repositoryRepo.create(newRepository);
    
    if (repository) {
      logger.info(
        `[repository.ops.getOrCreateRepositoryOp] Successfully created repository: ${repositoryName}:${branch}`,
      );
    } else {
      logger.error(
        `[repository.ops.getOrCreateRepositoryOp] Failed to create repository: ${repositoryName}:${branch}`,
      );
    }

    return repository;
  } catch (error: any) {
    logger.error(
      `[repository.ops.getOrCreateRepositoryOp] Error for ${repositoryName}:${branch}: ${error.message}`,
      { error: error.toString() },
    );
    throw error;
  }
}

/**
 * Find repository by name and branch
 */
export async function findRepositoryOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
): Promise<Repository | null> {
  const logger = mcpContext.logger || console;

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    
    if (repository) {
      logger.debug(
        `[repository.ops.findRepositoryOp] Found repository: ${repositoryName}:${branch}`,
      );
    } else {
      logger.debug(
        `[repository.ops.findRepositoryOp] Repository not found: ${repositoryName}:${branch}`,
      );
    }

    return repository;
  } catch (error: any) {
    logger.error(
      `[repository.ops.findRepositoryOp] Error for ${repositoryName}:${branch}: ${error.message}`,
      { error: error.toString() },
    );
    throw error;
  }
}

/**
 * List all repositories
 */
export async function listRepositoriesOp(
  mcpContext: ToolHandlerContext,
  repositoryRepo: RepositoryRepository,
): Promise<Repository[]> {
  const logger = mcpContext.logger || console;

  try {
    const repositories = await repositoryRepo.findAll();
    
    logger.debug(
      `[repository.ops.listRepositoriesOp] Found ${repositories.length} repositories`,
    );

    return repositories;
  } catch (error: any) {
    logger.error(
      `[repository.ops.listRepositoriesOp] Error: ${error.message}`,
      { error: error.toString() },
    );
    throw error;
  }
}

/**
 * Delete repository
 */
export async function deleteRepositoryOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
): Promise<boolean> {
  const logger = mcpContext.logger || console;

  try {
    const repository = await repositoryRepo.findByName(repositoryName, branch);
    
    if (!repository) {
      logger.warn(
        `[repository.ops.deleteRepositoryOp] Repository not found: ${repositoryName}:${branch}`,
      );
      return false;
    }

    await repositoryRepo.delete(repository.id);
    const success = true; // delete method doesn't return boolean
    
    if (success) {
      logger.info(
        `[repository.ops.deleteRepositoryOp] Successfully deleted repository: ${repositoryName}:${branch}`,
      );
    } else {
      logger.error(
        `[repository.ops.deleteRepositoryOp] Failed to delete repository: ${repositoryName}:${branch}`,
      );
    }

    return success;
  } catch (error: any) {
    logger.error(
      `[repository.ops.deleteRepositoryOp] Error for ${repositoryName}:${branch}: ${error.message}`,
      { error: error.toString() },
    );
    throw error;
  }
}
