import { SdkToolHandler } from '../../../tool-handlers';
import { AssociateInputSchema, AssociateOutputSchema } from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

/**
 * Associate Handler
 * Handles relationship creation between entities
 */
export const associateHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = AssociateInputSchema.parse(params);
  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Creating association: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
  });

  // 4. Validate type-specific required parameters
  switch (type) {
    case 'file-component':
      if (!validatedParams.fileId || !validatedParams.componentId) {
        throw new Error('fileId and componentId are required for file-component association');
      }
      break;
    case 'tag-item':
      if (!validatedParams.itemId || !validatedParams.tagId) {
        throw new Error('itemId and tagId are required for tag-item association');
      }
      break;
  }

  try {
    switch (type) {
      case 'file-component': {
        const { fileId, componentId } = validatedParams;

        await context.sendProgress({
          status: 'in_progress',
          message: `Associating file ${fileId} with component ${componentId}...`,
          percent: 50,
        });

        // Call the service method
        const result = await memoryService.associateFileWithComponent(
          context,
          clientProjectRoot,
          repository,
          branch,
          componentId!,
          fileId!,
        );

        await context.sendProgress({
          status: 'complete',
          message: 'File-component association created successfully',
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'file-component' as const,
          success: true,
          message: `Successfully associated file ${fileId} with component ${componentId}`,
          association: {
            from: fileId!,
            to: componentId!,
            relationship: 'IMPLEMENTS',
          },
        } satisfies z.infer<typeof AssociateOutputSchema>;
      }

      case 'tag-item': {
        const { itemId, tagId } = validatedParams;

        await context.sendProgress({
          status: 'in_progress',
          message: `Tagging item ${itemId} with tag ${tagId}...`,
          percent: 50,
        });

        // Call the service method
        const result = await memoryService.tagItem(
          context,
          clientProjectRoot,
          repository,
          branch,
          itemId!,
          'Component',
          tagId!,
        );

        await context.sendProgress({
          status: 'complete',
          message: 'Tag-item association created successfully',
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'tag-item' as const,
          success: true,
          message: `Successfully tagged item ${itemId} with tag ${tagId}`,
          association: {
            from: itemId!,
            to: tagId!,
            relationship: 'TAGGED_WITH',
          },
        } satisfies z.infer<typeof AssociateOutputSchema>;
      }

      default:
        throw new Error(`Unknown association type: ${type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Association failed: ${errorMessage}`, {
      type,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to create ${type} association: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    throw error;
  }
};