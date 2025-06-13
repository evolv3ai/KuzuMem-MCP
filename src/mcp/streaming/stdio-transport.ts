import { ProgressTransport } from './progress-handler';
import { loggers } from '../../utils/logger';

// Create stdio transport specific logger
const stdioTransportLogger = loggers.mcpStdio().child({ component: 'StdioTransport' });

/**
 * Stdio implementation of ProgressTransport
 */
export class StdioProgressTransport implements ProgressTransport {
  constructor() {}

  /**
   * Send a notification via stdout (for progress or final responses)
   * @param payload The JSON payload to send
   * @param eventName Optional event name for debugging (not used in actual protocol)
   */
  sendNotification(payload: object, eventName?: string): void {
    stdioTransportLogger.debug(
      { eventName: eventName || 'notification' },
      `Sending ${eventName || 'notification'} via stdout`,
    );
    stdioTransportLogger.debug({ payload }, 'Payload details');

    // Send the JSON payload directly to stdout
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
}
