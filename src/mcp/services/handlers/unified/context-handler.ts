import { ContextInputSchema } from '../../../schemas/unified-tool-schemas';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for context parameters
interface ContextParams {
  operation: 'update';
  repository: string;
  branch?: string;
  agent: string;
  summary: string;
  observation?: string;
}

interface ContextData {
  id: string;
  iso_date: string;
  agent: string;
  summary: string;
  observation: string | null;
  repository: string;
  branch: string;
  created_at: string | null;
  updated_at: string | null;
}

interface ContextUpdateOutput {
  success: boolean;
  message?: string;
  context?: ContextData;
}

/**
 * Context Handler
 * Handles context updates for session tracking
 */
export const contextHandler: SdkToolHandler = async (params, context, memoryService) => {
  try {
    // 1. Parse and validate parameters
    const validatedParams = ContextInputSchema.parse(params);
    const { operation, repository } = validatedParams;

    // 2. Validate session and get clientProjectRoot
    const clientProjectRoot = validateSession(context, 'context');
    if (!memoryService.services) {
      throw new Error('ServiceRegistry not initialized in MemoryService');
    }

    // 3. Log the operation
    logToolExecution(context, `context operation: ${operation}`, {
      repository,
      branch: validatedParams.branch ?? 'main',
      clientProjectRoot,
    });

    // 4. Execute the operation
    switch (operation) {
      case 'update': {
        // Send progress notification
        await context.sendProgress({
          status: 'in_progress',
          message: 'Updating context...',
          percent: 50,
        });

        // Call memory service to update context
        const result = await memoryService.services.context.updateContext(
          context,
          clientProjectRoot,
          validatedParams,
        );

        // Check if result is null and handle appropriately
        if (result === null) {
          await context.sendProgress({
            status: 'error',
            message: 'Failed to update context: unexpected response format',
            percent: 100,
            isFinal: true,
          });

          return {
            success: false,
            message: 'Failed to update context: unexpected response format',
          };
        }

        // Send completion notification
        await context.sendProgress({
          status: 'complete',
          message: 'Context updated successfully',
          percent: 100,
          isFinal: true,
        });

        return result;
      }

      // Note: default case is unreachable since Zod schema only allows 'update'
    }
  } catch (error) {
    await handleToolError(error, context, 'context update', 'context');

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: errorMessage,
    };
  }
};
