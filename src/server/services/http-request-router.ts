import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Logger } from 'pino';

import { BaseHttpStreamServer } from '../base/base-httpstream-server';
import { RequestSecurityMiddleware } from '../middleware/request-security.middleware';
import { logError } from '../../utils/logger';

/**
 * Service responsible for routing HTTP requests to appropriate handlers
 * Handles POST, GET, DELETE requests and manages session-based routing
 */
export class HttpRequestRouter extends BaseHttpStreamServer {
  private securityMiddleware: RequestSecurityMiddleware;
  private sharedMcpServer: McpServer;

  constructor(config?: any, mcpServer?: McpServer) {
    super(config);
    this.securityMiddleware = new RequestSecurityMiddleware(config);
    this.sharedMcpServer = mcpServer || this.getMcpServer();
  }

  /**
   * Route incoming HTTP requests to appropriate handlers
   */
  async routeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestLogger = this.createRequestLogger(req);

    try {
      requestLogger.debug(
        {
          headers: req.headers,
          method: req.method,
          url: req.url,
        },
        `HTTP ${req.method} ${req.url}`,
      );

      // Validate request headers
      if (!this.securityMiddleware.validateRequestHeaders(req, requestLogger)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Invalid request headers' },
            id: null,
          }),
        );
        return;
      }

      // Apply CORS headers
      this.securityMiddleware.applyCorsHeaders(res);

      // Handle different HTTP methods
      switch (req.method) {
        case 'POST':
          await this.handlePostRequest(req, res, requestLogger);
          break;
        case 'GET':
          await this.handleGetRequest(req, res, requestLogger);
          break;
        case 'DELETE':
          await this.handleDeleteRequest(req, res, requestLogger);
          break;
        case 'OPTIONS':
          this.securityMiddleware.handleOptionsRequest(res);
          break;
        default:
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Method not allowed' },
              id: null,
            }),
          );
      }
    } catch (error) {
      logError(requestLogger, error as Error, {
        method: req.method,
        url: req.url,
        operation: 'http-request-handling',
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { code: -32603, message: 'Internal error' },
          }),
        );
      }
    }
  }

  /**
   * Handle POST requests (for MCP tool calls and initialization)
   */
  private async handlePostRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestLogger: any,
  ): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Apply timeout protection
    const { cleanup } = this.securityMiddleware.applyTimeoutProtection(req, res, requestLogger);

    try {
      // Create size-limited request wrapper
      let sizeLimitedReq: IncomingMessage;
      try {
        sizeLimitedReq = this.securityMiddleware.createSizeLimitedRequest(req, requestLogger);
      } catch (error) {
        cleanup();
        requestLogger.error({ error }, 'Request size validation failed (Content-Length check)');
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify(this.securityMiddleware.createSizeLimitErrorResponse(error as Error)),
        );
        return;
      }

      // Set up error handler for streaming size limit violations
      sizeLimitedReq.on('error', (error) => {
        if (!res.headersSent) {
          cleanup();
          requestLogger.error({ error }, 'Request size limit exceeded during streaming');
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.securityMiddleware.createSizeLimitErrorResponse(error)));
        }
      });

      if (sessionId && this.getTransport(sessionId)) {
        // Reuse existing transport
        const transport = this.getTransport(sessionId)!;
        requestLogger.debug({ sessionId }, 'Reusing existing transport');

        try {
          await transport.handleRequest(sizeLimitedReq, res);
          return;
        } catch (error) {
          requestLogger.error(
            { error, sessionId },
            'Error handling request with existing transport',
          );
          this.removeTransport(sessionId);
          throw error;
        }
      }

      if (!sessionId) {
        // Create new transport for initialization request
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId: string) => {
            this.setTransport(newSessionId, transport);
            requestLogger.debug({ sessionId: newSessionId }, 'New session initialized');
          },
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            this.removeTransport(transport.sessionId);
            requestLogger.debug({ sessionId: transport.sessionId }, 'Session transport cleaned up');
          }
        };

        try {
          await this.sharedMcpServer.connect(transport);
          requestLogger.debug('MCP server connected to new transport');
          await transport.handleRequest(sizeLimitedReq, res);
          return;
        } catch (error) {
          requestLogger.error({ error }, 'Error handling request with new transport');
          if (transport.sessionId) {
            this.removeTransport(transport.sessionId);
          }
          throw error;
        }
      }

      // Invalid request - session ID provided but not found
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: Invalid session ID' },
          id: null,
        }),
      );
    } catch (error) {
      cleanup();
      requestLogger.error({ error }, 'Unhandled error in POST request handler');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.securityMiddleware.createGeneralErrorResponse(error)));
      }
    }
  }

  /**
   * Handle GET requests (for SSE streams)
   */
  private async handleGetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestLogger: any,
  ): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.getTransport(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: Invalid or missing session ID' },
          id: null,
        }),
      );
      return;
    }

    const transport = this.getTransport(sessionId)!;
    await transport.handleRequest(req, res);
  }

  /**
   * Handle DELETE requests (for session termination)
   */
  private async handleDeleteRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestLogger: any,
  ): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.getTransport(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: Invalid or missing session ID' },
          id: null,
        }),
      );
      return;
    }

    const transport = this.getTransport(sessionId)!;

    try {
      await transport.close();
      this.removeTransport(sessionId);
      requestLogger.debug({ sessionId }, 'Session terminated');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          result: { success: true },
          id: null,
        }),
      );
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error during session termination' },
          id: null,
        }),
      );
    }
  }

  // Implement abstract methods from base class
  async start(): Promise<void> {
    await this.securityMiddleware.start();
    this.logger.info('HTTP request router initialized');
  }

  async stop(): Promise<void> {
    await this.securityMiddleware.stop();
    this.logger.info('HTTP request router stopped');
  }
}
