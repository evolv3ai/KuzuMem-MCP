import { HttpStreamingProgressTransport } from './http-transport';

// Define a simple type for the debug log function if not already globally available
type GenericDebugLogger = (level: number, message: string, data?: any) => void;

/**
 * Interface for transmitting progress notifications via any transport
 */
export interface ProgressTransport {
  /**
   * Send a progress notification through the transport
   */
  sendNotification(payload: object, eventName?: string): void;
}

/**
 * Interface for progress handler that tools can use
 */
export class ProgressHandler {
  constructor(
    private toolCallId: string,
    private transport: ProgressTransport,
    private debugLog: GenericDebugLogger,
  ) {}

  /**
   * Sends a tools/progress notification.
   * @param progressEventData The actual data payload for the progress event (e.g., status, message, specific tool data like ranks).
   *                          If this object contains `isFinal: true`, it will be marked as such in the MCP notification.
   */
  public progress(progressEventData: any): void {
    // The content of RichTextChunk should be a string.
    // If progressEventData is an object, it should be stringified.
    const richTextPayload =
      typeof progressEventData === 'string' ? progressEventData : JSON.stringify(progressEventData);

    const mcpProgressParams = {
      id: this.toolCallId,
      content: [{ type: 'RichText', text: richTextPayload }],
      isFinal: progressEventData.isFinal === true, // Ensure isFinal is explicitly boolean
    };

    const notification = {
      jsonrpc: '2.0',
      method: 'tools/progress',
      params: mcpProgressParams,
    };

    this.debugLog(
      3,
      `ProgressHandler: Sending tools/progress notification for ${this.toolCallId}`,
      notification,
    );
    this.transport.sendNotification(notification, 'mcpNotification');
  }

  /**
   * Sends the final mcpResponse event for the tool call.
   * @param resultData The data for the result or error field.
   * @param isError True if resultData represents an error, false otherwise.
   */
  public sendFinalResponse(resultData: any, isError: boolean): void {
    const responsePayload = {
      jsonrpc: '2.0',
      id: this.toolCallId,
      ...(isError ? { error: resultData } : { result: resultData }),
    };
    this.debugLog(
      3,
      `ProgressHandler: Sending final mcpResponse for ${this.toolCallId}, isError: ${isError}`,
      responsePayload,
    );
    this.transport.sendNotification(responsePayload, 'mcpResponse');
  }

  // Deprecate or remove sendProgressNotification and sendResponse if functionality is covered by progress() and sendFinalResponse()
  // For now, keeping them but they should ideally be consolidated.

  /** @deprecated Use progress() with an object that includes an isFinal property. */
  sendProgressNotification(content: any, isFinal: boolean): void {
    this.debugLog(2, 'ProgressHandler: sendProgressNotification is deprecated. Use progress().', {
      toolCallId: this.toolCallId,
      isFinal,
    });
    this.progress({ ...content, isFinal });
  }

  /** @deprecated Use sendFinalResponse(). */
  sendResponse(content: any, isError: boolean): void {
    this.debugLog(2, 'ProgressHandler: sendResponse is deprecated. Use sendFinalResponse().', {
      toolCallId: this.toolCallId,
      isError,
    });
    this.sendFinalResponse(content, isError);
  }
}

/**
 * Create a progress handler for a specific request and transport
 */
export function createProgressHandler(
  toolCallId: string,
  transport: ProgressTransport,
  debugLog: GenericDebugLogger,
): ProgressHandler {
  return new ProgressHandler(toolCallId, transport, debugLog);
}
