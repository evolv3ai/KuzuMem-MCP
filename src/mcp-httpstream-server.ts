/**
 * MCP HTTP Streaming Server
 * Implements the Model Context Protocol using HTTP streaming approach
 * Based on the TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools';
import { toolHandlers } from './mcp/tool-handlers';
import { createProgressHandler, ProgressHandler } from './mcp/streaming/progress-handler';
import { HttpStreamingProgressTransport } from './mcp/streaming/http-transport';
import { ToolExecutionService } from './mcp/services/tool-execution.service';

// Extend Express Request interface to include our custom properties using ES2015 module augmentation
declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    startTime?: number;
  }
}

// Load environment variables
dotenv.config();

// Debug levels
const DEBUG_LEVEL = process.env.DEBUG ? parseInt(process.env.DEBUG, 10) || 1 : 0;

/**
 * Enhanced logging system with severity levels and structured output
 */
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  component: string;
  data?: any;
  requestId?: string;
}

function log(level: LogLevel, message: string, data?: any, requestId?: string): void {
  const debugLevel = parseInt(process.env.DEBUG || '0', 10);

  // Only log if the current debug level is sufficient
  if (debugLevel >= level) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      component: 'mcp-httpstream-server',
      requestId,
    };

    // Only include data at higher debug levels or for errors
    if ((data && debugLevel >= 3) || level === LogLevel.ERROR) {
      entry.data = data;
    }

    console.log(JSON.stringify(entry));
  }
}

// Legacy debug logger for backward compatibility
function debugLog(level: number, message: string, data?: any, reqId?: string): void {
  const logLevel =
    level === 0
      ? LogLevel.ERROR
      : level === 1
        ? LogLevel.WARN
        : level === 2
          ? LogLevel.INFO
          : level === 3
            ? LogLevel.DEBUG
            : LogLevel.TRACE;

  log(logLevel, message, data, reqId);
}

// Helper for tool errors
function createToolError(message: string): any {
  return {
    error: message,
  };
}

// Create Express app
export const app = express();
const port = process.env.PORT || 3001; // Default to 3001 to avoid conflict with main server
const host = process.env.HOST || 'localhost';

// Configure the server
export async function configureServer(app: express.Application): Promise<void> {
  // Middleware
  app.use(express.json({ limit: '5mb' }));
  app.use(cors());

  // Generate a unique request ID for correlation
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const requestId = crypto.randomUUID();
    // Add requestId to the request object
    req.requestId = requestId;

    // Add the request ID to response headers for client-side correlation
    res.setHeader('X-Request-ID', requestId);

    // Log all incoming requests
    log(
      LogLevel.INFO,
      `${req.method} ${req.path}`,
      {
        query: req.query,
        contentType: req.get('Content-Type'),
        contentLength: req.get('Content-Length'),
        userAgent: req.get('User-Agent'),
      },
      requestId,
    );

    // Capture response completion to log the outcome
    res.on('finish', () => {
      const responseTime = Date.now() - (req.startTime || Date.now());
      log(
        LogLevel.INFO,
        `${req.method} ${req.path} - ${res.statusCode}`,
        {
          statusCode: res.statusCode,
          responseTime: `${responseTime}ms`,
        },
        requestId,
      );
    });

    // Store request start time for calculating response time
    req.startTime = Date.now();

    next();
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    log(LogLevel.ERROR, `Error: ${err.message}`, err, req.requestId);

    // Determine if this is a client error or server error
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
      error: {
        message: err.message || 'Internal Server Error',
        type: statusCode >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
        code: err.code || 'UNKNOWN_ERROR',
      },
    });
  });

  // MCP protocol version negotiation
  app.post('/initialize', (req: Request, res: Response) => {
    const requestedVersion = req.body?.protocolVersion || '0.1';
    const requestId = req.body?.id || null;

    log(
      LogLevel.INFO,
      `Received initialize request with protocolVersion: ${requestedVersion}`,
      req.body,
      req.requestId,
    );

    res.json({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        protocolVersion: requestedVersion,
        capabilities: {
          memory: { list: true },
          tools: { list: true, call: true },
        },
        serverInfo: {
          name: 'KuzuMem-MCP',
          version: '1.0.0',
        },
      },
    });
  });

  // MCP tools listing
  app.get('/tools/list', (req, res) => {
    log(
      LogLevel.INFO,
      `Returning tools/list with ${MEMORY_BANK_MCP_TOOLS.length} tools`,
      req.query,
      req.requestId,
    );

    // Convert our tool format to what MCP clients expect
    const convertedTools = MEMORY_BANK_MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      // Map parameters to inputSchema
      inputSchema: tool.parameters,
      // Map returns to outputSchema
      outputSchema: tool.returns,
      // Keep annotations
      annotations: tool.annotations,
    }));

    res.json({
      tools: convertedTools,
    });
  });

  // MCP resources listing
  app.get('/resources/list', (req, res) => {
    log(LogLevel.INFO, 'Handling resources/list request', req.query, req.requestId);

    res.json({
      resources: [],
      cursor: null,
    });
  });

  // MCP resources templates listing
  app.get('/resources/templates/list', (req, res) => {
    log(LogLevel.INFO, 'Handling resources/templates/list request', req.query, req.requestId);

    res.json({
      templates: [],
      cursor: null,
    });
  });

  // MCP-compliant unified /mcp endpoint
  app.post('/mcp', async (req: Request, res: Response, next: NextFunction) => {
    const wantsSSE = req.get('Accept')?.includes('text/event-stream');
    const body = req.body;
    const isBatch = Array.isArray(body);
    const messages = isBatch ? body : [body];
    const requestContextId = req.requestId;

    // Early exit for notifications/responses from client
    const onlyNotificationsOrResponses = messages.every((msg) => !msg.method);
    if (onlyNotificationsOrResponses) {
      res.status(202).end();
      return;
    }

    if (wantsSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let clientDisconnected = false;
      req.on('close', () => {
        clientDisconnected = true;
        log(LogLevel.INFO, 'Client disconnected from SSE stream', {}, requestContextId);
      });

      (async () => {
        // Wrap message processing in an async IIFE to manage loop and final res.end()
        for (const msg of messages) {
          if (clientDisconnected) {
            log(
              LogLevel.INFO,
              'SSE Client disconnected during batch, aborting remaining messages.',
              { msgId: msg.id },
              requestContextId,
            );
            break;
          }
          const currentMessageId = msg.id || crypto.randomUUID();
          log(
            LogLevel.DEBUG,
            `SSE: Processing message ${currentMessageId} in batch.`,
            msg,
            requestContextId,
          );

          const wrappedDebugLog = (level: number, messageText: string, data?: any) => {
            const internalLogLevel =
              level === 0
                ? LogLevel.ERROR
                : level === 1
                  ? LogLevel.WARN
                  : level === 2
                    ? LogLevel.INFO
                    : level === 3
                      ? LogLevel.DEBUG
                      : LogLevel.TRACE;
            log(internalLogLevel, messageText, data, requestContextId);
          };

          if (msg.method === 'tools/call' && msg.params?.name) {
            const toolName = msg.params.name;
            const toolArgs = msg.params.arguments || {};
            const streamingTransport = new HttpStreamingProgressTransport(res, wrappedDebugLog);
            const progressHandler = createProgressHandler(currentMessageId, streamingTransport);

            log(
              LogLevel.DEBUG,
              `SSE: Calling ToolExecutionService for ${toolName} (msgId: ${currentMessageId})`,
              { toolArgs },
              requestContextId,
            );
            try {
              const toolExecutionService = await ToolExecutionService.getInstance();
              const toolResult = await toolExecutionService.executeTool(
                toolName,
                toolArgs,
                toolHandlers,
                progressHandler,
                wrappedDebugLog,
              );
              log(
                LogLevel.DEBUG,
                `SSE: ToolExecutionService returned for ${toolName} (msgId: ${currentMessageId})`,
                { toolResultIsNull: toolResult === null },
                requestContextId,
              );

              if (toolResult !== null) {
                const isError = !!toolResult?.error;
                log(
                  LogLevel.DEBUG,
                  `SSE: Handling non-null toolResult for ${toolName} (msgId: ${currentMessageId}), isError: ${isError}`,
                  {},
                  requestContextId,
                );
                progressHandler.sendFinalProgress(toolResult);
                progressHandler.sendFinalResponse(toolResult, isError);
              }
              log(
                LogLevel.DEBUG,
                `SSE: Finished processing tool/call for ${toolName} (msgId: ${currentMessageId})`,
                {},
                requestContextId,
              );
            } catch (error: any) {
              log(
                LogLevel.ERROR,
                `SSE: Unhandled Error in tools/call for ${toolName} (msgId: ${currentMessageId}): ${error.message}`,
                { stack: error.stack },
                requestContextId,
              );
              if (!res.writableEnded && !clientDisconnected) {
                const errorPayload = {
                  jsonrpc: '2.0',
                  id: currentMessageId,
                  error: { code: -32000, message: error.message || 'Tool execution server error' },
                };
                res.write(`event: mcpResponse\ndata: ${JSON.stringify(errorPayload)}\n\n`);
              }
            }
          } else if (msg.method) {
            log(
              LogLevel.WARN,
              `SSE: Received non-tools/call method '${msg.method}' (msgId: ${msg.id})`,
              msg,
              requestContextId,
            );
            if (!res.writableEnded && !clientDisconnected) {
              const errorPayload = {
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32601, message: `Method ${msg.method} not supported here.` },
              };
              res.write(`event: mcpResponse\ndata: ${JSON.stringify(errorPayload)}\n\n`);
            }
          } else {
            log(
              LogLevel.WARN,
              `SSE: Invalid message (no method) (msgId: ${msg.id})`,
              msg,
              requestContextId,
            );
            if (!res.writableEnded && !clientDisconnected) {
              const errorPayload = {
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32600, message: 'Invalid Request' },
              };
              res.write(`event: mcpResponse\ndata: ${JSON.stringify(errorPayload)}\n\n`);
            }
          }
          log(
            LogLevel.DEBUG,
            `SSE: End of loop for message ${currentMessageId}. writableEnded: ${res.writableEnded}`,
            {},
            requestContextId,
          );
        } // End for loop over messages

        if (!res.writableEnded && !clientDisconnected) {
          log(
            LogLevel.INFO,
            'SSE: All messages processed, client still connected. Ending stream now.',
            {},
            requestContextId,
          );
          res.end();
        } else if (res.writableEnded) {
          log(
            LogLevel.INFO,
            'SSE: Stream already ended by a transport or error handler.',
            {},
            requestContextId,
          );
        } else if (clientDisconnected) {
          log(
            LogLevel.INFO,
            'SSE: Client disconnected before stream could be formally ended.',
            {},
            requestContextId,
          );
        }
      })().catch((loopError) => {
        // Catch any unexpected errors from the async IIFE itself
        log(
          LogLevel.ERROR,
          'Critical error in SSE message processing loop',
          loopError,
          requestContextId,
        );
        if (!res.writableEnded && !clientDisconnected) {
          res.status(500).end('Internal Server Error during SSE processing');
        }
      });
    } else {
      // Handle non-SSE (standard JSON) batch or single request
      log(LogLevel.DEBUG, 'Processing /mcp request as standard JSON', {}, requestContextId);
      const responses: any[] = [];
      for (const msg of messages) {
        const currentMessageId = msg.id || crypto.randomUUID();
        const wrappedDebugLog = (level: number, messageText: string, data?: any) => {
          const internalLogLevel =
            level === 0
              ? LogLevel.ERROR
              : level === 1
                ? LogLevel.WARN
                : level === 2
                  ? LogLevel.INFO
                  : level === 3
                    ? LogLevel.DEBUG
                    : LogLevel.TRACE;
          log(internalLogLevel, messageText, data, requestContextId);
        };
        let responsePayload;

        if (msg.method === 'tools/call' && msg.params?.name) {
          const toolName = msg.params.name;
          const toolArgs = msg.params.arguments || {};
          try {
            const toolExecutionService = await ToolExecutionService.getInstance();
            const toolResult = await toolExecutionService.executeTool(
              toolName,
              toolArgs,
              toolHandlers,
              undefined,
              wrappedDebugLog,
            );
            responsePayload = { jsonrpc: '2.0', id: currentMessageId, result: toolResult };
          } catch (error: any) {
            log(
              LogLevel.ERROR,
              `Error in JSON tools/call for ${toolName}: ${error.message}`,
              { stack: error.stack },
              requestContextId,
            );
            responsePayload = {
              jsonrpc: '2.0',
              id: currentMessageId,
              error: { code: -32000, message: error.message || 'Tool execution failed' },
            };
          }
        } else if (msg.method) {
          log(
            LogLevel.WARN,
            `Received non-tools/call method '${msg.method}' in JSON /mcp endpoint`,
            msg,
            requestContextId,
          );
          responsePayload = {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: `Method ${msg.method} not supported for JSON /mcp.` },
          };
        } else {
          responsePayload = {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32600, message: 'Invalid Request' },
          };
        }
        responses.push(responsePayload);
      }
      res.json(isBatch ? responses : responses[0]);
    }
  });

  // DELETE /mcp for session termination
  app.delete('/mcp', (req, res) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost').split(',');
    const origin = req.get('Origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      log(
        LogLevel.WARN,
        `Rejected DELETE /mcp due to invalid Origin: ${origin}`,
        {},
        req.requestId,
      );
      res.status(403).json({ error: 'Forbidden: Invalid Origin header' });
      return;
    }
    // Invalidate session (stub)
    log(LogLevel.INFO, `Session termination requested via DELETE /mcp`, {}, req.requestId);
    res.status(200).json({ success: true, message: 'Session terminated (stub)' });
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
}

// Graceful shutdown handling
let server: any;

// Handler for graceful shutdown
function gracefulShutdown(signal: string) {
  log(LogLevel.INFO, `Received ${signal}, starting graceful shutdown`);

  if (server) {
    // Stop accepting new connections
    server.close(() => {
      log(LogLevel.INFO, 'HTTP server closed, all connections drained');
      process.exit(0);
    });

    // Set a timeout to force exit if graceful shutdown takes too long
    setTimeout(() => {
      log(LogLevel.ERROR, 'Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds timeout
  } else {
    process.exit(0);
  }
}

// Start the server
if (require.main === module) {
  // Handle signals for graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  configureServer(app)
    .then(() => {
      server = app.listen(Number(port), host as string, () => {
        log(LogLevel.INFO, `MCP HTTP Streaming Server running at http://${host}:${port}`);
        console.log(`MCP HTTP Streaming Server running at http://${host}:${port}`);
      });

      // Handle server errors
      server.on('error', (err: Error) => {
        log(LogLevel.ERROR, `Server error: ${err.message}`, err);
        process.exit(1);
      });
    })
    .catch((err) => {
      log(LogLevel.ERROR, `Failed to start server: ${err.message}`, err);
      process.exit(1);
    });
}
