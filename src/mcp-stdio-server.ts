import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AnyZodObject, z, ZodObject } from 'zod';
import * as toolSchemas from './mcp/schemas/unified-tool-schemas';
import { toolHandlers } from './mcp/tool-handlers';
import { McpProgressNotification } from './mcp/types/sdk-custom';
import { MemoryService } from './services/memory.service';

// Determine Client Project Root at startup (for context only, not for DB initialization)
const serverCwd = process.cwd();
// console.error(
//   `MCP stdio server CWD (Current Working Directory): ${serverCwd}. Note: Actual memory bank paths are determined by \'init-memory-bank\' calls per repository/branch.`,
// );

if (process.env.DB_PATH_OVERRIDE) {
  console.warn(
    '[MCP Stdio SDK Server] WARNING: DB_PATH_OVERRIDE environment variable is set.' +
      ' This will force all KuzuDBClient instances to use this single, globally overridden path (\'${process.env.DB_PATH_OVERRIDE}\').' +
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
    'semantic-search': 'SemanticSearchInputSchema',
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
  serverLogger.info('[MCP Stdio SDK Server] MemoryService initialization deferred until needed by tool handlers');

  const serverInfo = {
    name: packageJson.name,
    version: packageJson.version,
    // Add other server info if needed
  };

  const mcpServer = new McpServer(serverInfo, {
    capabilities: {
      tools: {}, // SDK should handle tools/list if this is true or an object
    },
  });

  // Register each tool with the server
  for (const [toolName, actualToolHandler] of Object.entries(toolHandlers)) {
    const schemaKey = getSchemaKeyForTool(toolName);
    const defaultSchema = z.object({});
    const currentInputSchema =
      schemaKey && toolSchemas[schemaKey] ? toolSchemas[schemaKey] : defaultSchema; // Default to empty schema if not found

    let schemaForSdk: z.ZodRawShape | z.ZodTypeAny = {}; // Default to empty shape for no-input tools
    if (currentInputSchema instanceof ZodObject) {
      schemaForSdk = (currentInputSchema as AnyZodObject).shape;
    }

    const isDefaultSchema = !schemaKey || currentInputSchema === defaultSchema;
    if (isDefaultSchema && schemaKey) {
      serverLogger.warn(
        `[Server Setup] No specific input schema found for tool: ${toolName} (key: ${schemaKey}). Using default empty schema.`,
      );
    } else if (!schemaKey && currentInputSchema === z.object({})) {
      serverLogger.info(
        `[Server Setup] Tool ${toolName} uses default empty schema (no specific schema key found).`,
      );
    }

    mcpServer.tool(
      toolName,
      schemaForSdk as any, // Cast to any to avoid deep type recursion
      (async (
        sdkProvidedParams: any, // Parameters parsed by SDK based on currentInputSchema
        sdkContext: any,
      ) => {
        console.log(`[DEBUG] MCP Stdio Server tool handler for ${toolName} ENTERED`);
        console.error(
          `[Tool: ${toolName}] Received sdkProvidedParams (parsed by SDK):`,
          JSON.stringify(sdkProvidedParams, null, 2),
        );
        // console.error(`[Tool: ${toolName}] Received full sdkContext from SDK:`, JSON.stringify(sdkContext, null, 2)); // Too verbose usually

        try {
          // sdkProvidedParams are ALREADY parsed by the SDK according to currentInputSchema.
          // The actualToolHandler might re-parse them if its internal logic uses *.parse(params)
          // This is a temporary redundancy to align with existing toolHandlers structure.
          const validatedParams = sdkProvidedParams;

          const sessionId = sdkContext?.sessionId || 'default-e2e-session-fallback';
          if (!sdkContext?.sessionId) {
            serverLogger.warn(
              `[Tool: ${toolName}] sdkContext.sessionId was undefined. Using fallback: ${sessionId}`,
            );
          }

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
            ...sdkContext,
            sessionId: sessionId,
            session: currentSessionData || {},
            logger: serverLogger,
            sendProgress: async (progressData: McpProgressNotification) => {
              serverLogger.info(`[Tool: ${toolName}] Sending Progress:`, progressData);
              try {
                const token =
                  (validatedParams as any)?._meta?.progressToken || sdkContext.requestId;
                const notificationParams: any = {
                  progressToken: token,
                  progress:
                    progressData.percent !== undefined ? progressData.percent / 100 : undefined,
                  message: progressData.message,
                  data: {
                    status: progressData.status,
                    isFinal: progressData.isFinal,
                    toolName: progressData.toolName || toolName,
                    originalData: progressData.data,
                    error: progressData.error,
                  },
                };
                Object.keys(notificationParams.data).forEach((key) => {
                  if (notificationParams.data[key] === undefined) {
                    delete notificationParams.data[key];
                  }
                });
                if (Object.keys(notificationParams.data).length === 0) {
                  delete notificationParams.data;
                }
                if (notificationParams.progress === undefined) {
                  delete notificationParams.progress;
                }
                if (notificationParams.message === undefined) {
                  delete notificationParams.message;
                }
                await sdkContext.sendNotification({
                  method: 'notifications/progress',
                  params: notificationParams,
                });
                serverLogger.info(`[Tool: ${toolName}] Progress sent successfully.`);
              } catch (e: any) {
                serverLogger.error(
                  `[Tool: ${toolName}] Failed to send progress notification: ${e.message}`,
                  e,
                );
              }
            },
            // We'll create a new memoryService instance on-demand instead of using a global one
          };

          // Call the original tool handler from tool-handlers.ts
          // It expects (params, enrichedContext, memoryService)
          // We pass sdkProvidedParams as 'params' (already parsed by SDK if schema matched)

          // Create a new MemoryService instance on-demand for each tool call
          let memoryServiceInstance: MemoryService;
          try {
            serverLogger.info(`[MCP Tool ${toolName}] Creating MemoryService instance for request ${sdkContext.requestId}`);
            memoryServiceInstance = await MemoryService.getInstance(enrichedContext);
            serverLogger.info(`[MCP Tool ${toolName}] Successfully created MemoryService instance`);
          } catch (error) {
            serverLogger.error(`[MCP Tool ${toolName}] Error creating MemoryService:`, error);
            throw new Error(`Failed to initialize memory service: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          const result = await actualToolHandler(sdkProvidedParams, enrichedContext, memoryServiceInstance);

          // Convert raw result to MCP CallToolResult format
          const mcpResult = {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };

          return mcpResult;
        } catch (error) {
          if (error instanceof z.ZodError) {
            // This error could be from the SDK's parsing (if sdkProvidedParams was a direct forward)
            // or from within actualToolHandler if it re-parses.
            serverLogger.error(
              `[Tool: ${toolName}] Zod validation error (possibly from SDK parsing or internal handler): ${JSON.stringify(error.issues)}`,
            );
            throw error; // Let SDK format it
          }
          serverLogger.error(`[Tool: ${toolName}] Error during execution:`, error);
          throw error; // Let SDK format it
        }
      }) as any,
    );
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error('MCP Server (stdio) initialized and listening...'); // Use console.error so tests can detect on stderr
}

main().catch((e) => {
  const logger = console;
  logger.error('Failed to start MCP server:', e);
  process.exit(1);
});
