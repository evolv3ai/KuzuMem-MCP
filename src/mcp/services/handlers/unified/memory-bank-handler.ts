import path from 'path';
import { MemoryService } from '../../../../services/memory.service';
import { SdkToolHandler } from '../../../tool-handlers';
import { ToolHandlerContext } from '../../../types/sdk-custom';
import { logToolExecution } from '../../../utils/error-utils';

// TypeScript interfaces for memory bank parameters
interface MemoryBankParams {
  operation: 'init' | 'get-metadata' | 'update-metadata';
  clientProjectRoot?: string;
  repository: string;
  branch?: string;
  metadata?: any;
}

/**
 * Ensures that the clientProjectRoot is available in the session context.
 * This is a copy of the function from tool-handlers.ts - should be extracted to a shared utility
 */
function ensureValidSessionContext(
  params: any,
  context: ToolHandlerContext,
  toolName: string,
): string {
  const logger = context.logger || console;
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  const sessionRepository = context.session.repository as string | undefined;
  const sessionBranch = context.session.branch as string | undefined;

  // Check if this is init operation, which establishes the context
  if (params.operation === 'init') {
    if (!params.clientProjectRoot) {
      throw new Error('clientProjectRoot is required for init operation');
    }
    return params.clientProjectRoot;
  }

  // For all other operations, verify session is properly initialized
  if (!clientProjectRoot || !sessionRepository || !sessionBranch) {
    const errorMsg = `Session not properly initialized for tool '${toolName}'. 'memory-bank' tool with 'init' operation must be called first to establish clientProjectRoot, repository, and branch for this session.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!params || typeof params !== 'object') {
    const errorMsg = `Invalid parameters for tool '${toolName}'. Expected an object with repository and branch properties.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Check that the repository and branch match what's in the session
  if (
    params.repository &&
    params.branch &&
    (sessionRepository !== params.repository || sessionBranch !== params.branch)
  ) {
    const errorMsg = `Session/Tool mismatch for tool '${toolName}': Current session is for '${sessionRepository}:${sessionBranch}', but tool is targeting '${params.repository}:${params.branch}'. Initialize a new session for the target repository/branch if needed.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Verify the client project root is absolute and exists
  if (!clientProjectRoot) {
    const errorMsg = `Invalid clientProjectRoot for tool '${toolName}'. 'memory-bank' tool with 'init' operation must be called first with a valid absolute path.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!path.isAbsolute(clientProjectRoot)) {
    const errorMsg = `Invalid clientProjectRoot path for tool '${toolName}': '${clientProjectRoot}'. Path must be absolute.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  return clientProjectRoot;
}

/**
 * Handler for init operation
 */
async function handleInit(
  params: any,
  context: ToolHandlerContext,
  memoryService: MemoryService,
): Promise<any> {
  const { clientProjectRoot, repository, branch = 'main' } = params;

  // Store in session for subsequent calls
  context.session.clientProjectRoot = clientProjectRoot;
  context.session.repository = repository;
  context.session.branch = branch;

  // Send progress for database preparation
  await context.sendProgress({
    status: 'in_progress',
    message: `Preparing database path for ${repository}...`,
    percent: 20,
  });

  try {
    // Notify about starting Kuzu initialization
    await context.sendProgress({
      status: 'in_progress',
      message: `Initializing Kuzu database client...`,
      percent: 40,
    });

    const result = await memoryService.memoryBank.initMemoryBank(
      context,
      clientProjectRoot,
      repository,
      branch,
    );

    // Send progress after database initialization is complete
    await context.sendProgress({
      status: 'in_progress',
      message: `Database client initialized successfully`,
      percent: 80,
    });

    if (!result.success) {
      throw new Error(result.message || 'Memory bank initialization failed');
    }

    // Send final success progress notification
    await context.sendProgress({
      status: 'complete',
      message: `Memory bank successfully initialized for ${repository} (branch: ${branch})`,
      percent: 100,
      isFinal: true,
    });

    return result;
  } catch (error: any) {
    // Send error progress notification
    try {
      await context.sendProgress({
        status: 'error',
        message: `Failed to initialize memory bank: ${error.message || 'Unknown error'}`,
        percent: 100,
        isFinal: true,
        error: {
          message: error.message || 'Unknown error',
          details: error.stack,
        },
      });
    } catch (progressError) {
      context.logger.error(`Failed to send error progress: ${String(progressError)}`);
    }

    throw error;
  }
}

/**
 * Handler for get-metadata operation
 */
async function handleGetMetadata(
  params: any,
  context: ToolHandlerContext,
  memoryService: MemoryService,
  clientProjectRoot: string,
): Promise<any> {
  const { repository, branch = 'main' } = params;

  const metadataService = await memoryService.metadata;
  const metadataContent = await metadataService.getMetadata(
    context,
    clientProjectRoot,
    repository,
    branch,
  );

  if (!metadataContent) {
    throw new Error(`Metadata not found for repository '${repository}' on branch '${branch}'.`);
  }

  return metadataContent;
}

/**
 * Handler for update-metadata operation
 */
async function handleUpdateMetadata(
  params: any,
  context: ToolHandlerContext,
  memoryService: MemoryService,
  clientProjectRoot: string,
): Promise<any> {
  const { repository, branch = 'main', metadata } = params;

  if (!metadata) {
    throw new Error('metadata field is required for update-metadata operation');
  }

  const metadataService = await memoryService.metadata;
  const result = await metadataService.updateMetadata(
    context,
    clientProjectRoot,
    repository,
    metadata,
    branch,
  );

  if (!result) {
    throw new Error('Failed to update metadata (service returned null).');
  }

  return result;
}

/**
 * Memory Bank Handler
 * Handles all memory bank lifecycle operations
 */
export const memoryBankHandler: SdkToolHandler = async (
  params: any,
  context: ToolHandlerContext,
  memoryService: MemoryService,
): Promise<unknown> => {
  // 1. Validate and extract parameters
  const validatedParams = params as MemoryBankParams;

  // Basic validation
  if (!validatedParams.operation) {
    throw new Error('operation parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

  // 2. Get clientProjectRoot from session (except for init)
  const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'memory-bank');

  // 3. Log the operation
  logToolExecution(context, `memory-bank operation: ${validatedParams.operation}`, {
    repository: validatedParams.repository,
    branch: validatedParams.branch || 'main',
    clientProjectRoot,
  });

  // 4. Send initial progress (for long operations)
  if (context.sendProgress) {
    await context.sendProgress({
      status: 'initializing',
      message: `Starting ${validatedParams.operation} operation...`,
      percent: 10,
    });
  }

  // 5. Operation dispatch
  switch (validatedParams.operation) {
    case 'init':
      return await handleInit(validatedParams, context, memoryService);
    case 'get-metadata':
      return await handleGetMetadata(validatedParams, context, memoryService, clientProjectRoot);
    case 'update-metadata':
      return await handleUpdateMetadata(validatedParams, context, memoryService, clientProjectRoot);
    default:
      throw new Error(`Unknown operation: ${validatedParams.operation}`);
  }
};
