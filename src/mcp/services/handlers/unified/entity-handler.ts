import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, validateSession, logToolExecution } from '../../../utils/error-utils';

// TypeScript interfaces for entity input parameters
interface EntityParams {
  operation: 'create' | 'update' | 'get' | 'delete';
  entityType: 'component' | 'decision' | 'rule' | 'file' | 'tag';
  repository: string;
  branch?: string;
  id?: string;
  data?: any;
}

// Type aliases for clarity
type Component = any;
type Decision = any;
type Rule = any;
type FileRecord = any;
type Tag = any;

// Union type for all entity data structures
type EntityData = Component | Decision | Rule | FileRecord | Tag;

// Helper to map entity data to the appropriate type
function mapDataToEntity(entityType: string, id: string, data: any): EntityData {
  switch (entityType) {
    case 'component':
      return {
        id,
        name: data.name || '',
        type: 'component',
        kind: data.kind || 'service',
        status: data.status || 'active',
        depends_on: data.depends_on || [],
      } as Component;

    case 'decision':
      return {
        id,
        name: data.name || '',
        type: 'decision',
        date: data.date || new Date().toISOString().split('T')[0],
        context: data.context || '',
        status: data.decisionStatus || 'accepted',
      } as Decision;

    case 'rule':
      return {
        id,
        name: data.name || '',
        type: 'rule',
        created: data.created || new Date().toISOString().split('T')[0],
        content: data.content || '',
        triggers: data.triggers || [],
        status: data.ruleStatus || 'active',
      } as Rule;

    case 'file':
      return {
        id,
        name: data.name || '',
        path: data.path || '',
        size: data.size_bytes || data.size || 0, // Map size_bytes to size for File interface compatibility
        mime_type: data.mime_type,
        content: data.content,
        metrics: data.metrics,
        language: data.language, // Include language property expected by tools
        content_hash: data.content_hash, // Include content_hash property expected by tools
        // Note: BaseEntity properties like repository, branch, created_at, updated_at
        // are handled by the service layer, not in this mapping function
      } as FileRecord;

    case 'tag':
      return {
        id,
        name: data.name || '',
        type: 'tag',
        color: data.color || '#3b82f6',
        description: data.description || '',
        category: data.category || 'general',
      } as Tag;

    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

/**
 * Entity Handler
 * Unified handler for all entity CRUD operations
 */
export const entityHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as EntityParams;

  // Basic validation
  if (!validatedParams.operation) {
    throw new Error('operation parameter is required');
  }
  if (!validatedParams.entityType) {
    throw new Error('entityType parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

  const { operation, entityType, repository, branch = 'main', id, data } = validatedParams;

  // Additional validation for operations that require an id
  if (['get', 'update', 'delete'].includes(operation) && !id) {
    throw new Error(`id parameter is required for ${operation} operation`);
  }

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'entity');

  // 3. Log the operation
  logToolExecution(context, `entity operation: ${operation} ${entityType}`, {
    repository,
    branch,
    clientProjectRoot,
    id,
  });

  try {
    switch (operation) {
      case 'create': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Creating ${entityType}: ${id || 'new'}`,
          percent: 50,
        });

        const entityId = id || (data && data.id);
        if (!entityId) {
          throw new Error(
            'id is required for create operation (either as id parameter or data.id)',
          );
        }

        const entityData = mapDataToEntity(entityType, entityId, data || {});

        // Call appropriate MemoryService method based on entity type
        switch (entityType) {
          case 'component':
            await memoryService.upsertComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityData as Component,
            );
            break;
          case 'decision':
            await memoryService.upsertDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityData as Decision,
            );
            break;
          case 'rule':
            await memoryService.upsertRule(
              context,
              clientProjectRoot,
              repository,
              entityData as Rule,
              branch,
            );
            break;
          case 'file':
            await memoryService.addFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityData as FileRecord,
            );
            break;
          case 'tag':
            await memoryService.addTag(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityData as Tag,
            );
            break;
        }

        await context.sendProgress({
          status: 'complete',
          message: `${entityType} ${entityId} created successfully`,
          percent: 100,
          isFinal: true,
        });

        return {
          success: true,
          message: `${entityType} ${entityId} created successfully`,
          entity: entityData,
        };
      }

      case 'get': {
        // id is guaranteed to be defined due to validation above
        const entityId = id!;

        await context.sendProgress({
          status: 'in_progress',
          message: `Retrieving ${entityType}: ${entityId}`,
          percent: 50,
        });

        let entity: any = null;

        // Call appropriate MemoryService get method based on entity type
        switch (entityType) {
          case 'component':
            entity = await memoryService.getComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'decision':
            entity = await memoryService.getDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'rule':
            entity = await memoryService.getRule(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'file':
            entity = await memoryService.getFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'tag':
            entity = await memoryService.getTag(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
        }

        await context.sendProgress({
          status: 'complete',
          message: entity
            ? `${entityType} ${entityId} retrieved successfully`
            : `${entityType} ${entityId} not found`,
          percent: 100,
          isFinal: true,
        });

        if (!entity) {
          return {
            success: false,
            message: `${entityType} with ID ${entityId} not found`,
          };
        }

        return {
          success: true,
          entity: entity,
        };
      }

      case 'update': {
        // id is guaranteed to be defined due to validation above
        const entityId = id!;

        await context.sendProgress({
          status: 'in_progress',
          message: `Updating ${entityType}: ${entityId}`,
          percent: 50,
        });

        const entityData = mapDataToEntity(entityType, entityId, data || {});
        let updatedEntity: any = null;

        // Call appropriate MemoryService update method based on entity type
        switch (entityType) {
          case 'component':
            updatedEntity = await memoryService.updateComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
              entityData as Partial<Component>,
            );
            break;
          case 'decision':
            updatedEntity = await memoryService.updateDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
              entityData as Partial<Decision>,
            );
            break;
          case 'rule':
            updatedEntity = await memoryService.updateRule(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
              entityData as Partial<Rule>,
            );
            break;
          case 'file':
            updatedEntity = await memoryService.updateFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
              entityData as Partial<FileRecord>,
            );
            break;
          case 'tag':
            updatedEntity = await memoryService.updateTag(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
              entityData as Partial<Tag>,
            );
            break;
        }

        await context.sendProgress({
          status: 'complete',
          message: updatedEntity
            ? `${entityType} ${entityId} updated successfully`
            : `${entityType} ${entityId} not found`,
          percent: 100,
          isFinal: true,
        });

        if (!updatedEntity) {
          return {
            success: false,
            message: `${entityType} with ID ${entityId} not found for update`,
          };
        }

        return {
          success: true,
          message: `${entityType} ${entityId} updated successfully`,
          entity: updatedEntity,
        };
      }

      case 'delete': {
        // id is guaranteed to be defined due to validation above
        const entityId = id!;

        await context.sendProgress({
          status: 'in_progress',
          message: `Deleting ${entityType}: ${entityId}`,
          percent: 50,
        });

        let deleted = false;

        // Call appropriate MemoryService delete method based on entity type
        switch (entityType) {
          case 'component':
            deleted = await memoryService.deleteComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'decision':
            deleted = await memoryService.deleteDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'rule':
            deleted = await memoryService.deleteRule(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'file':
            deleted = await memoryService.deleteFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
          case 'tag':
            deleted = await memoryService.deleteTag(
              context,
              clientProjectRoot,
              repository,
              branch,
              entityId,
            );
            break;
        }

        await context.sendProgress({
          status: 'complete',
          message: deleted
            ? `${entityType} ${entityId} deleted successfully`
            : `${entityType} ${entityId} not found`,
          percent: 100,
          isFinal: true,
        });

        return {
          success: deleted,
          message: deleted
            ? `${entityType} ${entityId} deleted successfully`
            : `${entityType} with ID ${entityId} not found`,
        };
      }

      default:
        return {
          success: false,
          message: `Unknown operation: ${operation}`,
        };
    }
  } catch (error) {
    await handleToolError(error, context, `${operation} ${entityType}`, entityType);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to ${operation} ${entityType}: ${errorMessage}`,
    };
  }
};
