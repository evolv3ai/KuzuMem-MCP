import { ProgressTransport } from './progress-handler';

/**
 * Stdio implementation of ProgressTransport
 */
export class StdioProgressTransport implements ProgressTransport {
  constructor(private debugLog: (level: number, message: string, data?: any) => void) {}

  /**
   * Sends a pre-formatted JSON-RPC payload (notification or response) to stdout.
   * The eventName is ignored in the stdio context but present for interface compatibility.
   */
  public sendNotification(payload: object, eventName?: string): void {
    const requestId = (payload as any).id || 'unknown'; // For logging
    this.debugLog(
      1,
      `StdioTransport: Sending payload for request/toolCallId ${requestId}. EventName (ignored): ${eventName}`,
    );
    this.debugLog(2, 'StdioTransport: Payload details:', payload);
    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  // The following methods are now obsolete as ProgressHandler prepares the full payload.
  // They can be removed if no other part of the system relies on them directly.
  /*
  sendProgressNotification(requestId: number | string, content: any, isFinal: boolean): void {
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
    this.debugLog(2, 'Progress notification details:', notification);
    process.stdout.write(JSON.stringify(notification) + '\n');
  }

  sendResponse(requestId: number | string, content: any, isError: boolean): void {
    const response = {
      jsonrpc: '2.0',
      id: requestId,
      result: {
        content: [{ type: 'text', text: JSON.stringify(content, null, 2) }],
        isError,
      },
    };

    this.debugLog(1, `Sending response for id: ${requestId}`);
    this.debugLog(2, 'Response details:', response);
    process.stdout.write(JSON.stringify(response) + '\n');
  }
  */
}
