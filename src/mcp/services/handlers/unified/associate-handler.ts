import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for associate input parameters
interface AssociateParams {
  type: 'file-component' | 'tag-item';
  clientProjectRoot?: string;
  repository: string;
  branch?: string;
  // For file-component association
  fileId?: string;
  componentId?: string;
  // For tag-item association
  tagId?: string;
  itemId?: string;
  entityType?: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context';
}

/**
 * Associate Handler
 * Handles associations between entities (file-component, tag-item)
 */
export const associateHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as unknown as AssociateParams;

  // Basic validation
  if (!validatedParams.type) {
    throw new Error('type parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

  const {
    type,
    repository,
    branch = 'main',
    fileId,
    componentId,
    tagId,
    itemId,
    entityType,
  } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'associate');

  // 3. Log the operation
  logToolExecution(context, `associate operation: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    type,
  });

  try {
    switch (type) {
      case 'file-component': {
        if (!fileId || !componentId) {
          throw new Error('Required fields missing for association type');
        }

        await context.sendProgress({
          status: 'in_progress',
          message: `Associating file ${fileId} with component ${componentId}...`,
          percent: 50,
        });

        const entityService = await memoryService.entity;
        const result = await entityService.associateFileWithComponent(
          context,
          clientProjectRoot,
          repository,
          branch,
          componentId,
          fileId,
        );

        await context.sendProgress({
          status: 'complete',
          message: `File-component association created successfully`,
          percent: 100,
          isFinal: true,
        });

        return {
          success: true,
          type: 'file-component',
          fileId,
          componentId,
          message: `File ${fileId} associated with component ${componentId} successfully`,
          association: {
            from: fileId,
            to: componentId,
            relationship: 'IMPLEMENTS',
          },
        };
      }

      case 'tag-item': {
        if (!tagId || !itemId || !entityType) {
          throw new Error('Required fields missing for association type');
        }

        await context.sendProgress({
          status: 'in_progress',
          message: `Tagging ${entityType} ${itemId} with tag ${tagId}...`,
          percent: 50,
        });

        const entityService = await memoryService.entity;
        const result = await entityService.tagItem(
          context,
          clientProjectRoot,
          repository,
          branch,
          itemId,
          entityType,
          tagId,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Tag-item association created successfully`,
          percent: 100,
          isFinal: true,
        });

        return {
          success: true,
          type: 'tag-item',
          tagId,
          itemId,
          entityType,
          message: `${entityType} ${itemId} tagged with ${tagId} successfully`,
          association: {
            from: itemId,
            to: tagId,
            relationship: 'TAGGED_WITH',
          },
        };
      }

      default:
        throw new Error(`Unknown association type: ${type}`);
    }
  } catch (error) {
    await handleToolError(error, context, `${type} association`, 'associate');
    throw error; // Re-throw the error instead of returning error object
  }
};
