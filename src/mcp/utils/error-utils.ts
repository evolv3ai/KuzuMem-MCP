import { ToolHandlerContext } from '../types/sdk-custom';

/**
 * Standardized error handling for tool handlers
 */
export async function handleToolError(
  error: unknown,
  context: ToolHandlerContext,
  operation: string,
  type?: string,
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  context.logger.error(`${operation} failed: ${errorMessage}`, {
    type,
    error: errorMessage,
  });

  await context.sendProgress({
    status: 'error',
    message: `Failed to execute ${operation}: ${errorMessage}`,
    percent: 100,
    isFinal: true,
  });
}

/**
 * Standardized session validation for tool handlers
 */
export function validateSession(context: ToolHandlerContext, toolName: string): string {
  const clientProjectRoot = context.session.clientProjectRoot;
  if (!clientProjectRoot) {
    throw new Error(
      `No active session for ${toolName} tool. Use memory-bank tool with operation "init" first.`,
    );
  }
  return clientProjectRoot;
}

/**
 * Standardized parameter logging for tool handlers
 */
export function logToolExecution(
  context: ToolHandlerContext,
  operation: string,
  params: {
    repository: string;
    branch?: string;
    clientProjectRoot?: string;
    [key: string]: any;
  },
): void {
  context.logger.info(`Executing ${operation}`, {
    repository: params.repository,
    branch: params.branch || 'main',
    clientProjectRoot: params.clientProjectRoot,
  });
}
