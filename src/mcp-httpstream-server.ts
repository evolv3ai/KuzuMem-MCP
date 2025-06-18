/**
 * MCP HTTP Streaming Server
 * Official MCP TypeScript SDK implementation using McpServer and StreamableHTTPServerTransport
 * Based on: https://github.com/modelcontextprotocol/typescript-sdk
 */

import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { type Logger } from 'pino';

// Official MCP SDK imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Our tool definitions and services
import { toolHandlers } from './mcp/tool-handlers';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools';
import { MemoryService } from './services/memory.service';
import { createPerformanceLogger, logError, loggers } from './utils/logger';
import { createZodRawShape } from './mcp/utils/schema-utils';
import { createRepositoryBranchKey } from './mcp/utils/repository-utils';

// Load environment variables
dotenv.config();

// Server configuration
const port = parseInt(process.env.HTTP_STREAM_PORT || '8001', 10);
const host = process.env.HOST || 'localhost';

// Create HTTP stream specific logger
const httpStreamLogger = loggers.mcpHttp();

// Map to store clientProjectRoot for each repository and branch
const repositoryRootMap = new Map<string, string>();

// Create the official MCP server with proper capabilities
const mcpServer = new McpServer(
  { name: 'KuzuMem-MCP-HTTPStream', version: '3.0.0' },
  {
    capabilities: {
      tools: { list: true, call: true, listChanged: true },
      resources: {},
      prompts: {},
    },
  },
);

// Schema creation is now handled by shared utility

/**
 * Execute tool logic using existing handlers with official SDK approach.
 * This follows the pure official SDK pattern while reusing existing business logic.
 */
async function executeToolDirectly(
  toolName: string,
  args: any,
  memoryService: MemoryService,
  logger: any,
  progressCallback?: (progressData: any) => Promise<void>,
): Promise<any> {
  logger.debug({ toolName, args }, 'Executing tool using existing handlers');

  // Get the handler for this tool
  const handler = toolHandlers[toolName];
  if (!handler) {
    throw new Error(`No handler found for tool: ${toolName}`);
  }

  // Create a comprehensive context object for the handler
  const handlerContext = {
    logger,
    session: {
      clientProjectRoot: args.clientProjectRoot,
      repository: args.repository,
      branch: args.branch,
    },
    sendProgress: async (progressData: any) => {
      // Log progress for debugging
      logger.info({ progressData }, 'Progress notification (HTTP Stream)');

      // Call the progress callback if provided
      if (progressCallback) {
        try {
          await progressCallback(progressData);
        } catch (error) {
          logger.warn({ error, progressData }, 'Failed to send progress notification');
        }
      }
    },
    // Add all required properties for handler compatibility
    signal: new AbortController().signal,
    requestId: randomUUID(),
    // Add additional properties that handlers might expect
    request: {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    },
    meta: {
      progressToken: randomUUID(),
    },
  };

  // Call the existing handler with the context
  return await handler(args, handlerContext as any, memoryService);
}

// Register all our tools with the MCP server
function registerTools() {
  httpStreamLogger.info('Registering MCP tools...');

  // Add the initialize method handler (this is handled automatically by McpServer)
  // Just logging for debugging
  httpStreamLogger.debug('MCP server will handle initialization automatically');

  for (const tool of MEMORY_BANK_MCP_TOOLS) {
    httpStreamLogger.debug({ toolName: tool.name }, `Registering tool: ${tool.name}`);

    const zodRawShape = createZodRawShape(tool);

    // Use the simpler tool() method instead of registerTool()
    mcpServer.tool(
      tool.name,
      tool.description,
      zodRawShape,
      async (args): Promise<CallToolResult> => {
        const toolPerfLogger = createPerformanceLogger(httpStreamLogger, `tool-${tool.name}`);
        const requestId = randomUUID();
        const toolLogger = httpStreamLogger.child({
          tool: tool.name,
          requestId,
        });

        toolLogger.debug({ args }, `Executing tool: ${tool.name}`);

        try {
          // Handle clientProjectRoot storage for memory-bank init operations
          if (tool.name === 'memory-bank' && args.operation === 'init') {
            const repoBranchKey = createRepositoryBranchKey(args.repository, args.branch);
            repositoryRootMap.set(repoBranchKey, args.clientProjectRoot);
            toolLogger.debug(
              { repoBranchKey, clientProjectRoot: args.clientProjectRoot },
              `Stored clientProjectRoot for ${repoBranchKey}`,
            );
          }

          // Get clientProjectRoot from stored map or args
          let effectiveClientProjectRoot = args.clientProjectRoot;
          if (!effectiveClientProjectRoot && args.repository) {
            const repoBranchKey = createRepositoryBranchKey(args.repository, args.branch);
            effectiveClientProjectRoot = repositoryRootMap.get(repoBranchKey);
          }

          if (!effectiveClientProjectRoot) {
            throw new Error(
              `ClientProjectRoot not established for tool '${tool.name}'. Initialize memory bank first.`,
            );
          }

          // Get memory service instance
          const memoryService = await MemoryService.getInstance();

          // Add clientProjectRoot to args
          const enhancedArgs = { ...args, clientProjectRoot: effectiveClientProjectRoot };

          // Create a progress callback that can be used by the handler
          const progressCallback = async (progressData: any) => {
            // In the HTTP stream context, we can't send progress directly
            // The MCP SDK handles this automatically for streaming responses
            toolLogger.debug({ progressData, requestId }, 'Progress update');
          };

          // Execute tool logic directly using the official SDK approach
          const result = await executeToolDirectly(
            tool.name,
            enhancedArgs,
            memoryService,
            toolLogger,
            progressCallback,
          );

          toolPerfLogger.complete({ success: !!result });

          // Return the result in the proper MCP format
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          toolPerfLogger.fail(error as Error);
          logError(toolLogger, error as Error, { operation: 'tool-execution' });

          // Return error in proper MCP format
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  errorId: randomUUID(), // Generic error identifier for tracking without exposing internals
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  httpStreamLogger.info(
    { toolCount: MEMORY_BANK_MCP_TOOLS.length },
    `Registered ${MEMORY_BANK_MCP_TOOLS.length} tools`,
  );
}

// Server variables
let server: Server;
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Request size limits (in bytes)
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB - reasonable limit for MCP requests

/**
 * Validates request size to prevent memory exhaustion from large payloads.
 * Monitors the Content-Length header and tracks cumulative chunk sizes.
 */
function validateRequestSize(req: IncomingMessage, requestLogger: Logger): void {
  // Check Content-Length header if present
  const contentLength = req.headers['content-length'];
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (isNaN(size)) {
      requestLogger.warn({ contentLength }, 'Invalid Content-Length header');
    } else if (size > MAX_REQUEST_SIZE) {
      requestLogger.error(
        { contentLength: size, maxSize: MAX_REQUEST_SIZE },
        'Request size exceeds maximum allowed size'
      );
      throw new Error(`Request size ${size} bytes exceeds maximum allowed size ${MAX_REQUEST_SIZE} bytes`);
    }
  }
}

/**
 * Creates a size-limited request wrapper that prevents reading beyond MAX_REQUEST_SIZE.
 * This protects against requests without Content-Length headers or malicious clients.
 */
function createSizeLimitedRequest(req: IncomingMessage, requestLogger: Logger): IncomingMessage {
  let totalBytesRead = 0;

  // Create a proxy to intercept data events
  const originalOn = req.on.bind(req);
  const originalAddListener = req.addListener.bind(req);

  const wrapDataListener = (listener: (chunk: any) => void) => {
    return (chunk: Buffer | string) => {
      const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      totalBytesRead += chunkSize;

      if (totalBytesRead > MAX_REQUEST_SIZE) {
        requestLogger.error(
          { totalBytesRead, chunkSize, maxSize: MAX_REQUEST_SIZE },
          'Request size limit exceeded during reading'
        );

        // Emit an error to stop further processing
        req.emit('error', new Error(`Request size ${totalBytesRead} bytes exceeds maximum allowed size ${MAX_REQUEST_SIZE} bytes`));
        return;
      }

      // Call the original listener if size is within limits
      listener(chunk);
    };
  };

  // Override event registration methods to wrap data listeners
  req.on = function(event: string, listener: (...args: any[]) => void) {
    if (event === 'data') {
      return originalOn(event, wrapDataListener(listener));
    }
    return originalOn(event, listener);
  };

  req.addListener = function(event: string, listener: (...args: any[]) => void) {
    if (event === 'data') {
      return originalAddListener(event, wrapDataListener(listener));
    }
    return originalAddListener(event, listener);
  };

  return req;
}

// Helper function to handle POST requests
async function handlePostRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requestLogger: Logger,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Set a timeout for request processing
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
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
  }, 60000); // 60 second timeout

  try {
    // Validate request size before processing
    try {
      validateRequestSize(req, requestLogger);
    } catch (error) {
      clearTimeout(requestTimeout);
      requestLogger.error({ error }, 'Request size validation failed');
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Payload Too Large',
            data: error instanceof Error ? error.message : String(error),
          },
          id: null,
        }),
      );
      return;
    }

    // Create size-limited request wrapper
    const sizeLimitedReq = createSizeLimitedRequest(req, requestLogger);

    // Set up error handler for size limit violations during reading
    sizeLimitedReq.on('error', (error) => {
      if (!res.headersSent) {
        clearTimeout(requestTimeout);
        requestLogger.error({ error }, 'Request size limit exceeded during reading');
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Payload Too Large',
              data: error.message,
            },
            id: null,
          }),
        );
      }
    });

    // Keep timeout active during transport handling and tool execution

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      const transport = transports[sessionId];
      requestLogger.debug({ sessionId }, 'Reusing existing transport');

      try {
        // Let the transport handle the size-limited request and parse the body internally
        await transport.handleRequest(sizeLimitedReq, res);
        return;
      } catch (error) {
        requestLogger.error({ error, sessionId }, 'Error handling request with existing transport');
        // Clean up the broken transport
        delete transports[sessionId];
        throw error;
      }
    }

    if (!sessionId) {
      // Create new transport for initialization request
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true, // Support both JSON and SSE
        onsessioninitialized: (newSessionId: string) => {
          // Store the transport by session ID
          transports[newSessionId] = transport;
          requestLogger.debug({ sessionId: newSessionId }, 'New session initialized');
        },
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          requestLogger.debug({ sessionId: transport.sessionId }, 'Session transport cleaned up');
        }
      };

      try {
        // Connect the transport to the shared MCP server instance
        // This is the key fix - reuse the same server instance for all transports
        await mcpServer.connect(transport);
        requestLogger.debug('MCP server connected to new transport');

        // Let the transport handle the size-limited request and parse the body internally
        await transport.handleRequest(sizeLimitedReq, res);
        return;
      } catch (error) {
        requestLogger.error({ error }, 'Error handling request with new transport');
        // Clean up the failed transport
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
        throw error;
      }
    }

    // Invalid request - session ID provided but not found
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid session ID',
        },
        id: null,
      }),
    );
  } catch (error) {
    requestLogger.error({ error }, 'Unhandled error in POST request handler');
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: String(error),
          },
          id: null,
        }),
      );
    }
  } finally {
    // Clear timeout only after all request processing is complete
    clearTimeout(requestTimeout);
  }
}

// Helper function to handle GET requests (for SSE streams)
async function handleGetRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requestLogger: Logger,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid or missing session ID',
        },
        id: null,
      }),
    );
    return;
  }

  const transport = transports[sessionId];
  // Let the transport handle the GET request
  await transport.handleRequest(req, res);
}

// Helper function to handle DELETE requests (for session termination)
async function handleDeleteRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requestLogger: Logger,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid or missing session ID',
        },
        id: null,
      }),
    );
    return;
  }

  const transport = transports[sessionId];

  try {
    await transport.close();
    delete transports[sessionId];
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
        error: {
          code: -32603,
          message: 'Internal error during session termination',
        },
        id: null,
      }),
    );
  }
}

/**
 * Starts the MCP HTTP streaming server and begins listening for incoming requests.
 *
 * Initializes tool registration, sets up an HTTP server with session-aware routing for POST, GET, and DELETE methods, and handles server lifecycle events including error handling.
 *
 * @remark
 * The server manages multiple concurrent streaming sessions using session IDs and supports JSON-RPC over HTTP and Server-Sent Events (SSE).
 */
async function startServer(): Promise<void> {
  httpStreamLogger.info('Starting MCP HTTP Stream server...');

  // Register all tools
  registerTools();

  // Create simple HTTP server with proper session management
  server = createServer(async (req, res) => {
    const requestLogger = httpStreamLogger.child({
      requestId: randomUUID(),
      method: req.method,
      url: req.url,
    });

    try {
      requestLogger.debug(
        {
          headers: req.headers,
          method: req.method,
          url: req.url,
        },
        `HTTP ${req.method} ${req.url}`,
      );

      // Handle different HTTP methods
      if (req.method === 'POST') {
        await handlePostRequest(req, res, requestLogger);
      } else if (req.method === 'GET') {
        await handleGetRequest(req, res, requestLogger);
      } else if (req.method === 'DELETE') {
        await handleDeleteRequest(req, res, requestLogger);
      } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed',
            },
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
            error: {
              code: -32603,
              message: 'Internal error',
            },
          }),
        );
      }
    }
  });

  // Start listening
  server.listen(port, host, () => {
    const message = `MCP HTTP stream server listening at http://${host}:${port}`;
    httpStreamLogger.info({ host, port }, message);

    // EXPLICIT test detection message - required for E2E tests to detect server readiness
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      // Use stderr for test detection to avoid stdout pollution
      process.stderr.write(message + '\n');
    }
  });

  // Handle server errors
  server.on('error', (err: Error) => {
    logError(httpStreamLogger, err, { operation: 'http-server-error' });
    process.exit(1);
  });
}

/**
 * Performs a graceful shutdown of the HTTP streaming server and all active session transports.
 *
 * Closes the HTTP server, terminates all active session transports, and shuts down the {@link MemoryService} instance before exiting the process. If shutdown does not complete within 30 seconds, the process exits forcefully.
 *
 * @param signal - The termination signal that triggered the shutdown (e.g., "SIGTERM" or "SIGINT").
 */
function gracefulShutdown(signal: string): void {
  httpStreamLogger.info({ signal }, `Received ${signal}, starting graceful shutdown`);

  if (server) {
    // Start the shutdown timer immediately to ensure it's not blocked by async operations
    const shutdownTimer = setTimeout(() => {
      httpStreamLogger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000);

    // Perform async shutdown tasks independently to avoid blocking the server.close() callback
    const performAsyncShutdown = async () => {
      try {
        // Close all transports
        for (const [sessionId, transport] of Object.entries(transports)) {
          try {
            await transport.close();
            httpStreamLogger.debug({ sessionId }, 'Transport closed');
          } catch (error) {
            logError(httpStreamLogger, error as Error, { sessionId, operation: 'transport-close' });
          }
        }

        // Get MemoryService instance and shut it down
        try {
          const memoryService = await MemoryService.getInstance();
          await memoryService.shutdown();
          httpStreamLogger.info('MemoryService shutdown completed');
        } catch (error) {
          logError(httpStreamLogger, error as Error, { operation: 'memory-service-shutdown' });
        }

        httpStreamLogger.info('Async shutdown tasks completed');
      } catch (error) {
        logError(httpStreamLogger, error as Error, { operation: 'async-shutdown' });
      } finally {
        // Clear the timer and exit
        clearTimeout(shutdownTimer);
        process.exit(0);
      }
    };

    // Close the server and start async shutdown
    server.close(() => {
      httpStreamLogger.info('HTTP server closed');
      // Don't await here - let the callback resolve immediately
      performAsyncShutdown();
    });
  } else {
    process.exit(0);
  }
}

// Start the server only if this script is executed directly
if (require.main === module) {
  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Start the server
  startServer().catch((error) => {
    httpStreamLogger.error({ err: error }, 'Failed to start MCP HTTP Stream server');
    process.exit(1);
  });
}

export { mcpServer, transports };
