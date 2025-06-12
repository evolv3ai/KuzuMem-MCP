import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as toolSchemas from './mcp/schemas/unified-tool-schemas';
import { toolHandlers } from './mcp/tool-handlers';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools/index';
import { McpProgressNotification } from './mcp/types/sdk-custom';
import { MemoryService } from './services/memory.service';

// Determine Client Project Root at startup (for context only, not for DB initialization)
const serverCwd = process.cwd();
// console.error(
//   `MCP stdio server CWD (Current Working Directory): ${serverCwd}. Note: Actual memory bank paths are determined by 'memory-bank' tool calls per repository/branch.`,
// );

if (process.env.DB_PATH_OVERRIDE) {
  console.warn(
    '[MCP Stdio SDK Server] WARNING: DB_PATH_OVERRIDE environment variable is set.' +
      " This will force all KuzuDBClient instances to use this single, globally overridden path ('${process.env.DB_PATH_OVERRIDE}')." +
      ' This is intended for specific testing scenarios and will break multi-project isolation in a typical IDE setup.' +
      ' Unset this variable for normal operation in IDE environments.',
  );
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// console.log('MCP_STDIO_SERVER_READY_FOR_TESTING'); // Removed to avoid non-JSON output on stdout

import packageJson from '../package.json';

// Simple session store (example - replace with a more robust solution if needed)
const sessionStore = new Map<
  string,
  { clientProjectRoot?: string; repository?: string; branch?: string }
>();

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
  console.error('[MCP Stdio SDK Server] Initializing...');
  // Set up server-wide logger
  const serverLogger = console; // Simple console logger for now

  // We no longer initialize a global MemoryService during startup
  // Each MCP tool handler will create or retrieve a MemoryService instance on-demand and specific to each clientProjectRoot
  serverLogger.info(
    '[MCP Stdio SDK Server] MemoryService initialization deferred until needed by tool handlers',
  );

  const serverInfo = {
    name: packageJson.name,
    version: packageJson.version,
  };

  // Use low-level Server for full control
  const server = new Server(serverInfo, {
    capabilities: {
      tools: {},
    },
  });

  // Set up tool list handler with full tool definitions including descriptions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: MEMORY_BANK_MCP_TOOLS.map((toolDef) => ({
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.parameters,
      })),
    };
  });

  // Set up tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolDef = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
    const actualToolHandler = toolHandlers[toolName];

    if (!toolDef || !actualToolHandler) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // console.error(`[DEBUG] MCP Stdio Server tool handler for ${toolName} ENTERED`);
    // console.error(
    //   `[Tool: ${toolName}] Received params:`,
    //   JSON.stringify(request.params.arguments, null, 2),
    // );

    try {
      const validatedParams = request.params.arguments;
      const sessionId = 'default-e2e-session-fallback'; // We'll need to get this from somewhere

      let currentSessionData = sessionStore.get(sessionId);
      if (!currentSessionData) {
        serverLogger.warn(
          `[Tool: ${toolName}] No session data found for sessionId: ${sessionId}. Initializing new session data.`,
        );
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
        serverLogger.info(
          `[Tool: memory-bank] Attempting to set session data for ${sessionId}: CPR=${params.clientProjectRoot}, Repo=${params.repository}, Branch=${params.branch}`,
        );
      }
      if (currentSessionData) {
        sessionStore.set(sessionId, currentSessionData);
      }

      const enrichedContext: any = {
        sessionId: sessionId,
        session: currentSessionData || {},
        logger: serverLogger,
        sendProgress: async (progressData: McpProgressNotification) => {
          serverLogger.info(`[Tool: ${toolName}] Sending Progress:`, progressData);
          // Progress notifications would need to be handled differently in this approach
        },
      };

      // Create a new MemoryService instance on-demand for each tool call
      let memoryServiceInstance: MemoryService;
      try {
        serverLogger.info(`[MCP Tool ${toolName}] Creating MemoryService instance`);
        memoryServiceInstance = await MemoryService.getInstance(enrichedContext);
        serverLogger.info(`[MCP Tool ${toolName}] Successfully created MemoryService instance`);
      } catch (error) {
        serverLogger.error(`[MCP Tool ${toolName}] Error creating MemoryService:`, error);
        throw new Error(
          `Failed to initialize memory service: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const result = await actualToolHandler(
        validatedParams,
        enrichedContext,
        memoryServiceInstance,
      );

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
        serverLogger.error(
          `[Tool: ${toolName}] Zod validation error: ${JSON.stringify(error.issues)}`,
        );
        throw error;
      }
      serverLogger.error(`[Tool: ${toolName}] Error during execution:`, error);
      throw error;
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('MCP Server (stdio) initialized and listening...'); // Use console.error so tests can detect on stderr
}

main().catch((e) => {
  const logger = console;
  logger.error('Failed to start MCP server:', e);
  process.exit(1);
});
