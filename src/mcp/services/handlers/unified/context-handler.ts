import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution } from '../../../utils/error-utils';

// TypeScript interfaces for context input parameters
interface ContextParams {
  operation: 'update';
  agent?: string;
  summary?: string;
  observation?: string;
  repository?: string;
  branch?: string;
  clientProjectRoot?: string;
}

/**
 * Context Handler
 * Handles context update operations
 */
export const contextHandler: SdkToolHandler = async (params, context, memoryService) => {
  try {
    // 1. Validate and extract parameters
    const validatedParams = params as unknown as ContextParams;

    // Basic validation
    if (!validatedParams.operation) {
      return {
        success: false,
        message: 'operation parameter is required',
      };
    }

    // For context operations, we require repository to be passed in params for explicit targeting
    if (!validatedParams.repository) {
      return {
        success: false,
        message: 'repository parameter is required for context operations',
      };
    }

    // Validate required fields for update operation
    if (validatedParams.operation === 'update' && !validatedParams.summary) {
      return {
        success: false,
        message: 'Required fields missing: summary is required for update operation',
      };
    }

    const { operation, agent, summary, observation, repository, branch = 'main' } = validatedParams;

    // 2. Validate session and get clientProjectRoot
    if (!context.session?.clientProjectRoot) {
      return {
        success: false,
        message:
          'No active session for context tool. Use memory-bank tool with operation "init" first.',
      };
    }

    const clientProjectRoot = context.session.clientProjectRoot;
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
