import { Session } from 'better-sse';

// Define a simple type for the debug log function if not already globally available
type GenericDebugLogger = (level: number, message: string, data?: any) => void;

/**
 * HTTP Streaming Transport for MCP Progress Notifications using better-sse.
 * This class is responsible for sending formatted MCP progress notifications
 * over an established SSE session.
 */
export class HttpStreamingProgressTransport {
  /**
   * Creates an instance of HttpStreamingProgressTransport.
   * @param session The better-sse Session object representing the client connection.
   * @param debugLog A logger instance for debugging.
   */
  constructor(
    private session: Session,
    // Use a generic function type for the logger
    private debugLog: GenericDebugLogger,
  ) {}

  /**
   * Sends a structured MCP notification payload as an SSE event.
   * @param payload The complete JSON-RPC Notification object (e.g., for tools/progress or mcpResponse).
   * @param eventName The SSE event name (e.g., 'mcpNotification' or 'mcpResponse').
   */
  public sendNotification(payload: object, eventName: string = 'mcpNotification'): void {
    // Rely on better-sse's session.push to handle (or throw on) disconnected clients.
    // The try-catch block will handle errors during push.
    try {
      this.session.push(payload, eventName);
      // Use numeric log levels (e.g., 4 for TRACE/VERBOSE, adjust as per your convention)
      this.debugLog(4, `SSE event '${eventName}' pushed successfully.`, payload);
    } catch (error: any) {
      // Use numeric log levels (e.g., 0 for ERROR)
      this.debugLog(0, `Error pushing SSE event '${eventName}': ${error.message}`, {
        error: error.toString(),
        payload,
      });
      // It's possible better-sse throws an error if the client has disconnected.
      // Depending on desired behavior, this error could be ignored or re-thrown if critical.
    }
  }
}
