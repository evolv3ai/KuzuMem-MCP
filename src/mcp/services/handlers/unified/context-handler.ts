import { SdkToolHandler } from '../../../tool-handlers';

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
 * Handles context update operations
 */
export const contextHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as ContextParams;
  
  // Basic validation
  if (!validatedParams.operation) {
    throw new Error('operation parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }
  if (!validatedParams.agent) {
    throw new Error('agent parameter is required');
  }
  if (!validatedParams.summary) {
    throw new Error('summary parameter is required');
  }
  
  const { operation, repository, branch = 'main', agent, summary, observation } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Executing context operation: ${operation}`, {
    repository,
    branch,
    agent,
    clientProjectRoot,
  });

  try {
    switch (operation) {
      case 'update': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Updating context...',
          percent: 50,
        });

        // Call MemoryService updateContext method
        const result = await memoryService.updateContext(context, clientProjectRoot, {
          operation: 'update',
          repository,
          branch,
          agent,
          summary,
          observation,
        });

        await context.sendProgress({
          status: 'complete',
          message: 'Context updated successfully',
          percent: 100,
          isFinal: true,
        });

        // Check if result is the success/context object format
        if (!result || !('success' in result)) {
          return {
            success: false,
            message: 'Failed to update context - unexpected response format',
          } as ContextUpdateOutput;
        }

        if (!result.success || !result.context) {
          return {
            success: false,
            message: result.message || 'Failed to update context',
          } as ContextUpdateOutput;
        }

        // Map the context from UpdateContextOutputSchema to our schema
        const contextData = result.context;
        return {
          success: true,
          message: 'Context updated successfully',
          context: {
            id: contextData.id,
            iso_date: contextData.iso_date,
            agent: contextData.agent || agent,
            summary: contextData.summary || summary,
            observation: contextData.summary ? null : observation || null, // observation is in summary usually
            repository: contextData.repository,
            branch: contextData.branch,
            created_at: contextData.created_at || null,
            updated_at: contextData.updated_at || null,
          },
        } as ContextUpdateOutput;
      }

      default:
        throw new Error(`Unknown context operation: ${operation}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Context operation failed: ${errorMessage}`, {
      operation,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to ${operation} context: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    return {
      success: false,
      message: errorMessage,
    } as ContextUpdateOutput;
  }
};