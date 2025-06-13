/**
 * MCP HTTP Streaming Server
 * Implements the Model Context Protocol using the official TypeScript SDK
 * Based on the official TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  InitializeRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer, Server as HttpServer } from 'http';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { toolHandlers } from './mcp/tool-handlers';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools';
import { MemoryService } from './services/memory.service';
import { createPerformanceLogger, logError, loggers } from './utils/logger';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configuration
const port = parseInt(process.env.PORT || '8000', 10);
const host = process.env.HOST || 'localhost';

// Create SSE-specific logger
const sseLogger = loggers.mcpSSE();

// Debug level for backward compatibility with existing debug patterns
const debugLevel = parseInt(process.env.DEBUG_LEVEL || '0', 10);

// Map to store clientProjectRoot by repository:branch
const repositoryRootMap = new Map<string, string>();

// Session store
const sessionStore = new Map<
  string,
  { clientProjectRoot?: string; repository?: string; branch?: string }
>();
let currentSessionId = 'default-session';

// Create the low-level server
const server = new Server(
  {
    name: 'KuzuMem-MCP-HTTPStream',
    version: '3.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// Handle initialization
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  const sessionId = (request.params as any)?.sessionId || `session-${Date.now()}`;
  currentSessionId = sessionId;
  if (!sessionStore.has(currentSessionId)) {
    sessionStore.set(currentSessionId, {});
    sseLogger.debug({ sessionId: currentSessionId }, 'New session initialized');
  }
  return {
    protocolVersion: '2025-03-26',
    serverInfo: {
      name: 'KuzuMem-MCP-HTTPStream',
      version: '3.0.0',
    },
    capabilities: {
      tools: { listChanged: true },
    },
    resources: {},
    prompts: {},
    sessionId: currentSessionId,
  };
});

// Handle list tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  sseLogger.debug('Listing tools');
  const tools = MEMORY_BANK_MCP_TOOLS.map((toolDef) => ({
    name: toolDef.name,
    description: toolDef.description,
    inputSchema: toolDef.parameters,
  }));
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const toolPerfLogger = createPerformanceLogger(sseLogger, `tool-${toolName}`);

  sseLogger.debug({ toolName }, `Executing tool: ${toolName}`);

  const toolDef = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
  const actualToolHandler = toolHandlers[toolName];

  if (!toolDef || !actualToolHandler) {
    const error = new Error(`Tool not found: ${toolName}`);
    toolPerfLogger.fail(error);
    throw error;
  }

  try {
    const validatedParams = request.params.arguments;
    const sessionId = currentSessionId;

    const toolLogger = sseLogger.child({
      tool: toolName,
      sessionId: sessionId,
      requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });

    toolLogger.debug({ params: validatedParams }, 'Tool arguments received');
    toolLogger.debug({ operation: validatedParams?.operation }, 'Tool operation');
    toolLogger.debug(
      { clientProjectRoot: validatedParams?.clientProjectRoot },
      'Client project root',
    );

    let currentSessionData = sessionStore.get(sessionId);
    if (!currentSessionData) {
      toolLogger.debug({ sessionId }, 'No session data found, initializing new session data');
      currentSessionData = {
        clientProjectRoot: undefined,
        repository: undefined,
        branch: undefined,
      };
    }

    // Handle memory-bank init to store clientProjectRoot
    if (
      toolName === 'memory-bank' &&
      validatedParams &&
      typeof validatedParams === 'object' &&
      validatedParams.operation === 'init'
    ) {
      if (!currentSessionData) {
        currentSessionData = {
          clientProjectRoot: undefined,
          repository: undefined,
          branch: undefined,
        };
      }
      if (validatedParams.clientProjectRoot) {
        currentSessionData.clientProjectRoot = String(validatedParams.clientProjectRoot);
      }
      if (validatedParams.repository) {
        currentSessionData.repository = String(validatedParams.repository);
      }
      if (validatedParams.branch) {
        currentSessionData.branch = String(validatedParams.branch);
      }

      // Also store in repositoryRootMap for backward compatibility
      const repoBranchKey = `${validatedParams.repository}:${validatedParams.branch}`;
      repositoryRootMap.set(repoBranchKey, String(validatedParams.clientProjectRoot));

      toolLogger.info(
        {
          sessionId,
          clientProjectRoot: validatedParams.clientProjectRoot,
          repository: validatedParams.repository,
          branch: validatedParams.branch,
        },
        'Session data updated for memory-bank initialization',
      );
    }

    if (currentSessionData) {
      sessionStore.set(sessionId, currentSessionData);
    }

    const enrichedContext: any = {
      sessionId: sessionId,
      session: currentSessionData || {},
      logger: toolLogger, // Use the structured logger instead of the ad-hoc debug logger
      sendProgress: async (progressData: any) => {
        // SSE/HTTP Stream server could support progress notifications
        toolLogger.debug({ progressData }, 'Progress notification');
      },
    };

    // Create a new MemoryService instance on-demand
    let memoryServiceInstance: MemoryService;
    try {
      toolLogger.debug('Creating MemoryService instance');
      memoryServiceInstance = await MemoryService.getInstance(enrichedContext);
      toolLogger.debug('Successfully created MemoryService instance');
    } catch (error) {
      logError(toolLogger, error as Error, { operation: 'memory-service-initialization' });
      throw new Error(
        `Failed to initialize memory service: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const result = await actualToolHandler(validatedParams, enrichedContext, memoryServiceInstance);

    toolPerfLogger.complete({ success: !!result });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(sseLogger, error as Error, { toolName, operation: 'tool-execution' });
    toolPerfLogger.fail(error as Error);
    throw error;
  }
});

// Server variables
let httpServer: HttpServer;
let transport: StreamableHTTPServerTransport;

async function startServer(): Promise<void> {
  sseLogger.info('Starting MCP SSE server...');

  // Create the streamable HTTP transport
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Use SSE by default
  });

  // Connect the transport to the server
  await server.connect(transport);
  sseLogger.debug('MCP server connected to transport');

  // Create simple HTTP server - delegate everything to the transport
  httpServer = createServer(async (req, res) => {
    const requestLogger = sseLogger.child({
      requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

      // Let the official transport handle all requests
      await transport.handleRequest(req, res);
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
  httpServer.listen(port, host, () => {
    sseLogger.info(`MCP SSE server listening on http://${host}:${port}`);
  });

  // Handle server errors
  httpServer.on('error', (err: Error) => {
    logError(sseLogger, err, { operation: 'http-server-error' });
    process.exit(1);
  });
}

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  sseLogger.info({ signal }, `Received ${signal}, starting graceful shutdown`);

  if (httpServer) {
    httpServer.close(async () => {
      sseLogger.info('HTTP server closed');

      // Get MemoryService instance and shut it down
      try {
        const memoryService = await MemoryService.getInstance();
        await memoryService.shutdown();
        sseLogger.info('MemoryService shutdown completed');
      } catch (error) {
        logError(sseLogger, error as Error, { operation: 'memory-service-shutdown' });
      }

      process.exit(0);
    });

    setTimeout(() => {
      sseLogger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
}

// Start the server only if the script is executed directly
if (require.main === module) {
  startServer().catch((error) => {
    sseLogger.error({ error }, 'Failed to start MCP SSE server');
    process.exit(1);
  });
}

export { server, transport };
