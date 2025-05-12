import { Response } from 'express';
import { ProgressTransport } from './progress-handler';

/**
 * HTTP Streaming implementation of ProgressTransport
 */
export class HttpStreamingProgressTransport implements ProgressTransport {
  private hasStarted = false;

  constructor(
    private response: Response,
    private debugLog: (level: number, message: string, data?: any) => void,
  ) {}

  /**
   * Ensure streaming headers are set and streaming has started
   */
  private ensureStreamingStarted(): void {
    if (!this.hasStarted) {
      this.response.setHeader('Content-Type', 'text/event-stream');
      this.response.setHeader('Cache-Control', 'no-cache');
      this.response.setHeader('Connection', 'keep-alive');
      this.hasStarted = true;
    }
  }

  /**
   * Send a tools/progress notification via HTTP streaming
   */
  sendProgressNotification(requestId: number | string, content: any, isFinal: boolean): void {
    this.ensureStreamingStarted();

    const notification = {
      jsonrpc: '2.0',
      method: 'tools/progress',
      params: {
        id: requestId,
        content: [{ type: 'text', text: JSON.stringify(content, null, 2) }],
        isFinal,
      },
    };

    this.debugLog(1, `Sending progress notification for request ${requestId}, isFinal: ${isFinal}`);
    this.response.write(`event: mcpNotification\ndata: ${JSON.stringify(notification)}\n\n`);
  }

  /**
   * Send a standard JSON-RPC response as an SSE event.
   * Does NOT end the stream; the caller is responsible for that.
   */
  sendResponse(requestId: number | string, content: any, isError: boolean): void {
    this.ensureStreamingStarted();

    const rpcResponse = {
      jsonrpc: '2.0',
      id: requestId,
      ...(isError ? { error: content } : { result: content }),
    };

    this.debugLog(
      1,
      `Sending SSE event (mcpResponse) for request ${requestId}, isError: ${isError}`,
    );
    this.response.write(`event: mcpResponse\ndata: ${JSON.stringify(rpcResponse)}\n\n`);

    // DO NOT CALL this.response.end(); here.
    // The main request handler (e.g., in mcp-httpstream-server.ts) will manage ending the stream.
    // This allows for batch processing over a single SSE connection.
  }
}
