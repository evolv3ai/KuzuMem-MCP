/**
 * MCP HTTP Streaming Server
 * Implements the Model Context Protocol using the official TypeScript SDK
 * Based on the TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools';
import { toolHandlers } from './mcp/tool-handlers';
import { ToolExecutionService } from './mcp/services/tool-execution.service';

// Load environment variables
dotenv.config();

const HTTP_STREAM_PROJECT_ROOT = process.env.HTTP_STREAM_PROJECT_ROOT;
if (!HTTP_STREAM_PROJECT_ROOT) {
  console.warn(
    'WARNING: HTTP_STREAM_PROJECT_ROOT is not set. The server will rely entirely on client-provided project roots for memory operations.',
  );
}

// The server's own root, mainly for logging or if it ever had server-specific static assets.
const absoluteHttpStreamServerOperationalRoot = HTTP_STREAM_PROJECT_ROOT
  ? path.resolve(HTTP_STREAM_PROJECT_ROOT)
  : process.cwd();
console.error(
  `MCP HTTP Stream server operational root: ${absoluteHttpStreamServerOperationalRoot}`,
);

// Debug levels
const DEBUG_LEVEL = process.env.DEBUG ? parseInt(process.env.DEBUG, 10) || 1 : 0;

function debugLog(level: number, message: string, data?: any): void {
  if (DEBUG_LEVEL >= level) {
    if (data) {
      console.error(
        `[MCP-HTTP-DEBUG${level}] ${message}`,
        typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      );
    } else {
      console.error(`[MCP-HTTP-DEBUG${level}] ${message}`);
    }
  }
}

// Create Express app
export const app = express();
const port = process.env.HTTP_STREAM_PORT || 3001;
const host = process.env.HOST || 'localhost';

// Configure middleware
app.use(express.json({ limit: '5mb' }));
app.use(cors());

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Create an MCP server
function createMcpServer(): Server {
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

  // Set up the list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    debugLog(1, `Returning tools/list with ${MEMORY_BANK_MCP_TOOLS.length} tools`);

    const tools = MEMORY_BANK_MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters || { type: 'object', properties: {}, required: [] },
    }));

    return { tools };
  });

  // Set up the call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: toolArgs = {} } = request.params;
    const requestId = 'id' in request ? String(request.id) : 'unknown';

    debugLog(1, `Handling tools/call for tool: ${toolName}`);

    const toolDefinition = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
    if (!toolDefinition) {
      throw new Error(`Tool '${toolName}' not found.`);
    }

    // For init-memory-bank, clientProjectRoot comes from toolArgs.
    // For others, we use the provided clientProjectRoot from tool arguments
    const effectiveClientProjectRoot = toolArgs.clientProjectRoot;

    if (!effectiveClientProjectRoot) {
      throw new Error(
        toolName === 'init-memory-bank'
          ? 'Invalid params: clientProjectRoot is required in tool arguments for init-memory-bank'
          : `Server error: clientProjectRoot context not established for tool '${toolName}'. Provide clientProjectRoot in tool arguments.`,
      );
    }

    try {
      // For the official MCP SDK HTTP transport, we don't need the custom progress handler
      // The official SDK handles progress internally
      const toolExecutionService = await ToolExecutionService.getInstance();

      const toolResult = await toolExecutionService.executeTool(
        toolName,
        toolArgs,
        toolHandlers,
        effectiveClientProjectRoot,
        undefined, // No progress handler for HTTP transport
        debugLog,
      );

      if (toolResult !== null) {
        return {
          content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
          isError: !!toolResult?.error,
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Tool executed successfully' }],
        };
      }
    } catch (err: any) {
      debugLog(
        0,
        `FATAL ERROR (tools/call in http-server): ${err.message || String(err)}`,
        err.stack,
      );
      throw new Error(`Server error: ${err.message || String(err)}`);
    }
  });

  // Set up the list resources handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: [] };
  });

  // Set up the list prompts handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: [] };
  });

  return server;
}

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req: Request, res: Response) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      },
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const server = createMcpServer();
    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

// Legacy endpoints for backward compatibility
app.post('/initialize', (req: Request, res: Response) => {
  const requestedVersion = req.body?.protocolVersion || '0.1';
  const requestId = req.body?.id || null;

  debugLog(1, `Legacy initialize request with protocolVersion: ${requestedVersion}`);

  res.json({
    jsonrpc: '2.0',
    id: requestId,
    result: {
      protocolVersion: requestedVersion,
      capabilities: {
        tools: { list: true, call: true },
      },
      serverInfo: {
        name: 'KuzuMem-MCP-HTTPStream',
        version: '3.0.0',
      },
    },
  });
});

app.get('/tools/list', (req, res) => {
  debugLog(1, `Legacy tools/list request`);

  const tools = MEMORY_BANK_MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
    outputSchema: tool.returns,
    annotations: tool.annotations,
  }));

  res.json({ tools });
});

// Start the server
export async function startServer(): Promise<void> {
  app.listen(port, () => {
    console.log(`MCP HTTP Streaming Server running at http://${host}:${port}`);
  });
}

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  console.log(`Received ${signal}. Gracefully shutting down...`);
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start MCP HTTP streaming server:', error);
    process.exit(1);
  });
}
