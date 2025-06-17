/**
 * MCP SSE Server
 * Implements the Model Context Protocol using the official TypeScript SDK with SSE support
 * Based on the official TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolResult, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer, Server as HttpServer } from 'http';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { z } from 'zod';
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

// Create the MCP server using high-level API
const mcpServer = new McpServer(
  {
    name: 'KuzuMem-MCP-SSE',
    version: '3.0.0',
  },
  {
    capabilities: {
      tools: { list: true, call: true },
      resources: {},
      prompts: {},
    },
  },
);

// Create tool schema helper
function createZodSchema(tool: any) {
  const shape: Record<string, z.ZodTypeAny> = {};

  if (tool.parameters?.properties) {
    for (const [propName, propDef] of Object.entries(tool.parameters.properties)) {
      const prop = propDef as any;
      let zodType: z.ZodTypeAny;

      switch (prop.type) {
        case 'string':
          zodType = z.string();
          break;
        case 'number':
          zodType = z.number();
          break;
        case 'boolean':
          zodType = z.boolean();
          break;
        case 'array':
          zodType = z.array(z.any());
          break;
        case 'object':
          zodType = z.object({}).passthrough();
          break;
        default:
          zodType = z.any();
      }

      // Handle optional fields
      if (!tool.parameters.required?.includes(propName)) {
        zodType = zodType.optional();
      }

      shape[propName] = zodType;
    }
  }

  return z.object(shape);
}

// Register all our tools with the MCP server
function registerTools() {
  sseLogger.info('Registering MCP tools...');

  for (const tool of MEMORY_BANK_MCP_TOOLS) {
    sseLogger.debug({ toolName: tool.name }, `Registering tool: ${tool.name}`);

    const schema = createZodSchema(tool);

    mcpServer.tool(
      tool.name,
      tool.description,
      schema as any, // Type assertion to bypass complex inference
      async (args, context): Promise<CallToolResult> => {
        const toolPerfLogger = createPerformanceLogger(sseLogger, `tool-${tool.name}`);
        const toolLogger = sseLogger.child({
          tool: tool.name,
          requestId: context.requestId || randomUUID(),
        });

        toolLogger.debug({ args }, `Executing tool: ${tool.name}`);

        try {
          const handler = toolHandlers[tool.name];
          if (!handler) {
            throw new Error(`Tool handler not found: ${tool.name}`);
          }

          // Handle clientProjectRoot resolution
          let effectiveClientProjectRoot = args.clientProjectRoot;
          if (!effectiveClientProjectRoot && args.repository && args.branch) {
            const repoBranchKey = `${args.repository}:${args.branch}`;
            effectiveClientProjectRoot = repositoryRootMap.get(repoBranchKey);
          }

          // Store clientProjectRoot for future use
          if (effectiveClientProjectRoot && args.repository && args.branch) {
            const repoBranchKey = `${args.repository}:${args.branch}`;
            repositoryRootMap.set(repoBranchKey, effectiveClientProjectRoot);
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

  sseLogger.info(
    { toolCount: MEMORY_BANK_MCP_TOOLS.length },
    `Registered ${MEMORY_BANK_MCP_TOOLS.length} tools`,
  );
}

// Server variables
let httpServer: HttpServer;
let transport: StreamableHTTPServerTransport;

async function startServer(): Promise<void> {
  sseLogger.info('Starting MCP SSE server...');

  // Register all tools
  registerTools();

  // Create the streamable HTTP transport with proper configuration for SSE
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Prefer SSE format for SSE server
  });

  // Connect the transport to the MCP server
  await mcpServer.connect(transport);
  sseLogger.debug('MCP server connected to transport');

  // Create simple HTTP server - delegate everything to the transport
  httpServer = createServer(async (req, res) => {
    const requestLogger = sseLogger.child({
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

      // Close transport
      if (transport) {
        try {
          await transport.close();
          sseLogger.debug('Transport closed');
        } catch (error) {
          logError(sseLogger, error as Error, { operation: 'transport-close' });
        }
      }

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

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server only if the script is executed directly
if (require.main === module) {
  startServer().catch((error) => {
    sseLogger.error({ error }, 'Failed to start MCP SSE server');
    process.exit(1);
  });
}

export { mcpServer, transport };
