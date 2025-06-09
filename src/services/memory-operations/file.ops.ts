import { z } from 'zod';
import {
  AddFileInputSchema,
  AddFileOutputSchema,
  AssociateFileWithComponentOutputSchema,
  FileNodeSchema,
} from '../../mcp/schemas/tool-schemas';
import { FileRepository, RepositoryRepository } from '../../repositories';
import { File } from '../../types'; // Internal File type

// Simple context type to avoid SDK import issues
type McpContext = {
  logger?: any;
};

/**
 * Operation to add a new file node.
 */
export async function addFileOp(
  mcpContext: McpContext,
  repositoryName: string,
  branch: string,
  fileDataFromTool: z.infer<typeof AddFileInputSchema>,
  repositoryRepo: RepositoryRepository,
  fileRepo: FileRepository,
): Promise<z.infer<typeof AddFileOutputSchema>> {
  // Output matches Zod schema for the tool
  const logger = mcpContext.logger || console;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.info(`[file.ops] addFileOp called for path ${fileDataFromTool.path} in ${repoIdForLog}`);

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(`[file.ops] Repository ${repoIdForLog} not found for addFileOp.`);
      return { success: false, message: `Repository ${repoIdForLog} not found.` };
    }

    // Transform Zod input to internal File type fields expected by FileRepository.createFileNode
    // Omit repository, branch, created_at, updated_at as repo method handles them
    const fileRepoInput: Omit<File, 'repository' | 'branch' | 'created_at' | 'updated_at'> & {
      id: string;
    } = {
      id: fileDataFromTool.id,
      name: fileDataFromTool.name,
      path: fileDataFromTool.path,
      size: fileDataFromTool.size_bytes || undefined, // Map size_bytes to size
      mime_type: fileDataFromTool.mime_type,
    };

    const createdFileNode = await fileRepo.createFileNode(repoNode.id, branch, fileRepoInput);

    if (!createdFileNode) {
      logger.error(
        `[file.ops] FileRepository.createFileNode returned null for ${fileDataFromTool.path}`,
      );
      return { success: false, message: 'Failed to create file node in repository.' };
    }

    const zodFileNode: z.infer<typeof FileNodeSchema> = {
      ...createdFileNode,
      // Map File interface properties to schema expectations
      language: null, // Not in File interface
      metrics: null, // Not in File interface
      content_hash: null, // Not in File interface
      mime_type: createdFileNode.mime_type || null,
      size_bytes: createdFileNode.size || null, // Map size to size_bytes
      created_at: createdFileNode.created_at
        ? createdFileNode.created_at instanceof Date
          ? createdFileNode.created_at.toISOString()
          : String(createdFileNode.created_at)
        : null,
      updated_at: createdFileNode.updated_at
        ? createdFileNode.updated_at instanceof Date
          ? createdFileNode.updated_at.toISOString()
          : String(createdFileNode.updated_at)
        : null,
      repository: repoIdForLog,
      branch: branch,
    };

    logger.info(
      `[file.ops] File node ${createdFileNode.id} created successfully in ${repoIdForLog}`,
    );
    return { success: true, message: 'File added successfully.', file: zodFileNode };
  } catch (error: any) {
    logger.error(`[file.ops] Error in addFileOp for ${fileDataFromTool.path}: ${error.message}`, {
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
  mcpContext: McpContext,
  repositoryName: string,
  branch: string,
  componentId: string,
  fileId: string,
  repositoryRepo: RepositoryRepository,
  fileRepo: FileRepository,
  // componentRepo: ComponentRepository // May not be needed if FileRepo handles the link
): Promise<z.infer<typeof AssociateFileWithComponentOutputSchema>> {
  const logger = mcpContext.logger || console;
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

    // Use schema-defined relationship type
    const relationshipType = 'CONTAINS_FILE';

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
