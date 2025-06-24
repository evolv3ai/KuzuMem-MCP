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
 * Enhanced validation helper functions
 */
function validateAndTrimString(
  value: unknown,
  fieldName: string,
  required: boolean = true,
): string | undefined {
  if (value === null || value === undefined) {
    if (required) {
      throw new Error(`${fieldName} parameter is required`);
    }
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} parameter must be a string, received ${typeof value}`);
  }

  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new Error(`${fieldName} parameter cannot be empty or whitespace-only`);
  }

  return trimmed.length > 0 ? trimmed : undefined;
}

function validateEntityId(id: string, expectedPrefix: string, fieldName: string): void {
  if (!id.startsWith(expectedPrefix)) {
    throw new Error(`${fieldName} must start with '${expectedPrefix}', received: ${id}`);
  }

  // Check for valid characters (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
    throw new Error(
      `${fieldName} contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed: ${id}`,
    );
  }

  // Check minimum length (prefix + at least 1 character)
  if (id.length <= expectedPrefix.length) {
    throw new Error(`${fieldName} must have content after the prefix '${expectedPrefix}': ${id}`);
  }
}

function validateEntityType(entityType: string): void {
  const validTypes = ['Component', 'Decision', 'Rule', 'File', 'Context'];
  if (!validTypes.includes(entityType)) {
    throw new Error(`entityType must be one of: ${validTypes.join(', ')}. Received: ${entityType}`);
  }
}

function validateAssociationType(type: string): void {
  const validTypes = ['file-component', 'tag-item'];
  if (!validTypes.includes(type)) {
    throw new Error(`type must be one of: ${validTypes.join(', ')}. Received: ${type}`);
  }
}

/**
 * Associate Handler
 * Handles associations between entities (file-component, tag-item)
 */
export const associateHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Enhanced parameter validation and extraction
  const validatedParams = params as unknown as AssociateParams;

  // Enhanced validation with trimming and type checking
  const type = validateAndTrimString(validatedParams.type, 'type', true)!;
  const repository = validateAndTrimString(validatedParams.repository, 'repository', true)!;
  const branch = validateAndTrimString(validatedParams.branch, 'branch', false) || 'main';

  // Validate association type format
  validateAssociationType(type);

  // Validate repository name format (basic alphanumeric check)
  if (!/^[a-zA-Z0-9-_]+$/.test(repository)) {
    throw new Error(
      `repository name contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed: ${repository}`,
    );
  }

  // Validate branch name format (basic git branch name check)
  if (!/^[a-zA-Z0-9-_/.]+$/.test(branch)) {
    throw new Error(`branch name contains invalid characters: ${branch}`);
  }

  // Extract and validate type-specific parameters
  const fileId = validateAndTrimString(validatedParams.fileId, 'fileId', false);
  const componentId = validateAndTrimString(validatedParams.componentId, 'componentId', false);
  const tagId = validateAndTrimString(validatedParams.tagId, 'tagId', false);
  const itemId = validateAndTrimString(validatedParams.itemId, 'itemId', false);
  const entityType = validateAndTrimString(validatedParams.entityType, 'entityType', false);

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
          throw new Error('fileId and componentId are required for file-component association');
        }

        // Enhanced validation for file-component association
        validateEntityId(fileId, 'file-', 'fileId');
        validateEntityId(componentId, 'comp-', 'componentId');

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
          throw new Error('tagId, itemId, and entityType are required for tag-item association');
        }

        // Enhanced validation for tag-item association
        validateEntityId(tagId, 'tag-', 'tagId');
        validateEntityType(entityType);

        // Validate itemId based on entityType
        const entityPrefixes: Record<string, string> = {
          Component: 'comp-',
          Decision: 'dec-',
          Rule: 'rule-',
          File: 'file-',
          Context: 'ctx-',
        };

        const expectedPrefix = entityPrefixes[entityType];
        validateEntityId(itemId, expectedPrefix, 'itemId');

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
