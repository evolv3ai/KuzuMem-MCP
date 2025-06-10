/**
 * MCP HTTP Streaming Server
 * Official MCP TypeScript SDK implementation using McpServer and StreamableHTTPServerTransport
 * Based on: https://github.com/modelcontextprotocol/typescript-sdk
 */

import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

// Official MCP SDK imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Our tool handlers and services
import { toolHandlers as sdkToolHandlers } from './mcp/tool-handlers';
import { MemoryService } from './services/memory.service';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools';

// Load environment variables
dotenv.config();

// Server configuration
const port = parseInt(process.env.HTTP_STREAM_PORT || '3001', 10);
const host = process.env.HOST || 'localhost';

// Debug logging
const DEBUG_LEVEL = parseInt(process.env.DEBUG || '0', 10);

function debugLog(level: number, message: string, data?: any): void {
  if (DEBUG_LEVEL >= level) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level === 0 ? 'ERROR' : level === 1 ? 'WARN' : level === 2 ? 'INFO' : 'DEBUG',
      message,
      component: 'mcp-httpstream-server',
      data: DEBUG_LEVEL >= 3 ? data : undefined,
    };
    console.log(JSON.stringify(logEntry));
  }
}

// Map to store clientProjectRoot for each repository and branch
const repositoryRootMap = new Map<string, string>();

// Create the official MCP server
const mcpServer = new McpServer(
  { name: 'KuzuMem-MCP-HTTPStream', version: '1.0.0' },
  { capabilities: { tools: { list: true, call: true } } },
);

// Create tool schema helper
function createZodSchema(tool: any) {
  const shape: Record<string, z.ZodTypeAny> = {};

  if (tool.parameters && tool.parameters.properties) {
    for (const [propName, propDef] of Object.entries(tool.parameters.properties)) {
      const prop = propDef as any;
      let zodType: z.ZodTypeAny = z.string(); // Default to string

      if (prop.type === 'string') {
        zodType = z.string();
      } else if (prop.type === 'number') {
        zodType = z.number();
      } else if (prop.type === 'boolean') {
        zodType = z.boolean();
      } else if (prop.type === 'array') {
        zodType = z.array(z.string()); // Assume string array
      } else if (prop.type === 'object') {
        zodType = z.object({}).passthrough(); // Allow any object
      }

      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }

      // Handle optional fields
      if (!tool.parameters.required?.includes(propName)) {
        zodType = zodType.optional();
      }

      shape[propName] = zodType;
    }
  }

  return shape;
}

// Register all our tools with the MCP server
function registerTools() {
  debugLog(2, 'Registering MCP tools...');

  // Add the initialize method handler (this is handled automatically by McpServer)
  // Just logging for debugging
  debugLog(2, 'MCP server will handle initialization automatically');

  for (const tool of MEMORY_BANK_MCP_TOOLS) {
    debugLog(3, `Registering tool: ${tool.name}`);

    const schema = createZodSchema(tool);

    mcpServer.tool(
      tool.name,
      tool.description,
      schema as any, // Type assertion to bypass complex inference
      async (args, context): Promise<CallToolResult> => {
        debugLog(3, `Executing tool: ${tool.name}`, args);

        // Handle clientProjectRoot storage for memory-bank init operations
        if (tool.name === 'memory-bank' && args.operation === 'init') {
          const repoBranchKey = `${args.repository}:${args.branch}`;
          repositoryRootMap.set(repoBranchKey, args.clientProjectRoot);
          debugLog(3, `Stored clientProjectRoot for ${repoBranchKey}: ${args.clientProjectRoot}`);
        }

        // Get clientProjectRoot from stored map or args
        let effectiveClientProjectRoot = args.clientProjectRoot;
        if (!effectiveClientProjectRoot && args.repository && args.branch) {
          const repoBranchKey = `${args.repository}:${args.branch}`;
          effectiveClientProjectRoot = repositoryRootMap.get(repoBranchKey);
        }

        if (!effectiveClientProjectRoot) {
          throw new Error(
            `ClientProjectRoot not established for tool '${tool.name}'. Initialize memory bank first.`,
          );
        }

        // Get the SDK handler
        const handler = sdkToolHandlers[tool.name];
        if (!handler) {
          throw new Error(`Tool handler not found: ${tool.name}`);
        }

        // Create enriched context
        const memoryService = await MemoryService.getInstance();
        const enrichedContext = {
          ...context,
          logger: {
            debug: (msg: string, data?: any) => debugLog(3, `[${tool.name}] ${msg}`, data),
            info: (msg: string, data?: any) => debugLog(2, `[${tool.name}] ${msg}`, data),
            warn: (msg: string, data?: any) => debugLog(1, `[${tool.name}] ${msg}`, data),
            error: (msg: string, data?: any) => debugLog(0, `[${tool.name}] ${msg}`, data),
          },
          session: {
            clientProjectRoot: effectiveClientProjectRoot,
            repository: args.repository,
            branch: args.branch,
          },
          sendProgress: async (progressData: any) => {
            // Send progress notifications through MCP
            await context.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken: context.requestId || randomUUID(),
                ...progressData,
              },
            });
          },
          memoryService,
        };

        // Add clientProjectRoot to args
        const enhancedArgs = { ...args, clientProjectRoot: effectiveClientProjectRoot };

        const result = await handler(enhancedArgs, enrichedContext, memoryService);
        debugLog(3, `Tool ${tool.name} completed`, { success: !!result });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      },
    );
  }

  debugLog(2, `Registered ${MEMORY_BANK_MCP_TOOLS.length} tools`);
}

// Server variables
let server: Server;
let transport: StreamableHTTPServerTransport;

async function startServer(): Promise<void> {
  debugLog(2, 'Starting MCP HTTP Stream server...');

  // Register all tools
  registerTools();

  // Create the streamable HTTP transport
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Use SSE by default
  });

  // Connect the transport to the MCP server
  await mcpServer.connect(transport);
  debugLog(3, 'MCP server connected to transport');

  // Create simple HTTP server - delegate everything to the transport
  server = createServer(async (req, res) => {
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
  server.listen(port, host, () => {
    debugLog(2, `MCP HTTP Streaming Server running at http://${host}:${port}`);
    console.log(`MCP HTTP Streaming Server running at http://${host}:${port}`);
  });

  // Handle server errors
  server.on('error', (err: Error) => {
    debugLog(0, `HTTP server error: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  debugLog(2, `Received ${signal}, starting graceful shutdown`);

  if (server) {
    server.close(() => {
      debugLog(2, 'HTTP server closed');
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

export { mcpServer, transport };
