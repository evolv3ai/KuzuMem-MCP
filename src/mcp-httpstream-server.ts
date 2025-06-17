/**
 * MCP HTTP Streaming Server
 * Official MCP TypeScript SDK implementation using McpServer and StreamableHTTPServerTransport
 * Based on: https://github.com/modelcontextprotocol/typescript-sdk
 */

import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { type Logger } from 'pino';
import { z } from 'zod';

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

// Load environment variables
dotenv.config();

// Server configuration
const port = parseInt(process.env.HTTP_STREAM_PORT || '8001', 10);
const host = process.env.HOST || 'localhost';

// Create HTTP stream specific logger
const httpStreamLogger = loggers.mcpHttp();

// Map to store clientProjectRoot for each repository and branch
const repositoryRootMap = new Map<string, string>();

/**
 * Helper function to create consistent repository:branch keys for repositoryRootMap.
 * Ensures that undefined or missing branch values default to "main" to prevent key mismatches.
 */
function createRepositoryBranchKey(repository: string, branch?: string): string {
  const normalizedBranch = branch || 'main';
  return `${repository}:${normalizedBranch}`;
}

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
): Promise<any> {
  logger.debug({ toolName, args }, 'Executing tool using existing handlers');

  // Get the handler for this tool
  const handler = toolHandlers[toolName];
  if (!handler) {
    throw new Error(`No handler found for tool: ${toolName}`);
  }

  // Create a minimal context object for the handler
  const handlerContext = {
    logger,
    session: {
      clientProjectRoot: args.clientProjectRoot,
      repository: args.repository,
      branch: args.branch,
    },
    sendProgress: async (progressData: any) => {
      // Log progress since we don't have transport context in pure SDK approach
      logger.info({ progressData }, 'Progress notification');
    },
    // Add minimal required properties for handler compatibility
    signal: new AbortController().signal,
    requestId: randomUUID(),
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
        const toolLogger = httpStreamLogger.child({
          tool: tool.name,
          requestId: randomUUID(), // Generate our own request ID
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

          // Execute tool logic directly using the official SDK approach
          const result = await executeToolDirectly(tool.name, enhancedArgs, memoryService, toolLogger);
          toolPerfLogger.complete({ success: !!result });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        } catch (error) {
          toolPerfLogger.fail(error as Error);
          logError(toolLogger, error as Error, { operation: 'tool-execution' });
          throw error;
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

// Helper function to handle POST requests
async function handlePostRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requestLogger: Logger,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Parse the request body first - this is critical for proper transport handling
  let parsedBody: unknown;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();
    parsedBody = JSON.parse(body);
  } catch (error) {
    requestLogger.error({ error }, 'Failed to parse request body');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error',
        data: String(error)
      },
      id: null
    }));
    return;
  }

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    const transport = transports[sessionId];
    requestLogger.debug({ sessionId }, 'Reusing existing transport');

    // Handle the request with existing transport - CRITICAL: include parsed body
    await transport.handleRequest(req, res, parsedBody);
    return;
  }

  if (!sessionId) {
    // Create new transport for initialization request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true, // Support both JSON and SSE
      onsessioninitialized: (sessionId: string) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
        requestLogger.debug({ sessionId }, 'New session initialized');
      },
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        requestLogger.debug({ sessionId: transport.sessionId }, 'Session transport cleaned up');
      }
    };

    // Connect the transport to the shared MCP server instance
    // This is the key fix - reuse the same server instance for all transports
    await mcpServer.connect(transport);
    requestLogger.debug('MCP server connected to new transport');

    // Let the transport handle the request with the parsed body - CRITICAL: include parsed body
    await transport.handleRequest(req, res, parsedBody);
    return;
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
  // GET requests don't have a body, so pass undefined for parsedBody
  await transport.handleRequest(req, res, undefined);
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
