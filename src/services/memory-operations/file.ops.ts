import { KuzuDBClient } from '../../db/kuzu';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { FileRepository, RepositoryRepository } from '../../repositories';
import { File, FileInput } from '../../types';

// Result types for operations
interface FileOperationResult {
  success: boolean;
  message: string;
  file?: File;
}

interface AssociationResult {
  success: boolean;
  message: string;
}

/**
 * Operation to add a new file node.
 */
export async function addFileOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  fileData: FileInput,
  repositoryRepo: RepositoryRepository,
  fileRepo: FileRepository,
): Promise<FileOperationResult> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.info(`[file.ops] addFileOp called for path ${fileData.path} in ${repoIdForLog}`);

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(`[file.ops] Repository ${repoIdForLog} not found for addFileOp.`);
      return { success: false, message: `Repository ${repoIdForLog} not found.` };
    }

    // Transform input to internal File type
    const fileRepoInput: Omit<File, 'created_at' | 'updated_at'> = {
      id: fileData.id,
      repository: repoNode.id,
      branch: branch,
      name: fileData.name,
      path: fileData.path,
      content: fileData.content || null,
      metrics: fileData.metrics || null,
    };

    const createdFileNode = await fileRepo.createFileNode(repoNode.id, branch, fileRepoInput);

    if (!createdFileNode) {
      logger.error(`[file.ops] FileRepository.createFileNode returned null for ${fileData.path}`);
      return { success: false, message: 'Failed to create file node in repository.' };
    }

    // Normalize the file to ensure consistent structure
    const normalizedFile: File = {
      ...createdFileNode,
      repository: repositoryName,
      branch: branch,
    };

    logger.info(
      `[file.ops] File node ${createdFileNode.id} created successfully in ${repoIdForLog}`,
    );
    return {
      success: true,
      message: 'File added successfully.',
      file: normalizedFile,
    };
  } catch (error: any) {
    logger.error(`[file.ops] Error in addFileOp for ${fileData.path}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    return {
      success: false,
      message: error.message || 'An unexpected error occurred while adding the file.',
    };
  }
}

/**
 * Operation to associate a file with a component.
 */
export async function associateFileWithComponentOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  componentId: string,
  fileId: string,
  repositoryRepo: RepositoryRepository,
  fileRepo: FileRepository,
): Promise<AssociationResult> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.info(
    `[file.ops] associateFileWithComponentOp: C:${componentId} F:${fileId} in ${repoIdForLog}`,
  );

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(
        `[file.ops] Repository ${repoIdForLog} not found for associateFileWithComponentOp.`,
      );
      return { success: false, message: `Repository ${repoIdForLog} not found.` };
    }

    // Use a consistent relationship type
    const relationshipType = 'IMPLEMENTS';

    const success = await fileRepo.linkComponentToFile(
      repoNode.id,
      branch,
      componentId,
      fileId,
      relationshipType,
    );

    if (!success) {
      logger.warn(
        `[file.ops] fileRepo.linkComponentToFile failed for C:${componentId}, F:${fileId}`,
      );
      return { success: false, message: 'Failed to associate file with component in repository.' };
    }

    logger.info(
      `[file.ops] File ${fileId} successfully associated with component ${componentId} via ${relationshipType}.`,
    );
    return { success: true, message: 'File associated with component.' };
  } catch (error: any) {
    logger.error(
      `[file.ops] Error in associateFileWithComponentOp for C:${componentId}, F:${fileId}: ${error.message}`,
      { error: error.toString(), stack: error.stack },
    );
    return { success: false, message: error.message || 'An unexpected error occurred.' };
  }
}

// Note: getFilesOp removed as FileRepository doesn't have a getAllFiles method.
// File queries can be done through component associations using findFilesByComponent.

export async function deleteFileOp(
  mcpContext: EnrichedRequestHandlerExtra,
  kuzuClient: KuzuDBClient,
  repositoryRepo: RepositoryRepository,
  repositoryName: string,
  branch: string,
  fileId: string,
): Promise<boolean> {
  const logger = mcpContext.logger;

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(`[file.ops.deleteFileOp] Repository ${repositoryName}:${branch} not found.`);
    return false;
  }

  const graphUniqueId = `${repositoryName}:${branch}:${fileId}`;
  const deleteQuery = `
    MATCH (f:File {graph_unique_id: $graphUniqueId})
    DETACH DELETE f
    RETURN 1 as deletedCount
  `;

  const result = await kuzuClient.executeQuery(deleteQuery, { graphUniqueId });
  const deletedCount = result[0]?.deletedCount || 0;

  logger.info(`[file.ops.deleteFileOp] Deleted ${deletedCount} file(s) with ID ${fileId}`);
  return deletedCount > 0;
}
