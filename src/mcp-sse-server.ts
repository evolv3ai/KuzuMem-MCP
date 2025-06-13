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

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configuration
const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || 'localhost';

// Debug level
const debugLevel = parseInt(process.env.DEBUG_LEVEL || '0', 10);

function debugLog(level: number, message: string, data?: any): void {
  if (debugLevel >= level) {
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console.error(`[DEBUG-${level}] ${new Date().toISOString()} ${message}${logData}`);
  }
}

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
    debugLog(2, 'New session initialized', { sessionId: currentSessionId });
  }
  return {
    protocolVersion: '2025-03-26',
    serverInfo: {
      name: 'KuzuMem-MCP-HTTPStream',
      version: '3.0.0',
    },
    capabilities: {
      tools: {
        listChanged: true,
      },
      resources: {},
      prompts: {},
    },
    sessionId: currentSessionId,
  };
});

// Handle list tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  debugLog(3, 'Listing tools');
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
  debugLog(3, `Executing tool: ${toolName}`);

  const toolDef = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
  const actualToolHandler = toolHandlers[toolName];

  if (!toolDef || !actualToolHandler) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  try {
    const validatedParams = request.params.arguments;
    const sessionId = currentSessionId;

    debugLog(3, `Tool args:`, validatedParams);
    debugLog(3, `Tool args.operation: ${validatedParams?.operation}`);
    debugLog(3, `Tool args.clientProjectRoot: ${validatedParams?.clientProjectRoot}`);

    let currentSessionData = sessionStore.get(sessionId);
    if (!currentSessionData) {
      debugLog(2, 'No session data found, initializing new session data', { sessionId });
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

      debugLog(2, 'Session data updated for memory-bank initialization', {
        sessionId,
        clientProjectRoot: validatedParams.clientProjectRoot,
        repository: validatedParams.repository,
        branch: validatedParams.branch,
      });
    }

    if (currentSessionData) {
      sessionStore.set(sessionId, currentSessionData);
    }

    const enrichedContext: any = {
      sessionId: sessionId,
      session: currentSessionData || {},
      logger: {
        debug: (msg: string, data?: any) => debugLog(3, `[${toolName}] ${msg}`, data),
        info: (msg: string, data?: any) => debugLog(2, `[${toolName}] ${msg}`, data),
        warn: (msg: string, data?: any) => debugLog(1, `[${toolName}] ${msg}`, data),
        error: (msg: string, data?: any) => debugLog(0, `[${toolName}] ${msg}`, data),
      },
      sendProgress: async (progressData: any) => {
        // SSE/HTTP Stream server could support progress notifications
        debugLog(3, 'Progress notification', progressData);
      },
    };

    // Create a new MemoryService instance on-demand
    let memoryServiceInstance: MemoryService;
    try {
      debugLog(3, 'Creating MemoryService instance');
      memoryServiceInstance = await MemoryService.getInstance(enrichedContext);
      debugLog(3, 'Successfully created MemoryService instance');
    } catch (error) {
      debugLog(0, `Failed to initialize memory service: ${error}`);
      throw new Error(
        `Failed to initialize memory service: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const result = await actualToolHandler(validatedParams, enrichedContext, memoryServiceInstance);

    debugLog(3, `Tool ${toolName} completed`, { success: !!result });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    debugLog(0, `Error executing tool ${toolName}`, error);
    throw error;
  }
});

// Server variables
let httpServer: HttpServer;
let transport: StreamableHTTPServerTransport;

async function startServer(): Promise<void> {
  debugLog(2, 'Starting MCP SSE server...');

  // Create the streamable HTTP transport
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Use SSE by default
  });

  // Connect the transport to the server
  await server.connect(transport);
  debugLog(3, 'MCP server connected to transport');

  // Create simple HTTP server - delegate everything to the transport
  httpServer = createServer(async (req, res) => {
    try {
      debugLog(3, `HTTP ${req.method} ${req.url}`, {
        headers: req.headers,
        method: req.method,
        url: req.url,
      });

      // Let the official transport handle all requests
      await transport.handleRequest(req, res);
    } catch (error) {
      debugLog(0, 'Error handling HTTP request', {
        error: error instanceof Error ? error.message : String(error),
        method: req.method,
        url: req.url,
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
    debugLog(2, `MCP SSE Server listening on port ${port}`);
    console.log(`MCP SSE Server listening on port ${port}`);
  });

  // Handle server errors
  httpServer.on('error', (err: Error) => {
    debugLog(0, `HTTP server error: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  debugLog(2, `Received ${signal}, starting graceful shutdown`);

  if (httpServer) {
    httpServer.close(async () => {
      debugLog(2, 'HTTP server closed');

      // Get MemoryService instance and shut it down
      try {
        const memoryService = await MemoryService.getInstance();
        await memoryService.shutdown();
      } catch (error) {
        console.error('Error shutting down MemoryService:', error);
      }

      process.exit(0);
    });

    setTimeout(() => {
      debugLog(0, 'Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
}

// Main execution
if (require.main === module) {
  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Start the server
  startServer().catch((error) => {
    debugLog(0, `Failed to start server: ${error.message}`, { stack: error.stack });
    process.exit(1);
  });
}

export { server, transport };
