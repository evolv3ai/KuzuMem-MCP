import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for context input parameters
interface ContextParams {
  operation: 'update';
  agent?: string;
  summary?: string;
  observation?: string;
  repository: string;
  branch: string;
  clientProjectRoot?: string;
}

/**
 * Enhanced validation helper functions for context parameters
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

function validateOperation(operation: unknown): 'update' {
  const validatedOp = validateAndTrimString(operation, 'operation', true);

  if (validatedOp !== 'update') {
    throw new Error(`operation must be 'update', received: ${validatedOp}`);
  }

  return validatedOp as 'update';
}

function validateRepositoryName(repository: string): void {
  if (!/^[a-zA-Z0-9-_]+$/.test(repository)) {
    throw new Error(
      `repository name contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed: ${repository}`,
    );
  }
}

function validateBranchName(branch: string): void {
  if (!/^[a-zA-Z0-9-_/.]+$/.test(branch)) {
    throw new Error(`branch name contains invalid characters: ${branch}`);
  }
}

/**
 * Type guard function to safely validate and cast params to ContextParams
 */
function validateContextParams(params: unknown): ContextParams {
  if (!params || typeof params !== 'object') {
    throw new Error('params must be an object');
  }

  const paramsObj = params as Record<string, unknown>;

  // Validate required fields
  const operation = validateOperation(paramsObj.operation);
  const repository = validateAndTrimString(paramsObj.repository, 'repository', true)!;

  // Validate repository format
  validateRepositoryName(repository);

  // Validate optional fields
  const agent = validateAndTrimString(paramsObj.agent, 'agent', false);
  const summary = validateAndTrimString(paramsObj.summary, 'summary', false);
  const observation = validateAndTrimString(paramsObj.observation, 'observation', false);
  const branchInput = validateAndTrimString(paramsObj.branch, 'branch', false);
  const branch = (branchInput || 'main') as string;
  const clientProjectRoot = validateAndTrimString(
    paramsObj.clientProjectRoot,
    'clientProjectRoot',
    false,
  );

  // Validate branch format
  validateBranchName(branch);

  // Additional validation for update operation
  if (operation === 'update' && !summary) {
    throw new Error('summary parameter is required for update operation');
  }

  return {
    operation,
    repository,
    branch,
    agent,
    summary,
    observation,
    clientProjectRoot,
  };
}

/**
 * Context Handler
 * Handles context update operations
 */
export const contextHandler: SdkToolHandler = async (params, context, memoryService) => {
  try {
    // 1. Enhanced parameter validation using type guard function
    const validatedParams = validateContextParams(params);

    const { operation, agent, summary, observation, repository, branch } = validatedParams;

    // 2. Validate session and get clientProjectRoot
    const clientProjectRoot = validateSession(context, 'context');
    const contextService = await memoryService.context;

    // 3. Log the operation
    logToolExecution(context, `context operation: ${operation}`, {
      repository,
      branch,
      clientProjectRoot,
      agent,
    });

    switch (operation) {
      case 'update': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Updating context...',
          percent: 50,
        });

        // Build the parameters object that matches ContextInputSchema
        const contextParams = {
          operation: 'update' as const,
          repository,
          branch,
          agent: agent || 'cursor-agent',
          summary: summary || '',
          observation,
        };

        const result = await contextService.updateContext(
          context,
          clientProjectRoot,
          contextParams,
        );

        // Handle different response formats
        if (!result) {
          return {
            success: false,
            message: 'Failed to update context: unexpected response format',
          };
        }

        // Check if the service returned an error response
        if ('success' in result && !result.success) {
          return result; // Return the error response as-is
        }

        await context.sendProgress({
          status: 'complete',
          message: 'Context updated successfully',
          percent: 100,
          isFinal: true,
        });

        // Handle successful response with context data
        if ('context' in result) {
          return {
            success: true,
            message: 'Context updated successfully',
            context: result.context,
          };
        }

        // Handle successful response without context data
        return {
          success: true,
          message: 'Context updated successfully',
        };
      }

      default:
        return {
          success: false,
          message: `Unknown operation: ${operation}`,
        };
    }
  } catch (error) {
    await handleToolError(error, context, `context update`, 'context');

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: errorMessage,
    };
  }
};
