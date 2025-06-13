import { ContextInputSchema } from '../../../schemas/unified-tool-schemas';
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
 * Handles context updates for session tracking
 */
export const contextHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = ContextInputSchema.parse(params);
  const { operation, repository } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Executing context operation: ${operation}`, {
    repository,
    clientProjectRoot,
  });

  // 4. Execute the operation
  switch (operation) {
    case 'update': {
      // Validate required parameters for update
      if (!validatedParams.agent) {
        throw new Error('agent parameter is required for context update');
      }
      if (!validatedParams.summary) {
        throw new Error('summary parameter is required for context update');
      }

      // Send progress notification
      await context.sendProgress({
        status: 'in_progress',
        message: 'Updating context...',
        percent: 50,
      });

      // Call memory service to update context
      const result = await memoryService.updateContext(context, clientProjectRoot, validatedParams);

      // Send completion notification
      await context.sendProgress({
        status: 'complete',
        message: 'Context updated successfully',
        percent: 100,
        isFinal: true,
      });

      return result;
    }

    default:
      throw new Error(`Unknown context operation: ${operation}`);
  }
};
