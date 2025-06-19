// CRITICAL: Set environment variables FIRST before any imports
// This prevents debug output from other components during MCP stdio server startup
// Only set NODE_ENV to production if we're not in a test environment
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  process.env.NODE_ENV = 'production'; // This ensures JSON logging instead of pretty
}
process.env.PINO_PRETTY = 'false'; // Explicitly disable pretty printing
process.env.MCP_STDIO_SERVER = 'true'; // Suppress debug output from other components

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { toolHandlers } from './mcp/tool-handlers';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools/index';
import { ToolHandlerContext } from './mcp/types/sdk-custom';
import { createRepositoryBranchKey } from './mcp/utils/repository-utils';
import { createZodRawShape } from './mcp/utils/schema-utils';
import { MemoryService } from './services/memory.service';
import {
  createPerformanceLogger,
  enforceStdioCompliance,
  logError,
  mcpStdioLogger,
} from './utils/logger';

// CRITICAL: Enforce stdio compliance immediately to prevent stdout pollution
enforceStdioCompliance();

// Determine Client Project Root at startup (for context only, not for DB initialization)
const serverCwd = process.cwd();
// mcpStdioLogger.debug(
//   { cwd: serverCwd },
//   'MCP stdio server CWD (Current Working Directory): Note: Actual memory bank paths are determined by \'memory-bank\' tool calls per repository/branch.',
// );

if (process.env.DB_PATH_OVERRIDE) {
  mcpStdioLogger.warn(
    {
      dbPathOverride: process.env.DB_PATH_OVERRIDE,
      warning: 'Global DB path override detected',
    },
    'DB_PATH_OVERRIDE environment variable is set. This will force all KuzuDBClient instances to use this single, globally overridden path. This is intended for specific testing scenarios and will break multi-project isolation in a typical IDE setup. Unset this variable for normal operation in IDE environments.',
  );
}

// Add a re-entrancy guard to prevent concurrent shutdown executions
let isShuttingDown = false;

// Graceful shutdown function
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    mcpStdioLogger.debug({ signal }, 'Shutdown already in progress, ignoring subsequent signal.');
    return;
  }
  isShuttingDown = true;

  mcpStdioLogger.info({ signal }, `Received ${signal}, starting graceful shutdown`);

  // For stdio servers, we need to gracefully close connections and clean up
  const cleanup = async (): Promise<void> => {
    try {
      // Get MemoryService instance and shut it down if it exists
      // We'll try to get any existing instances to clean them up
      mcpStdioLogger.info('Starting cleanup process');

      // Get the MemoryService instance and shut it down to ensure all KuzuDB connections are closed.
      const memoryService = await MemoryService.getInstance();
      if (memoryService) {
        await memoryService.shutdown();
      }

      mcpStdioLogger.info('Cleanup completed');
    } catch (error) {
      logError(mcpStdioLogger, error as Error, { operation: 'graceful-shutdown-cleanup' });
      // Re-throw to allow the main handler to catch it and exit.
      throw error;
    }
  };

  // Timeout for forced exit
  const timeout = setTimeout(() => {
    mcpStdioLogger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000); // 10 second timeout for stdio server

  try {
    await cleanup();
    clearTimeout(timeout);
    mcpStdioLogger.info('Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    logError(mcpStdioLogger, error as Error, { operation: 'graceful-shutdown-failure' });
    process.exit(1);
  }
}

// Ensure unhandled promise rejections are caught and the process exits correctly.
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch((err) => {
    logError(mcpStdioLogger, err as Error, { operation: 'unhandled-shutdown-error' });
    process.exit(1);
  });
});
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch((err) => {
    logError(mcpStdioLogger, err as Error, { operation: 'unhandled-shutdown-error' });
    process.exit(1);
  });
});

import packageJson from '../package.json';

// Map to store clientProjectRoot by repository:branch (similar to HTTP server)
const repositoryRootMap = new Map<string, string>();

// Create the MCP server using high-level API (consistent with HTTP server)
const mcpServer = new McpServer(
  {
    name: packageJson.name,
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: { list: true, call: true, listChanged: true },
      resources: {},
      prompts: {},
    },
  },
);

/**
 * Register all tools with the MCP server using the official SDK approach.
 * This follows the same pattern as the HTTP server for consistency.
 */
function registerTools(): void {
  mcpStdioLogger.info('Registering MCP tools...');

  for (const tool of MEMORY_BANK_MCP_TOOLS) {
    mcpStdioLogger.debug({ toolName: tool.name }, `Registering tool: ${tool.name}`);

    const zodRawShape = createZodRawShape(tool);

    // Use the official SDK tool() method (same as HTTP server)
    mcpServer.tool(
      tool.name,
      tool.description,
      zodRawShape,
      async (args): Promise<CallToolResult> => {
        const toolPerfLogger = createPerformanceLogger(mcpStdioLogger, `tool-${tool.name}`);
        const toolLogger = mcpStdioLogger.child({
          tool: tool.name,
          requestId: randomUUID(),
        });

        try {
          toolLogger.debug({ params: args }, 'Tool execution started');

          // Handle clientProjectRoot storage for memory-bank init operations
          if (tool.name === 'memory-bank' && args.operation === 'init') {
            const repoBranchKey = createRepositoryBranchKey(args.repository, args.branch);
            repositoryRootMap.set(repoBranchKey, args.clientProjectRoot);
            toolLogger.debug(
              { repoBranchKey, clientProjectRoot: args.clientProjectRoot },
              `Stored clientProjectRoot for ${repoBranchKey}`,
            );
          }

          // Determine effective clientProjectRoot
          const effectiveClientProjectRoot =
            args.clientProjectRoot ||
            repositoryRootMap.get(createRepositoryBranchKey(args.repository, args.branch));

          if (!effectiveClientProjectRoot) {
            throw new Error(
              `No clientProjectRoot found for repository: ${args.repository}, branch: ${args.branch}. Use memory-bank tool with operation "init" first.`,
            );
          }

          // Get memory service instance
          const memoryService = await MemoryService.getInstance();

          // Add clientProjectRoot to args with consistent branch handling
          const enhancedArgs = {
            ...args,
            clientProjectRoot: effectiveClientProjectRoot,
            repository: (args as any).repository || 'unknown',
            branch: (args as any).branch || 'main',
          };

          // Execute tool logic using existing handlers (same as HTTP server)
          const handler = toolHandlers[tool.name];
          if (!handler) {
            throw new Error(`No handler found for tool: ${tool.name}`);
          }

          // Create a minimal context object for the handler
          const handlerContext: ToolHandlerContext = {
            logger: toolLogger,
            session: {
              clientProjectRoot: effectiveClientProjectRoot,
              repository: enhancedArgs.repository,
              branch: enhancedArgs.branch,
            },
            sendProgress: async (progressData: any) => {
              // STDIO doesn't support progress notifications, just log
              toolLogger.info({ progressData }, 'Progress notification (stdio no-op)');
            },
            // Add minimal required properties for handler compatibility
            signal: new AbortController().signal,
            requestId: randomUUID(),
          };

          const result = await handler(enhancedArgs, handlerContext, memoryService);
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

  mcpStdioLogger.info(
    { toolCount: MEMORY_BANK_MCP_TOOLS.length },
    `Registered ${MEMORY_BANK_MCP_TOOLS.length} tools`,
  );
}

/**
 * Initializes and starts the MCP stdio server using the official SDK high-level API.
 * This follows the same patterns as the HTTP server for consistency.
 */
async function main() {
  mcpStdioLogger.info('MCP Stdio Server initializing...');

  // Register all tools
  registerTools();

  // Connect to transport using the high-level API
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  mcpStdioLogger.info('MCP Server (stdio) initialized and listening');

  // EXPLICIT test detection message - required for E2E tests to detect server readiness
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
    // Use stderr for test detection to avoid stdout pollution
    process.stderr.write('MCP Server (stdio) initialized and listening\n');
  }
}

// Start the server only if the script is executed directly
if (require.main === module) {
  main().catch((err) => {
    logError(mcpStdioLogger, err, { operation: 'main-execution-error' });
    process.exit(1);
  });
}
