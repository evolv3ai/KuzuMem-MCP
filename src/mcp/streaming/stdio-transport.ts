import { ProgressTransport } from './progress-handler';

// Define the debug log type matching the pattern used elsewhere
type GenericDebugLogger = (level: number, message: string, data?: any) => void;

/**
 * Stdio implementation of ProgressTransport
 */
export class StdioProgressTransport implements ProgressTransport {
  constructor(private debugLog: (level: number, message: string, data?: any) => void) {}

  /**
   * Send a notification via stdout (for progress or final responses)
   * @param payload The JSON payload to send
   * @param eventName Optional event name for debugging (not used in actual protocol)
   */
  sendNotification(payload: object, eventName?: string): void {
    this.debugLog(1, `Sending ${eventName || 'notification'} via stdout`);
    this.debugLog(2, 'Payload details:', payload);

    // Send the JSON payload directly to stdout
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
}
