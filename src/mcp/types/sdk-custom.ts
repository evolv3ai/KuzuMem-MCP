/**
 * Simplified progress notification payload for tool handlers.
 * This replaces the complex MCP-specific progress handling with a simple interface.
 */
export interface ProgressNotification {
  status: string; // e.g., 'initializing', 'in-progress', 'component-found', 'processing', 'complete', 'error'
  message?: string;
  percent?: number;
  isFinal?: boolean; // Indicates if this is the last progress update for an operation
  toolName?: string; // Optional: name of the tool sending progress
  data?: any; // Optional: any additional data related to the progress
  error?: {
    // Optional: error details if progress update indicates an error
    message: string;
    code?: number;
    details?: any;
  };
}

/**
 * Simplified context object for tool handlers.
 * This replaces the complex EnrichedRequestHandlerExtra with a minimal interface
 * that works with the official SDK approach.
 */
export interface ToolHandlerContext {
  logger: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
  session: {
    clientProjectRoot?: string;
    repository?: string;
    branch?: string;
  };
  sendProgress: (progress: ProgressNotification) => Promise<void>;
  // Minimal required properties for compatibility
  signal?: AbortSignal;
  requestId?: string;
}

// Legacy aliases for backward compatibility during transition
/** @deprecated Use ProgressNotification instead */
export type McpProgressNotification = ProgressNotification;

/** @deprecated Use ToolHandlerContext instead */
export type EnrichedRequestHandlerExtra = ToolHandlerContext;
