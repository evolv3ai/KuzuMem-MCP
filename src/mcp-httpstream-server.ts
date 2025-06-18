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

// Remove custom executeToolDirectly - we'll use the official SDK pattern directly

// Register all our tools with the MCP server
function registerTools() {
  httpStreamLogger.info('Registering MCP tools...');

  // Add the initialize method handler (this is handled automatically by McpServer)
  // Just logging for debugging
  httpStreamLogger.debug('MCP server will handle initialization automatically');

  for (const tool of MEMORY_BANK_MCP_TOOLS) {
    httpStreamLogger.debug({ toolName: tool.name }, `Registering tool: ${tool.name}`);

    const zodRawShape = createZodRawShape(tool);

    // Use the official registerTool method following SDK patterns
    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: zodRawShape,
      },
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
          const enhancedArgs = { ...args, clientProjectRoot: effectiveClientProjectRoot } as any;

          // Get the tool handler directly
          const handler = toolHandlers[tool.name];
          if (!handler) {
            throw new Error(`No handler found for tool: ${tool.name}`);
          }

          // Create a minimal context object - no sendProgress since SDK doesn't support it
          const handlerContext = {
            logger: toolLogger,
            session: {
              clientProjectRoot: effectiveClientProjectRoot,
              repository: enhancedArgs.repository || 'unknown',
              branch: enhancedArgs.branch || 'main',
            },
            sendProgress: async () => {
              // No-op - MCP SDK doesn't support progress for individual tools
            },
            signal: new AbortController().signal,
            requestId,
          };

          // Execute the handler directly
          const result = await handler(enhancedArgs, handlerContext as any, memoryService);

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
 * Creates a size-limited request wrapper that tracks cumulative chunk sizes
 * while preserving the original request interface for MCP transport compatibility.
 *
 * This provides robust protection against oversized requests by monitoring
 * actual data flow, not just headers which can be spoofed or omitted.
 */
function createSizeLimitedRequest(req: IncomingMessage, requestLogger: Logger): IncomingMessage {
  let cumulativeSize = 0;
  let sizeLimitExceeded = false;

  // First, validate Content-Length header if present (fast fail for obvious oversized requests)
  const contentLength = req.headers['content-length'];
  if (contentLength) {
    const declaredSize = parseInt(contentLength, 10);
    if (isNaN(declaredSize)) {
      requestLogger.warn({ contentLength }, 'Invalid Content-Length header');
    } else if (declaredSize > MAX_REQUEST_SIZE) {
      requestLogger.error(
        { contentLength: declaredSize, maxSize: MAX_REQUEST_SIZE },
        'Request size exceeds maximum allowed size (Content-Length check)'
      );
      throw new Error(`Request size ${declaredSize} bytes exceeds maximum allowed size ${MAX_REQUEST_SIZE} bytes`);
    }
  }

  // Create a proxy that intercepts data events to track cumulative size
  // This preserves the original request interface while adding size monitoring
  const originalOn = req.on.bind(req);
  const originalAddListener = req.addListener.bind(req);

  // Override event listeners to intercept 'data' events
  req.on = function(event: string | symbol, listener: (...args: any[]) => void) {
    if (event === 'data') {
      // Wrap the data listener to track cumulative size
      const wrappedListener = (chunk: Buffer | string) => {
        if (sizeLimitExceeded) {
          return; // Don't process more data if limit already exceeded
        }

        const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, 'utf8');
        cumulativeSize += chunkSize;

        if (cumulativeSize > MAX_REQUEST_SIZE) {
          sizeLimitExceeded = true;
          requestLogger.error(
            { cumulativeSize, chunkSize, maxSize: MAX_REQUEST_SIZE },
            'Request size limit exceeded during streaming'
          );

          // Emit an error to terminate the request processing
          req.emit('error', new Error(`Request size ${cumulativeSize} bytes exceeds maximum allowed size ${MAX_REQUEST_SIZE} bytes`));
          return;
        }

        requestLogger.debug(
          { cumulativeSize, chunkSize, maxSize: MAX_REQUEST_SIZE },
          'Request chunk processed'
        );

        // Call the original listener with the chunk
        listener(chunk);
      };

      return originalOn.call(this, event, wrappedListener);
    }

    // For all other events, use the original listener
    return originalOn.call(this, event, listener);
  };

  // Also override addListener (alias for on)
  req.addListener = function(event: string | symbol, listener: (...args: any[]) => void) {
    return req.on(event, listener);
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

  // Set up timeout protection that monitors response completion
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
  }, 30000); // 30 second timeout

  // Monitor response completion to clear timeout
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void) {
    requestCompleted = true;
    clearTimeout(requestTimeout);
    return originalEnd.call(this, chunk, encoding as any, cb);
  };

  try {
    // Create size-limited request wrapper with streaming back-pressure
    let sizeLimitedReq: IncomingMessage;
    try {
      sizeLimitedReq = createSizeLimitedRequest(req, requestLogger);
    } catch (error) {
      clearTimeout(requestTimeout);
      requestLogger.error({ error }, 'Request size validation failed (Content-Length check)');
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

    // Set up error handler for streaming size limit violations
    sizeLimitedReq.on('error', (error) => {
      if (!requestCompleted && !res.headersSent) {
        clearTimeout(requestTimeout);
        requestLogger.error({ error }, 'Request size limit exceeded during streaming');
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

    // Keep timeout active - it will be cleared when response completes
    // This provides protection against hanging requests while not interfering
    // with the MCP transport layer's internal operations

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      const transport = transports[sessionId];
      requestLogger.debug({ sessionId }, 'Reusing existing transport');

      try {
        // Use size-limited request for robust protection against oversized payloads
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

        // Use size-limited request for robust protection against oversized payloads
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
