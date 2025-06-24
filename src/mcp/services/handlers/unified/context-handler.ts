import { z } from 'zod';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// Custom context schema that matches the existing test expectations
const ContextInputSchema = z
  .object({
    operation: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z.enum(['update']),
    ),
    repository: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z.string().regex(/^[a-zA-Z0-9-_]+$/, {
        message:
          'repository name contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed',
      }),
    ),
    branch: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z
        .string()
        .regex(/^[a-zA-Z0-9-_/.]+$/, {
          message: 'branch name contains invalid characters',
        })
        .default('main'),
    ),
    agent: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z.string().optional(),
    ),
    summary: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z.string().optional(),
    ),
    observation: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z.string().optional(),
    ),
    clientProjectRoot: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z.string().optional(),
    ),
  })
  .refine((data) => data.operation !== 'update' || data.summary, {
    message: 'summary parameter is required for update operation',
    path: ['summary'],
  });

// TypeScript interface inferred from the Zod schema
type ContextParams = z.infer<typeof ContextInputSchema>;

/**
 * Helper function to format Zod errors into user-friendly messages
 */
function formatZodError(error: z.ZodError, originalParams?: any): string {
  const firstIssue = error.issues[0];

  if (firstIssue.code === 'invalid_type' && firstIssue.path.length === 0) {
    if (firstIssue.expected === 'object') {
      return 'params must be an object';
    }
  }

  if (firstIssue.code === 'invalid_type' && firstIssue.path.length > 0) {
    const field = firstIssue.path[0];
    if (firstIssue.received === 'undefined') {
      return `${field} parameter is required`;
    } else {
      return `${field} parameter must be a string, received ${firstIssue.received}`;
    }
  }

  if (firstIssue.code === 'invalid_enum_value') {
    const field = firstIssue.path[0];
    const received = firstIssue.received;
    if (field === 'operation') {
      if (typeof received === 'string' && received.trim() === '') {
        return 'operation parameter cannot be empty or whitespace-only';
      }
      return `operation must be 'update', received: ${received}`;
    }
  }

  if (firstIssue.code === 'invalid_string' && firstIssue.validation === 'regex') {
    const field = firstIssue.path[0];
    if (field === 'repository' && originalParams && originalParams.repository) {
      return `repository name contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed: ${originalParams.repository}`;
    }
    return firstIssue.message;
  }

  if (firstIssue.code === 'custom') {
    return firstIssue.message;
  }

  // Fallback to the first issue message
  return firstIssue.message;
}

/**
 * Context Handler
 * Handles context update operations
 */
export const contextHandler: SdkToolHandler = async (params, context, memoryService) => {
  try {
    // 1. Enhanced parameter validation using Zod schema
    const validatedParams = ContextInputSchema.parse(params);

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

        await context.sendProgress({
          status: 'complete',
          message: 'Context updated successfully',
          percent: 100,
          isFinal: true,
        });

        // Simplified response handling
        if (!result) {
          return {
            success: false,
            message: 'Failed to update context: unexpected response format',
          };
        }

        if ('success' in result && !result.success) {
          return result;
        }

        return {
          success: true,
          message: 'Context updated successfully',
          ...('context' in result && { context: result.context }),
        };
      }

      default:
        return {
          success: false,
          message: `Unknown operation: ${operation}`,
        };
    }
  } catch (error) {
    // Handle Zod validation errors specially
    if (error instanceof z.ZodError) {
      const userFriendlyMessage = formatZodError(error, params);
      return {
        success: false,
        message: userFriendlyMessage,
      };
    }

    await handleToolError(error, context, `context update`, 'context');

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: errorMessage,
    };
  }
};
