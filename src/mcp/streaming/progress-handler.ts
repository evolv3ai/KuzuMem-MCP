/**
 * Interface for transmitting progress notifications via any transport
 */
export interface ProgressTransport {
  /**
   * Send a progress notification through the transport
   */
  sendProgressNotification(requestId: number | string, content: any, isFinal: boolean): void;

  /**
   * Send a final response through the transport
   */
  sendResponse(requestId: number | string, result: any, isError: boolean): void;
}

/**
 * Interface for progress handler that tools can use
 */
export interface ProgressHandler {
  /**
   * Report incremental progress during tool execution
   */
  progress(content: any): void;

  /**
   * Send the final progress notification (isFinal: true).
   * The content here is typically the wrapper object from the Operation Class.
   */
  sendFinalProgress(content: any): void;

  /**
   * Send the standard JSON-RPC response for the tool call.
   * The result here is the core data payload expected by batch clients.
   */
  sendFinalResponse(result: any, isError: boolean): void;
}

/**
 * Create a progress handler for a specific request and transport
 */
export function createProgressHandler(
  requestId: number | string,
  transport: ProgressTransport,
): ProgressHandler {
  return {
    progress: (content: any) => {
      transport.sendProgressNotification(requestId, content, false);
    },
    sendFinalProgress: (content: any) => {
      // Send final progress notification (isFinal: true)
      transport.sendProgressNotification(requestId, content, true);
    },
    sendFinalResponse: (result: any, isError: boolean) => {
      // Send the standard JSON-RPC response for the tool call
      transport.sendResponse(requestId, result, isError);
    },
  };
}
