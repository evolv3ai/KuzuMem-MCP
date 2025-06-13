// CRITICAL: Set environment variables FIRST before any imports
// This prevents debug output from other components during MCP stdio server startup
// Only set NODE_ENV to production if we're not in a test environment
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  process.env.NODE_ENV = 'production'; // This ensures JSON logging instead of pretty
}
process.env.PINO_PRETTY = 'false'; // Explicitly disable pretty printing
process.env.MCP_STDIO_SERVER = 'true'; // Suppress debug output from other components

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  InitializeRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as toolSchemas from './mcp/schemas/unified-tool-schemas';
import { toolHandlers } from './mcp/tool-handlers';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools/index';
import { McpProgressNotification } from './mcp/types/sdk-custom';
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

      // Note: We can't easily get all MemoryService instances since they're created on-demand
      // But the process exit will clean them up anyway

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

// Simple session store (example - replace with a more robust solution if needed)
const sessionStore = new Map<
  string,
  { clientProjectRoot?: string; repository?: string; branch?: string }
>();
let currentSessionId = 'default-session'; // Fallback session ID

// Helper function to derive schema name for unified tools
function getSchemaKeyForTool(toolName: string): keyof typeof toolSchemas | undefined {
  // Map unified tool names to their schema names
  const unifiedToolSchemas: Record<string, string> = {
    'memory-bank': 'MemoryBankInputSchema',
    entity: 'EntityInputSchema',
    introspect: 'IntrospectInputSchema',
    context: 'ContextInputSchema',
    query: 'QueryInputSchema',
    associate: 'AssociateInputSchema',
    analyze: 'AnalyzeInputSchema',
    detect: 'DetectInputSchema',
    'bulk-import': 'BulkImportInputSchema',
    search: 'SearchInputSchema',
  };

  const schemaKey = unifiedToolSchemas[toolName];

  if (schemaKey && schemaKey in toolSchemas) {
    return schemaKey as keyof typeof toolSchemas;
  }
  return undefined;
}

async function main() {
  mcpStdioLogger.info('MCP Stdio Server initializing...');

  // We no longer initialize a global MemoryService during startup
  // Each MCP tool handler will create or retrieve a MemoryService instance on-demand and specific to each clientProjectRoot
  mcpStdioLogger.debug('MemoryService initialization deferred until needed by tool handlers');

  const serverInfo = {
    name: packageJson.name,
    version: packageJson.version,
  };

  mcpStdioLogger.debug({ serverInfo }, 'Server configuration');

  // Use low-level Server for full control
  const server = new Server(serverInfo, {
    capabilities: {
      tools: {},
    },
  });

  // Handle Initialize request to set up session
  server.setRequestHandler(InitializeRequestSchema, async (request) => {
    const sessionId = (request.params as any)?.sessionId || `session-${Date.now()}`;
    currentSessionId = sessionId;
    if (!sessionStore.has(currentSessionId)) {
      sessionStore.set(currentSessionId, {});
      mcpStdioLogger.info({ sessionId: currentSessionId }, 'New session initialized');
    }
    return {
      protocolVersion: '2025-03-26',
      serverInfo,
      sessionId: currentSessionId,
      capabilities: { tools: { listChanged: true } },
      resources: {},
      prompts: {},
    };
  });

  // Set up tool list handler with full tool definitions including descriptions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolsPerfLogger = createPerformanceLogger(mcpStdioLogger, 'list-tools');

    try {
      const tools = MEMORY_BANK_MCP_TOOLS.map((toolDef) => ({
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.parameters,
      }));

      toolsPerfLogger.complete({ toolCount: tools.length });

      return { tools };
    } catch (error) {
      toolsPerfLogger.fail(error as Error);
      throw error;
    }
  });

  // Set up tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolPerfLogger = createPerformanceLogger(mcpStdioLogger, `tool-${toolName}`);

    const toolLogger = mcpStdioLogger.child({
      tool: toolName,
      requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId: currentSessionId,
    });

    const toolDef = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
    const actualToolHandler = toolHandlers[toolName];

    if (!toolDef || !actualToolHandler) {
      const error = new Error(`Tool not found: ${toolName}`);
      toolPerfLogger.fail(error);
      throw error;
    }

    toolLogger.debug({ params: request.params.arguments }, 'Tool handler invoked');

    try {
      const validatedParams = request.params.arguments;
      const sessionId = currentSessionId; // Use the session ID from the initialize request

      let currentSessionData = sessionStore.get(sessionId);
      if (!currentSessionData) {
        toolLogger.warn({ sessionId }, 'No session data found, initializing new session data');
        currentSessionData = {
          clientProjectRoot: undefined,
          repository: undefined,
          branch: undefined,
        };
      }

      if (
        toolName === 'memory-bank' &&
        validatedParams &&
        typeof validatedParams === 'object' &&
        validatedParams.operation === 'init'
      ) {
        const params = validatedParams as z.infer<typeof toolSchemas.MemoryBankInputSchema>;
        if (!currentSessionData) {
          currentSessionData = {
            clientProjectRoot: undefined,
            repository: undefined,
            branch: undefined,
          };
        }
        if (params.clientProjectRoot) {
          currentSessionData.clientProjectRoot = params.clientProjectRoot;
        }
        if (params.repository) {
          currentSessionData.repository = params.repository;
        }
        if (params.branch) {
          currentSessionData.branch = params.branch;
        }
        toolLogger.info(
          {
            sessionId,
            clientProjectRoot: params.clientProjectRoot,
            repository: params.repository,
            branch: params.branch,
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
        logger: toolLogger, // Use structured logger instead of console
        sendProgress: async (progressData: McpProgressNotification) => {
          // Stdio server does not support progress notifications, this is a no-op
          toolLogger.info({ progressData }, 'Progress notification received (no-op)');
        },
      };

      // Create a new MemoryService instance on-demand for each tool call
      let memoryServiceInstance: MemoryService;
      try {
        toolLogger.debug('Creating MemoryService instance');
        memoryServiceInstance = await MemoryService.getInstance(enrichedContext);
        toolLogger.debug('Successfully created MemoryService instance');
      } catch (error) {
        logError(toolLogger, error as Error, { operation: 'create-memory-service' });
        throw new Error(
          `Failed to initialize memory service: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const result = await actualToolHandler(
        validatedParams,
        enrichedContext,
        memoryServiceInstance,
      );

      toolPerfLogger.complete({ resultSize: JSON.stringify(result).length });

      // Return result in the expected format
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        toolLogger.error({ zodIssues: error.issues }, 'Zod validation error');
        toolPerfLogger.fail(error);
        throw error;
      }
      logError(toolLogger, error as Error, { operation: 'tool-execution' });
      toolPerfLogger.fail(error as Error);
      throw error;
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  mcpStdioLogger.info('MCP Server (stdio) initialized and listening');

  // EXPLICIT test detection message - required for E2E tests to detect server readiness
  // In test mode, we still need to output to stderr for test detection
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
