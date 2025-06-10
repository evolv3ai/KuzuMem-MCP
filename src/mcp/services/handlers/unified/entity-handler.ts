import { SdkToolHandler } from '../../../tool-handlers';
import {
  EntityInputSchema,
  EntityOutputSchema,
  EntityGetOutputSchema,
  EntityUpdateOutputSchema,
  EntityDeleteOutputSchema,
} from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

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
        type: 'file',
        path: data.path || '',
        language: data.language,
        metrics: data.metrics,
        content_hash: data.content_hash,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
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
  // 1. Parse and validate parameters
  const validatedParams = EntityInputSchema.parse(params);
  const { operation, entityType, repository, branch = 'main', id, data } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Executing entity operation: ${operation} ${entityType}`, {
    repository,
    branch,
    id,
    clientProjectRoot,
  });

  try {
    switch (operation) {
      case 'create': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Creating ${entityType}: ${id}`,
          percent: 50,
        });

        const entityData = mapDataToEntity(entityType, id, data || {});

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
          message: `${entityType} ${id} created successfully`,
          percent: 100,
          isFinal: true,
        });

        return {
          success: true,
          message: `${entityType} ${id} created successfully`,
          entity: entityData,
        };
      }

      case 'get': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Retrieving ${entityType}: ${id}`,
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
              id,
            );
            break;
          case 'decision':
            entity = await memoryService.getDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'rule':
            entity = await memoryService.getRule(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'file':
            entity = await memoryService.getFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'tag':
            entity = await memoryService.getTag(context, clientProjectRoot, repository, branch, id);
            break;
        }

        await context.sendProgress({
          status: 'complete',
          message: entity
            ? `${entityType} ${id} retrieved successfully`
            : `${entityType} ${id} not found`,
          percent: 100,
          isFinal: true,
        });

        if (!entity) {
          return {
            success: false,
            message: `${entityType} with ID ${id} not found`,
          };
        }

        return {
          success: true,
          entity: entity,
        };
      }

      case 'update': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Updating ${entityType}: ${id}`,
          percent: 50,
        });

        const entityData = mapDataToEntity(entityType, id, data || {});
        let updatedEntity: any = null;

        // Call appropriate MemoryService update method based on entity type
        switch (entityType) {
          case 'component':
            updatedEntity = await memoryService.updateComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
              entityData as Partial<Component>,
            );
            break;
          case 'decision':
            updatedEntity = await memoryService.updateDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
              entityData as Partial<Decision>,
            );
            break;
          case 'rule':
            updatedEntity = await memoryService.updateRule(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
              entityData as Partial<Rule>,
            );
            break;
          case 'file':
            updatedEntity = await memoryService.updateFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
              entityData as Partial<FileRecord>,
            );
            break;
          case 'tag':
            updatedEntity = await memoryService.updateTag(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
              entityData as Partial<Tag>,
            );
            break;
        }

        await context.sendProgress({
          status: 'complete',
          message: updatedEntity
            ? `${entityType} ${id} updated successfully`
            : `${entityType} ${id} not found`,
          percent: 100,
          isFinal: true,
        });

        if (!updatedEntity) {
          return {
            success: false,
            message: `${entityType} with ID ${id} not found for update`,
          };
        }

        return {
          success: true,
          message: `${entityType} ${id} updated successfully`,
          entity: updatedEntity,
        };
      }

      case 'delete': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Deleting ${entityType}: ${id}`,
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
              id,
            );
            break;
          case 'decision':
            deleted = await memoryService.deleteDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'rule':
            deleted = await memoryService.deleteRule(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'file':
            deleted = await memoryService.deleteFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'tag':
            deleted = await memoryService.deleteTag(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
        }

        await context.sendProgress({
          status: 'complete',
          message: deleted
            ? `${entityType} ${id} deleted successfully`
            : `${entityType} ${id} not found`,
          percent: 100,
          isFinal: true,
        });

        return {
          success: deleted,
          message: deleted
            ? `${entityType} ${id} deleted successfully`
            : `${entityType} with ID ${id} not found`,
        };
      }

      default:
        return {
          success: false,
          message: `Unknown operation: ${operation}`,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Entity operation failed: ${errorMessage}`, {
      operation,
      entityType,
      id,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to ${operation} ${entityType}: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    return {
      success: false,
      message: `Failed to ${operation} ${entityType}: ${errorMessage}`,
    };
  }
};