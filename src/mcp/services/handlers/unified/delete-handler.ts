import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for delete input parameters
interface DeleteParams {
  operation:
    | 'single'
    | 'bulk-by-type'
    | 'bulk-by-tag'
    | 'bulk-by-branch'
    | 'bulk-by-repository'
    | 'bulk-by-filter';
  clientProjectRoot?: string;
  repository: string;
  branch?: string;
  confirm?: boolean;
  dryRun?: boolean;
  force?: boolean;
  // Single operation
  entityType?: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context';
  id?: string;
  // Bulk operations
  targetType?: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context' | 'all';
  tagId?: string;
  targetBranch?: string;
  // Filter operations
  filterNamePattern?: string;
  filterStatus?: string;
  filterCreatedBefore?: string;
  filterCreatedAfter?: string;
}

/**
 * Delete Handler
 * Handles deletion operations (single, bulk, filtered)
 */
export const deleteHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as unknown as DeleteParams;

  // Basic validation
  if (!validatedParams.operation) {
    throw new Error('operation parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

  const {
    operation,
    repository,
    branch = 'main',
    confirm = false,
    dryRun = false,
    force = false,
    entityType,
    id,
    targetType,
    tagId,
    targetBranch,
    filterNamePattern,
    filterStatus,
    filterCreatedBefore,
    filterCreatedAfter,
  } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'delete');

  // 3. Log the operation
  logToolExecution(context, `delete operation: ${operation}`, {
    repository,
    branch,
    clientProjectRoot,
    operation,
    dryRun,
  });

  try {
    switch (operation) {
      case 'single': {
        if (!entityType || !id) {
          throw new Error('entityType and id are required for single deletion');
        }

        // Check if entity exists (skip for context entities as they use different access pattern)
        let exists = true; // Default to true, will be caught during deletion if not found
        const entityService = await memoryService.entity;

        if (entityType !== 'context') {
          switch (entityType) {
            case 'component':
              exists = !!(await entityService.getComponent(
                context,
                clientProjectRoot,
                repository,
                branch,
                id,
              ));
              break;
            case 'decision':
              exists = !!(await entityService.getDecision(
                context,
                clientProjectRoot,
                repository,
                branch,
                id,
              ));
              break;
            case 'rule':
              exists = !!(await entityService.getRule(
                context,
                clientProjectRoot,
                repository,
                branch,
                id,
              ));
              break;
            case 'file':
              exists = !!(await entityService.getFile(
                context,
                clientProjectRoot,
                repository,
                branch,
                id,
              ));
              break;
            case 'tag':
              exists = !!(await entityService.getTag(
                context,
                clientProjectRoot,
                repository,
                branch,
                id,
              ));
              break;
            default:
              throw new Error(`Unsupported entity type: ${entityType}`);
          }

          if (!exists) {
            return {
              success: false,
              operation: 'single',
              deletedCount: 0,
              message: `${entityType} with ID ${id} not found`,
            };
          }
        }

        if (dryRun) {
          return {
            success: true,
            operation: 'single',
            dryRun: true,
            deletedCount: 1,
            message: `Would delete ${entityType} with ID ${id}`,
          };
        }

        // Perform actual deletion
        let deleted = false;
        switch (entityType) {
          case 'component':
            deleted = await entityService.deleteComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'decision':
            deleted = await entityService.deleteDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'rule':
            deleted = await entityService.deleteRule(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'file':
            deleted = await entityService.deleteFile(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'tag':
            deleted = await entityService.deleteTag(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
          case 'context':
            deleted = await entityService.deleteContext(
              context,
              clientProjectRoot,
              repository,
              branch,
              id,
            );
            break;
        }

        return {
          success: deleted,
          operation: 'single',
          deletedCount: deleted ? 1 : 0,
          message: deleted
            ? `${entityType} ${id} deleted successfully`
            : `Failed to delete ${entityType} ${id}`,
        };
      }

      case 'bulk-by-type': {
        if (!targetType) {
          throw new Error('targetType is required for bulk-by-type deletion');
        }

        if (!confirm && !dryRun) {
          throw new Error(
            'confirm=true is required for bulk deletion operations (or use dryRun=true to preview)',
          );
        }

        const entityService = await memoryService.entity;
        const result = await entityService.bulkDeleteByType(
          context,
          clientProjectRoot,
          repository,
          branch,
          targetType,
          { dryRun, force },
        );

        return {
          success: true,
          operation: 'bulk-by-type',
          message: dryRun
            ? `Would delete ${result.count || 0} ${targetType} entities`
            : `Deleted ${result.count || 0} ${targetType} entities`,
          deletedCount: result.count || 0,
          deletedEntities: result.entities || [],
          dryRun: dryRun || undefined,
          warnings: result.warnings || [],
        };
      }

      case 'bulk-by-tag': {
        if (!tagId) {
          throw new Error('tagId is required for bulk-by-tag deletion');
        }

        if (!confirm && !dryRun) {
          throw new Error(
            'confirm=true is required for bulk deletion operations (or use dryRun=true to preview)',
          );
        }

        const entityService = await memoryService.entity;
        const result = await entityService.bulkDeleteByTag(
          context,
          clientProjectRoot,
          repository,
          branch,
          tagId,
          { dryRun, force },
        );

        return {
          success: true,
          operation: 'bulk-by-tag',
          message: dryRun
            ? `Would delete ${result.count || 0} entities tagged with ${tagId}`
            : `Deleted ${result.count || 0} entities tagged with ${tagId}`,
          deletedCount: result.count || 0,
          deletedEntities: result.entities || [],
          dryRun: dryRun || undefined,
          warnings: result.warnings || [],
        };
      }

      case 'bulk-by-branch': {
        if (!targetBranch) {
          throw new Error('targetBranch is required for bulk-by-branch deletion');
        }

        if (!confirm && !dryRun) {
          throw new Error(
            'confirm=true is required for bulk deletion operations (or use dryRun=true to preview)',
          );
        }

        const entityService = await memoryService.entity;
        const result = await entityService.bulkDeleteByBranch(
          context,
          clientProjectRoot,
          repository,
          targetBranch,
          { dryRun, force },
        );

        return {
          success: true,
          operation: 'bulk-by-branch',
          message: dryRun
            ? `Would delete ${result.count || 0} entities from branch ${targetBranch}`
            : `Deleted ${result.count || 0} entities from branch ${targetBranch}`,
          deletedCount: result.count || 0,
          deletedEntities: result.entities || [],
          dryRun: dryRun || undefined,
          warnings: result.warnings || [],
        };
      }

      case 'bulk-by-repository': {
        if (!confirm && !dryRun) {
          throw new Error(
            'confirm=true is required for bulk deletion operations (or use dryRun=true to preview)',
          );
        }

        const entityService = await memoryService.entity;
        const result = await entityService.bulkDeleteByRepository(
          context,
          clientProjectRoot,
          repository,
          { dryRun, force },
        );

        return {
          success: true,
          operation: 'bulk-by-repository',
          message: dryRun
            ? `Would delete ${result.count || 0} entities from repository ${repository} (all branches)`
            : `Deleted ${result.count || 0} entities from repository ${repository} (all branches)`,
          deletedCount: result.count || 0,
          deletedEntities: result.entities || [],
          dryRun: dryRun || undefined,
          warnings: result.warnings || [],
        };
      }

      case 'bulk-by-filter': {
        throw new Error(
          'bulk-by-filter operation not yet implemented - will be added in future version',
        );
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    await handleToolError(error, context, `delete ${operation}`, 'delete');

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      operation,
      deletedCount: 0,
      message: `Failed to execute ${operation}: ${errorMessage}`,
    };
  }
};
