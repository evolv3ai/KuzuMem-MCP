#!/usr/bin/env node

// Redirect console.log to stderr IMMEDIATELY to prevent protocol interference
/* eslint-disable no-console */
const originalConsoleLog = console.log;
console.log = (...args: any[]): void => {
  // Avoid breaking tests that rely on return value of console.log
  console.error('[STDERR-LOG]', ...args);
};
/* eslint-enable no-console */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MEMORY_BANK_MCP_TOOLS } from './mcp';
import { ToolExecutionService } from './mcp/services/tool-execution.service';
import { createProgressHandler } from './mcp/streaming/progress-handler';
import { StdioProgressTransport } from './mcp/streaming/stdio-transport';
import { toolHandlers } from './mcp/tool-handlers';
import { MemoryService } from './services/memory.service';

console.error('[MCP-DEBUG] Starting KuzuMem-MCP-Stdio server');
console.error('[MCP-DEBUG] Node version:', process.version);
console.error('[MCP-DEBUG] MCP SDK loaded');

// Debug configuration
const DEBUG_LEVEL = parseInt(process.env.DEBUG_LEVEL || '1', 10);

function debugLog(level: number, message: string, data?: any): void {
  if (level <= DEBUG_LEVEL) {
    const timestamp = new Date().toISOString();
    const prefix = `[MCP-STDIO-DEBUG${level}]`;
    if (data !== undefined) {
      console.error(`${timestamp} ${prefix} ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.error(`${timestamp} ${prefix} ${message}`);
    }
  }
}

debugLog(1, 'MCP stdio server initializing');

// Determine Client Project Root at startup (for context only, not for DB initialization)
const detectedClientProjectRoot = process.cwd();
console.error(`MCP stdio server detected client project root: ${detectedClientProjectRoot}`);

// Adapter to convert SdkToolHandler to ToolHandler format
function adaptSdkToolHandler(
  sdkHandler: (params: any, context: any, memoryService: any) => Promise<any>,
): (
  toolArgs: any,
  memoryService: any,
  progressHandler?: any,
  clientProjectRoot?: string,
) => Promise<any> {
  return async (toolArgs, memoryService, progressHandler, clientProjectRoot) => {
    // Create a mock context that matches EnrichedRequestHandlerExtra
    const context = {
      logger: {
        debug: (msg: string, ...args: any[]) =>
          debugLog(3, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
        info: (msg: string, ...args: any[]) =>
          debugLog(2, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
        warn: (msg: string, ...args: any[]) =>
          debugLog(1, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
        error: (msg: string, ...args: any[]) =>
          debugLog(0, args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg),
      },
      session: {
        clientProjectRoot,
        repository: toolArgs.repository,
        branch: toolArgs.branch,
      },
      sendProgress: async (progress: any) => {
        if (progressHandler) {
          progressHandler.progress(progress);
        }
      },
      memoryService,
    };

    // Call the SDK handler with adapted parameters
    return sdkHandler(toolArgs, context, memoryService);
  };
}

// Adapt all tool handlers
const adaptedToolHandlers: Record<string, any> = {};
for (const [toolName, handler] of Object.entries(toolHandlers)) {
  adaptedToolHandlers[toolName] = adaptSdkToolHandler(handler);
}

// Create the server instance
const server = new Server(
  {
    name: 'KuzuMem-MCP-Stdio',
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

console.error('[MCP-DEBUG] Server instance created successfully');

const progressTransport = new StdioProgressTransport(debugLog);

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
  const effectiveClientProjectRoot = toolArgs.clientProjectRoot as string;

  if (!effectiveClientProjectRoot) {
    throw new Error(
      toolName === 'init-memory-bank'
        ? `Tool '${toolName}' requires clientProjectRoot argument.`
        : `Server error: clientProjectRoot context not established for tool '${toolName}'. Provide clientProjectRoot in tool arguments.`,
    );
  }

  try {
    let capturedFinalResult: any = null;
    let capturedIsError: boolean = false;

    const progressHandler = createProgressHandler(
      requestId,
      {
        sendNotification: (payload: object, eventName?: string) => {
          // If this is the final response, capture it
          if (eventName === 'mcpResponse') {
            const responsePayload = payload as any;
            if (responsePayload.result) {
              capturedFinalResult = responsePayload.result;
              capturedIsError = false;
            } else if (responsePayload.error) {
              capturedFinalResult = responsePayload.error;
              capturedIsError = true;
            }
          }
          // Send progress notifications through the stdio transport
          progressTransport.sendNotification(payload, eventName);
        },
      },
      debugLog,
    );

    const toolExecutionService = await ToolExecutionService.getInstance();

    const toolResult = await toolExecutionService.executeTool(
      toolName,
      toolArgs,
      adaptedToolHandlers,
      effectiveClientProjectRoot,
      progressHandler,
      debugLog,
    );

    // If we captured a final result from the progress handler, use that
    if (capturedFinalResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(capturedFinalResult, null, 2) }],
        isError: capturedIsError,
      };
    }

    // For tools that use progress handlers but don't send final response,
    // or tools that return results directly
    if (toolResult === null) {
      return {
        content: [{ type: 'text', text: 'Tool executed successfully' }],
      };
    }

    // For tools that don't use progress or return results directly
    return {
      content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
      isError: !!toolResult?.error,
    };
  } catch (error: any) {
    debugLog(0, `Error in CallToolRequest handler: ${error.message}`, error.stack);
    return {
      content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
      isError: true,
    };
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

// Start the server
async function startServer() {
  try {
    debugLog(1, 'Creating StdioServerTransport');
    const transport = new StdioServerTransport();

    debugLog(1, 'Attempting to connect server to transport');
    await server.connect(transport);

    debugLog(1, 'Server connected successfully');
    console.error('[MCP-SUCCESS] KuzuMem-MCP-Stdio server running on stdio');
    console.error('[MCP-SUCCESS] Server ready to receive requests');

    // Keep the process alive and handle errors
    process.on('uncaughtException', (error) => {
      console.error('[MCP-ERROR] Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[MCP-ERROR] Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (error) {
    console.error('[MCP-ERROR] Failed to start MCP stdio server:', error);
    console.error(
      '[MCP-ERROR] Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  debugLog(1, 'SIGINT received, shutting down gracefully');
  try {
    // Get MemoryService instance and shut it down
    const memoryService = await MemoryService.getInstance();
    await memoryService.shutdown();
    await server.close();
  } catch (error) {
    console.error('Error during server shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  debugLog(1, 'SIGTERM received, shutting down gracefully');
  try {
    // Get MemoryService instance and shut it down
    const memoryService = await MemoryService.getInstance();
    await memoryService.shutdown();
    await server.close();
  } catch (error) {
    console.error('Error during server shutdown:', error);
  }
  process.exit(0);
});

// console.log already redirected at top of file to prevent import-time interference

// Start the server
startServer();
