import { SdkToolHandler } from '../../../tool-handlers';
import { Component, Decision, Rule, FileRecord, Tag } from '../../../../types/memory-types';
import {
  EntityInputSchema,
  EntityCreateOutputSchema,
  EntityGetOutputSchema,
  EntityUpdateOutputSchema,
  EntityDeleteOutputSchema,
} from '../../../schemas/unified-tool-schemas';

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

        // For now, we'll need to implement get methods in MemoryService
        // or use graph queries to retrieve individual entities
        // This is a placeholder that would need actual implementation
        return {
          success: false,
          message: `Get operation not yet implemented for ${entityType}`,
        };
      }

      case 'update': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Updating ${entityType}: ${id}`,
          percent: 50,
        });

        // Similar to get, update would need MemoryService methods
        // For now, we can implement update as delete + create
        const entityData = mapDataToEntity(entityType, id, data || {});

        // This is a simplified approach - in production, you'd want
        // proper update methods in MemoryService
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
          message: `${entityType} ${id} updated successfully`,
          percent: 100,
          isFinal: true,
        });

        return {
          success: true,
          message: `${entityType} ${id} updated successfully`,
          entity: entityData,
        };
      }

      case 'delete': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Deleting ${entityType}: ${id}`,
          percent: 50,
        });

        // Deletion would also need MemoryService methods
        // For now, we'll mark as deprecated/inactive
        return {
          success: false,
          message: `Delete operation not yet implemented for ${entityType}`,
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