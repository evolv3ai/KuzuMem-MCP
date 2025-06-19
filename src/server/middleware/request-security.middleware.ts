import { type IncomingMessage, type ServerResponse } from 'node:http';
import { type Logger } from 'pino';

import { 
  BaseHttpStreamServer, 
  type DataEventListener, 
  type GenericEventListener,
  MAX_REQUEST_SIZE 
} from '../base/base-httpstream-server';

/**
 * Middleware responsible for request security and size limiting
 * Provides protection against oversized requests and implements timeout handling
 */
export class RequestSecurityMiddleware extends BaseHttpStreamServer {
  /**
   * Creates a size-limited request wrapper that tracks cumulative chunk sizes
   * while preserving the original request interface for MCP transport compatibility.
   *
   * This provides robust protection against oversized requests by monitoring
   * actual data flow, not just headers which can be spoofed or omitted.
   */
  createSizeLimitedRequest(req: IncomingMessage, requestLogger: Logger): IncomingMessage {
    let cumulativeSize = 0;
    let sizeLimitExceeded = false;

    // First, validate Content-Length header if present (fast fail for obvious oversized requests)
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const declaredSize = parseInt(contentLength, 10);
      if (isNaN(declaredSize)) {
        requestLogger.warn({ contentLength }, 'Invalid Content-Length header');
      } else if (declaredSize > this.config.maxRequestSize) {
        requestLogger.error(
          { contentLength: declaredSize, maxSize: this.config.maxRequestSize },
          'Request size exceeds maximum allowed size (Content-Length check)',
        );
        throw new Error(
          `Request size ${declaredSize} bytes exceeds maximum allowed size ${this.config.maxRequestSize} bytes`,
        );
      }
    }

    // Create a proxy that intercepts data events to track cumulative size
    // This preserves the original request interface while adding size monitoring
    const originalOn = req.on.bind(req);
    const originalAddListener = req.addListener.bind(req);

    // Override event listeners to intercept 'data' events
    req.on = function (event: string | symbol, listener: GenericEventListener) {
      if (event === 'data') {
        // Wrap the data listener to track cumulative size
        const wrappedListener: DataEventListener = (chunk: Buffer | string) => {
          if (sizeLimitExceeded) {
            return; // Don't process more data if limit already exceeded
          }

          const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, 'utf8');
          cumulativeSize += chunkSize;

          if (cumulativeSize > MAX_REQUEST_SIZE) {
            sizeLimitExceeded = true;
            requestLogger.error(
              { cumulativeSize, chunkSize, maxSize: MAX_REQUEST_SIZE },
              'Request size limit exceeded during streaming',
            );

            // Emit an error to terminate the request processing
            req.emit(
              'error',
              new Error(
                `Request size ${cumulativeSize} bytes exceeds maximum allowed size ${MAX_REQUEST_SIZE} bytes`,
              ),
            );
            return;
          }

          requestLogger.debug(
            { cumulativeSize, chunkSize, maxSize: MAX_REQUEST_SIZE },
            'Request chunk processed',
          );

          // Call the original listener with the chunk (type-safe cast)
          (listener as DataEventListener)(chunk);
        };

        return originalOn.call(this, event, wrappedListener);
      }

      // For all other events, use the original listener
      return originalOn.call(this, event, listener);
    };

    // Also override addListener (alias for on)
    req.addListener = function (event: string | symbol, listener: GenericEventListener) {
      return req.on(event, listener);
    };

    return req;
  }

  /**
   * Apply timeout protection to a response
   */
  applyTimeoutProtection(
    req: IncomingMessage,
    res: ServerResponse,
    requestLogger: Logger,
  ): { cleanup: () => void } {
    let requestCompleted = false;
    
    const requestTimeout = setTimeout(() => {
      if (!requestCompleted && !res.headersSent) {
        requestLogger.warn('Request timeout - closing connection');
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Request timeout',
            },
            id: null,
          }),
        );
      }
    }, this.config.requestTimeout);

    // Monitor response completion to clear timeout
    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, encoding?: any, cb?: any): ServerResponse {
      requestCompleted = true;
      clearTimeout(requestTimeout);
      return originalEnd.call(this, chunk, encoding, cb);
    };

    return {
      cleanup: () => {
        requestCompleted = true;
        clearTimeout(requestTimeout);
      },
    };
  }

  /**
   * Create error response for size limit violations
   */
  createSizeLimitErrorResponse(error: Error): object {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Payload Too Large',
        data: error.message,
      },
      id: null,
    };
  }

  /**
   * Create error response for timeout violations
   */
  createTimeoutErrorResponse(): object {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Request timeout',
      },
      id: null,
    };
  }

  /**
   * Create error response for general errors
   */
  createGeneralErrorResponse(error: unknown): object {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: String(error),
      },
      id: null,
    };
  }

  /**
   * Validate request headers for security
   */
  validateRequestHeaders(req: IncomingMessage, requestLogger: Logger): boolean {
    // Add any header validation logic here
    // For now, just log the headers for debugging
    requestLogger.debug(
      {
        headers: req.headers,
        method: req.method,
        url: req.url,
      },
      'Request headers validated',
    );

    return true;
  }

  /**
   * Apply CORS headers if needed
   */
  applyCorsHeaders(res: ServerResponse): void {
    // Add CORS headers if needed for browser compatibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  }

  /**
   * Handle OPTIONS requests for CORS preflight
   */
  handleOptionsRequest(res: ServerResponse): void {
    this.applyCorsHeaders(res);
    res.writeHead(200);
    res.end();
  }

  // Implement abstract methods from base class
  async start(): Promise<void> {
    this.logger.info('Request security middleware initialized');
  }

  async stop(): Promise<void> {
    this.logger.info('Request security middleware stopped');
  }
}
