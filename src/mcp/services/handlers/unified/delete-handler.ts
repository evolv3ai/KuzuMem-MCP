import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, validateSession, logToolExecution } from '../../../utils/error-utils';

// TypeScript interfaces for delete input parameters
interface DeleteParams {
  operation:
    | 'single'
    | 'bulk-by-type'
    | 'bulk-by-tag'
    | 'bulk-by-branch'
    | 'bulk-by-repository'
    | 'bulk-by-filter';
  repository: string;
  branch?: string;
  clientProjectRoot?: string;

  // Single entity deletion
  entityType?: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context';
  id?: string;

  // Bulk deletion parameters
  targetType?: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context' | 'all';
  tagId?: string;
  targetBranch?: string;

  // Filter parameters
  filters?: {
    status?: string;
    createdBefore?: string;
    createdAfter?: string;
    namePattern?: string;
  };

  // Safety parameters
  confirm?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

interface DeleteResult {
  success: boolean;
  operation: string;
  message: string;
  deletedCount?: number;
  deletedEntities?: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
  dryRun?: boolean;
  warnings?: string[];
}

/**
 * Delete Handler
 * Unified handler for all deletion operations
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

  // Validate session and get client project root
  const clientProjectRoot = validateSession(context, 'delete');
  const repository = validatedParams.repository;
  const branch = validatedParams.branch || context.session.branch || 'main';

  const logger = context.logger || console;

  try {
    logToolExecution(context, 'delete', validatedParams);

    let result: DeleteResult;

    switch (validatedParams.operation) {
      case 'single':
        result = await handleSingleDeletion(
          validatedParams,
          context,
          memoryService,
          clientProjectRoot,
          repository,
          branch,
        );
        break;

      case 'bulk-by-type':
        result = await handleBulkByType(
          validatedParams,
          context,
          memoryService,
          clientProjectRoot,
          repository,
          branch,
        );
        break;

      case 'bulk-by-tag':
        result = await handleBulkByTag(
          validatedParams,
          context,
          memoryService,
          clientProjectRoot,
          repository,
          branch,
        );
        break;

      case 'bulk-by-branch':
        result = await handleBulkByBranch(
          validatedParams,
          context,
          memoryService,
          clientProjectRoot,
          repository,
        );
        break;

      case 'bulk-by-repository':
        result = await handleBulkByRepository(
          validatedParams,
          context,
          memoryService,
          clientProjectRoot,
          repository,
        );
        break;

      case 'bulk-by-filter':
        result = await handleBulkByFilter(
          validatedParams,
          context,
          memoryService,
          clientProjectRoot,
          repository,
          branch,
        );
        break;

      default:
        throw new Error(`Unknown operation: ${validatedParams.operation}`);
    }

    logger.info(`[deleteHandler] ${validatedParams.operation} completed successfully`);
    return result;
  } catch (error: any) {
    await handleToolError(error, context, 'delete', validatedParams.operation);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      operation: validatedParams.operation,
      message: `Failed to execute ${validatedParams.operation}: ${errorMessage}`,
      deletedCount: 0,
    };
  }
};

// Helper function for single entity deletion
async function handleSingleDeletion(
  params: DeleteParams,
  context: any,
  memoryService: any,
  clientProjectRoot: string,
  repository: string,
  branch: string,
): Promise<DeleteResult> {
  if (!params.entityType || !params.id) {
    throw new Error('entityType and id are required for single deletion');
  }

  const logger = context.logger || console;

  if (params.dryRun) {
    // For dry run, just check if entity exists
    let exists = false;
    try {
      switch (params.entityType) {
        case 'component':
          exists = !!(await memoryService.getComponent(
            context,
            clientProjectRoot,
            repository,
            branch,
            params.id,
          ));
          break;
        case 'decision':
          exists = !!(await memoryService.getDecision(
            context,
            clientProjectRoot,
            repository,
            branch,
            params.id,
          ));
          break;
        case 'rule':
          exists = !!(await memoryService.getRule(
            context,
            clientProjectRoot,
            repository,
            branch,
            params.id,
          ));
          break;
        case 'file':
          exists = !!(await memoryService.getFile(
            context,
            clientProjectRoot,
            repository,
            branch,
            params.id,
          ));
          break;
        case 'tag':
          exists = !!(await memoryService.getTag(
            context,
            clientProjectRoot,
            repository,
            branch,
            params.id,
          ));
          break;
        case 'context':
          // Context entities don't have a direct get method, assume exists for now
          exists = true;
          break;
      }
    } catch (error) {
      exists = false;
    }

    return {
      success: true,
      operation: 'single',
      message: exists
        ? `Would delete ${params.entityType} with ID ${params.id}`
        : `${params.entityType} with ID ${params.id} not found`,
      deletedCount: exists ? 1 : 0,
      dryRun: true,
    };
  }

  // Perform actual deletion
  let deleted = false;

  switch (params.entityType) {
    case 'component':
      deleted = await memoryService.deleteComponent(
        context,
        clientProjectRoot,
        repository,
        branch,
        params.id,
      );
      break;
    case 'decision':
      deleted = await memoryService.deleteDecision(
        context,
        clientProjectRoot,
        repository,
        branch,
        params.id,
      );
      break;
    case 'rule':
      deleted = await memoryService.deleteRule(
        context,
        clientProjectRoot,
        repository,
        branch,
        params.id,
      );
      break;
    case 'file':
      deleted = await memoryService.deleteFile(
        context,
        clientProjectRoot,
        repository,
        branch,
        params.id,
      );
      break;
    case 'tag':
      deleted = await memoryService.deleteTag(
        context,
        clientProjectRoot,
        repository,
        branch,
        params.id,
      );
      break;
    case 'context':
      deleted = await memoryService.deleteContext(
        context,
        clientProjectRoot,
        repository,
        branch,
        params.id,
      );
      break;
  }

  return {
    success: deleted,
    operation: 'single',
    message: deleted
      ? `${params.entityType} ${params.id} deleted successfully`
      : `${params.entityType} with ID ${params.id} not found`,
    deletedCount: deleted ? 1 : 0,
  };
}

// Helper function to validate bulk operation requirements
function validateBulkOperation(params: DeleteParams, requiredParam?: string): void {
  if (requiredParam && !params[requiredParam as keyof DeleteParams]) {
    throw new Error(`${requiredParam} is required for ${params.operation} deletion`);
  }

  if (!params.confirm && !params.dryRun) {
    throw new Error(
      'confirm=true is required for bulk deletion operations (or use dryRun=true to preview)',
    );
  }
}

// Helper function to format bulk operation results
function formatBulkResult(
  operation: string,
  result: any,
  dryRun?: boolean,
  operationTarget?: string,
): DeleteResult {
  const target = operationTarget || 'entities';
  return {
    success: true,
    operation,
    message: dryRun
      ? `Would delete ${result.count} ${target}`
      : `Deleted ${result.count} ${target}`,
    deletedCount: result.count,
    deletedEntities: result.entities,
    dryRun,
    warnings: result.warnings,
  };
}

// Helper function for bulk deletion by type
async function handleBulkByType(
  params: DeleteParams,
  context: any,
  memoryService: any,
  clientProjectRoot: string,
  repository: string,
  branch: string,
): Promise<DeleteResult> {
  validateBulkOperation(params, 'targetType');

  const result = await memoryService.bulkDeleteByType(
    context,
    clientProjectRoot,
    repository,
    branch,
    params.targetType,
    {
      dryRun: params.dryRun || false,
      force: params.force || false,
    },
  );

  return formatBulkResult('bulk-by-type', result, params.dryRun, `${params.targetType} entities`);
}

// Helper function for bulk deletion by tag
async function handleBulkByTag(
  params: DeleteParams,
  context: any,
  memoryService: any,
  clientProjectRoot: string,
  repository: string,
  branch: string,
): Promise<DeleteResult> {
  validateBulkOperation(params, 'tagId');

  const result = await memoryService.bulkDeleteByTag(
    context,
    clientProjectRoot,
    repository,
    branch,
    params.tagId,
    {
      dryRun: params.dryRun || false,
      force: params.force || false,
    },
  );

  return formatBulkResult(
    'bulk-by-tag',
    result,
    params.dryRun,
    `entities tagged with ${params.tagId}`,
  );
}

// Helper function for bulk deletion by branch
async function handleBulkByBranch(
  params: DeleteParams,
  context: any,
  memoryService: any,
  clientProjectRoot: string,
  repository: string,
): Promise<DeleteResult> {
  validateBulkOperation(params, 'targetBranch');

  const result = await memoryService.bulkDeleteByBranch(
    context,
    clientProjectRoot,
    repository,
    params.targetBranch,
    {
      dryRun: params.dryRun || false,
      force: params.force || false,
    },
  );

  return formatBulkResult(
    'bulk-by-branch',
    result,
    params.dryRun,
    `entities from branch ${params.targetBranch}`,
  );
}

// Helper function for bulk deletion by repository
async function handleBulkByRepository(
  params: DeleteParams,
  context: any,
  memoryService: any,
  clientProjectRoot: string,
  repository: string,
): Promise<DeleteResult> {
  validateBulkOperation(params);

  const result = await memoryService.bulkDeleteByRepository(
    context,
    clientProjectRoot,
    repository,
    {
      dryRun: params.dryRun || false,
      force: params.force || false,
    },
  );

  return formatBulkResult(
    'bulk-by-repository',
    result,
    params.dryRun,
    `entities from repository ${repository} (all branches)`,
  );
}

// Helper function for bulk deletion by filter (placeholder for now)
async function handleBulkByFilter(
  params: DeleteParams,
  context: any,
  memoryService: any,
  clientProjectRoot: string,
  repository: string,
  branch: string,
): Promise<DeleteResult> {
  throw new Error('bulk-by-filter operation not yet implemented - will be added in future version');
}
