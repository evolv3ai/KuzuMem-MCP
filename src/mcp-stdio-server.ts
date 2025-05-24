import { MemoryService } from './services/memory.service';
import { toolHandlers } from './mcp/tool-handlers';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { RequestId } from '@modelcontextprotocol/sdk/types.js';
import { z, ZodObject, AnyZodObject } from 'zod';
import * as toolSchemas from './mcp/schemas/tool-schemas';
import { EnrichedRequestHandlerExtra, McpProgressNotification } from './mcp/types/sdk-custom';

// Determine Client Project Root at startup (for context only, not for DB initialization)
const serverCwd = process.cwd();
// console.error(
//   `MCP stdio server CWD (Current Working Directory): ${serverCwd}. Note: Actual memory bank paths are determined by 'init-memory-bank' calls per repository/branch.`,
// );

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// console.log('MCP_STDIO_SERVER_READY_FOR_TESTING'); // Removed to avoid non-JSON output on stdout

import packageJson from '../package.json';

// Simple session store (example - replace with a more robust solution if needed)
const sessionStore = new Map<
  string,
  { clientProjectRoot?: string; repository?: string; branch?: string }
>();

// Helper function to derive schema name (e.g., init-memory-bank -> InitMemoryBankInputSchema)
function getSchemaKeyForTool(toolName: string): keyof typeof toolSchemas | undefined {
  // Special handling for algorithm tools with compound words
  const specialCases: Record<string, string> = {
    pagerank: 'PageRank',
    'k-core-decomposition': 'KCoreDecomposition',
    'louvain-community-detection': 'LouvainCommunityDetection',
    'strongly-connected-components': 'StronglyConnectedComponents',
    'weakly-connected-components': 'WeaklyConnectedComponents',
    'shortest-path': 'ShortestPath',
  };

  let pascalCaseName: string;
  if (specialCases[toolName]) {
    pascalCaseName = specialCases[toolName];
  } else {
    pascalCaseName = toolName
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  const schemaKey = `${pascalCaseName}InputSchema`;

  if (schemaKey in toolSchemas) {
    return schemaKey as keyof typeof toolSchemas;
  }
  return undefined;
}

async function main() {
  console.error('[MCP Stdio SDK Server] Initializing...');
  // Set up server-wide logger
  const serverLogger = console; // Simple console logger for now

  // Dummy McpContext for global MemoryService initialization
  // This is a workaround for MemoryService.getInstance expecting a full context.
  const dummySendNotification = async (_notification: any) => {
    serverLogger.warn(
      '[DummyContext] sendNotification called. This should not happen during global MemoryService init.',
    );
  };
  const dummySendRequest = async <U extends z.ZodType<object>>(
    _request: any,
    _resultSchema: U,
  ): Promise<z.infer<U>> => {
    serverLogger.warn(
      '[DummyContext] sendRequest called. This should not happen during global MemoryService init.',
    );
    throw new Error('dummySendRequest should not be called');
  };

  const globalMemoryServiceInitContext: any = {
    logger: serverLogger,
    session: {}, // Global services don't belong to a specific session initially
    sendProgress: async (progress: McpProgressNotification) => {
      serverLogger.warn(
        '[MemoryService fallback sendProgress]: This should ideally not be used directly for request-specific progress.',
        progress,
      );
    },
    // Required by RequestHandlerExtra
    signal: new AbortController().signal, // No real cancellation for global init
    requestId: 'global-memory-service-init' as RequestId, // Placeholder RequestId
    sendNotification: dummySendNotification,
    sendRequest: dummySendRequest,
    // This is the tricky part for getInstance. We pass null initially.
    // MemoryService constructor should be robust enough or this needs rethinking.
    memoryService: null as any, // Will be replaced by the actual instance
  };

  let memoryService: MemoryService;
  try {
    serverLogger.info('[MCP Stdio SDK Server] Attempting to get MemoryService instance...');
    memoryService = await MemoryService.getInstance(globalMemoryServiceInitContext);
    serverLogger.info('[MCP Stdio SDK Server] Successfully got MemoryService instance.');
    // Now, if the global context is stored or used by other parts of MemoryService,
    // we could potentially update its memoryService field, though this is awkward.
    (globalMemoryServiceInitContext as any).memoryService = memoryService; // Update the dummy context
    serverLogger.info(
      '[MCP Stdio SDK Server] Patched globalMemoryServiceInitContext with memoryService instance.',
    );
  } catch (error) {
    serverLogger.error(
      '[MCP Stdio SDK Server] CRITICAL ERROR during global MemoryService.getInstance():',
      error,
    );
    process.exit(1); // Exit if global service setup fails
  }

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

    // DEBUG: Special logging for get-context
    if (toolName === 'get-context') {
      serverLogger.info(`[DEBUG get-context] schemaKey: ${schemaKey}`);
      serverLogger.info(`[DEBUG get-context] currentInputSchema: ${currentInputSchema}`);
      serverLogger.info(
        `[DEBUG get-context] schemaForSdk: ${JSON.stringify(schemaForSdk, null, 2)}`,
      );
      serverLogger.info(`[DEBUG get-context] isDefaultSchema: ${isDefaultSchema}`);
      serverLogger.info(
        `[DEBUG get-context] Available schemas: ${Object.keys(toolSchemas).join(', ')}`,
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

        // DEBUG: Special logging for get-context
        if (toolName === 'get-context') {
          console.error(
            `[DEBUG get-context wrapper] About to parse params and build enrichedContext`,
          );
        }

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
            toolName === 'init-memory-bank' &&
            validatedParams &&
            typeof validatedParams === 'object'
          ) {
            const params = validatedParams as z.infer<typeof toolSchemas.InitMemoryBankInputSchema>;
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
              `[Tool: init-memory-bank] Attempting to set session data for ${sessionId}: CPR=${params.clientProjectRoot}, Repo=${params.repository}, Branch=${params.branch}`,
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
            memoryService: memoryService,
          };

          // Call the original tool handler from tool-handlers.ts
          // It expects (params, enrichedContext, memoryService)
          // We pass sdkProvidedParams as 'params' (already parsed by SDK if schema matched)

          // DEBUG: Special logging for get-context
          if (toolName === 'get-context') {
            console.error(`[DEBUG get-context wrapper] About to call actualToolHandler`, {
              hasActualToolHandler: !!actualToolHandler,
              enrichedContextKeys: Object.keys(enrichedContext),
              hasMemoryService: !!memoryService,
            });
          }

          const result = await actualToolHandler(sdkProvidedParams, enrichedContext, memoryService);

          // DEBUG: Special logging for get-context
          if (toolName === 'get-context') {
            console.error(`[DEBUG get-context wrapper] actualToolHandler returned:`, result);
            console.error(`[DEBUG get-context wrapper] Converting to MCP CallToolResult format...`);
          }

          // Convert raw result to MCP CallToolResult format
          const mcpResult = {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };

          // DEBUG: Special logging for get-context
          if (toolName === 'get-context') {
            console.error(`[DEBUG get-context wrapper] Returning MCP-formatted result:`, mcpResult);
          }

          return mcpResult;
        } catch (error) {
          // DEBUG: Special logging for get-context
          if (toolName === 'get-context') {
            console.error(`[DEBUG get-context wrapper] Exception caught:`, error);
          }

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

  console.info('MCP Server (stdio) initialized and listening...'); // Use console for this global message
}

main().catch((e) => {
  const logger = console;
  logger.error('Failed to start MCP server:', e);
  process.exit(1);
});
