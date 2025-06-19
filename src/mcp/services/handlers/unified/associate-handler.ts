import { AssociateInputSchema } from '../../../schemas/unified-tool-schemas';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for associate parameters
interface AssociateParams {
  type: 'file-component' | 'tag-item';
  repository: string;
  branch?: string;
  fileId?: string;
  componentId?: string;
  itemId?: string;
  tagId?: string;
  entityType?: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context';
}

/**
 * Associate Handler
 * Handles relationship creation between entities
 */
export const associateHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters using Zod schema
  const validatedParams = AssociateInputSchema.parse(params) as AssociateParams;

  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'associate');
  if (!memoryService.services) {
    throw new Error('ServiceRegistry not initialized in MemoryService');
  }

  // 3. Log the operation
  logToolExecution(context, `association: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
  });

  // 4. Type-specific validation is now handled by the Zod schema

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
        const result = await memoryService.services.entity.associateFileWithComponent(
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
        };
      }

      case 'tag-item': {
        const { itemId, tagId, entityType } = validatedParams;

        await context.sendProgress({
          status: 'in_progress',
          message: `Tagging ${entityType} ${itemId} with tag ${tagId}...`,
          percent: 50,
        });

        // Call the service method
        const result = await memoryService.services.entity.tagItem(
          context,
          clientProjectRoot,
          repository,
          branch,
          itemId!,
          entityType!,
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
          message: `Successfully tagged ${entityType} ${itemId} with tag ${tagId}`,
          association: {
            from: itemId!,
            to: tagId!,
            relationship: 'TAGGED_WITH',
          },
        };
      }

      default:
        throw new Error(`Unknown association type: ${type}`);
    }
  } catch (error) {
    await handleToolError(error, context, `${type} association`, type);
    throw error;
  }
};
