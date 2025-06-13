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
import { loggers, createPerformanceLogger, logError } from './utils/logger';

// Load environment variables
dotenv.config();

// Server configuration
const port = parseInt(process.env.HTTP_STREAM_PORT || '3001', 10);
const host = process.env.HOST || 'localhost';

// Create HTTP stream specific logger
const httpStreamLogger = loggers.mcpHttp();

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
  httpStreamLogger.info('Registering MCP tools...');

  // Add the initialize method handler (this is handled automatically by McpServer)
  // Just logging for debugging
  httpStreamLogger.debug('MCP server will handle initialization automatically');

  for (const tool of MEMORY_BANK_MCP_TOOLS) {
    httpStreamLogger.debug({ toolName: tool.name }, `Registering tool: ${tool.name}`);

    const schema = createZodSchema(tool);

    mcpServer.tool(
      tool.name,
      tool.description,
      schema as any, // Type assertion to bypass complex inference
      async (args, context): Promise<CallToolResult> => {
        const toolPerfLogger = createPerformanceLogger(httpStreamLogger, `tool-${tool.name}`);
        const toolLogger = httpStreamLogger.child({
          tool: tool.name,
          requestId: context.requestId || randomUUID(),
        });

        toolLogger.debug({ args }, `Executing tool: ${tool.name}`);

        try {
          // Handle clientProjectRoot storage for memory-bank init operations
          if (tool.name === 'memory-bank' && args.operation === 'init') {
            const repoBranchKey = `${args.repository}:${args.branch}`;
            repositoryRootMap.set(repoBranchKey, args.clientProjectRoot);
            toolLogger.debug(
              { repoBranchKey, clientProjectRoot: args.clientProjectRoot },
              `Stored clientProjectRoot for ${repoBranchKey}`,
            );
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
            logger: toolLogger, // Use structured logger instead of custom debug function
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
let transport: StreamableHTTPServerTransport;

async function startServer(): Promise<void> {
  httpStreamLogger.info('Starting MCP HTTP Stream server...');

  // Register all tools
  registerTools();

  // Create the streamable HTTP transport
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Use SSE by default
  });

  // Connect the transport to the MCP server
  await mcpServer.connect(transport);
  httpStreamLogger.debug('MCP server connected to transport');

  // Create simple HTTP server - delegate everything to the transport
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
  server.listen(port, host, () => {
    httpStreamLogger.info(
      { port, host, url: `http://${host}:${port}` },
      `MCP HTTP Streaming Server running at http://${host}:${port}`,
    );
  });

  // Handle server errors
  server.on('error', (err: Error) => {
    logError(httpStreamLogger, err, { operation: 'http-server-error' });
    process.exit(1);
  });
}

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  httpStreamLogger.info({ signal }, `Received ${signal}, starting graceful shutdown`);

  if (server) {
    server.close(() => {
      httpStreamLogger.info('HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      httpStreamLogger.error('Graceful shutdown timed out, forcing exit');
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
    logError(httpStreamLogger, error as Error, { operation: 'server-startup' });
    process.exit(1);
  });
}

export { mcpServer, transport };
