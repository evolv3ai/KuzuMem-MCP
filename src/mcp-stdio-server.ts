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

// Determine Client Project Root at startup (for context only, not for DB initialization)
const detectedClientProjectRoot = process.cwd();
console.error(`MCP stdio server detected client project root: ${detectedClientProjectRoot}`);

// Debug configuration
const DEBUG_LEVEL = process.env.DEBUG ? parseInt(process.env.DEBUG, 10) || 1 : 0;

function debugLog(level: number, message: string, data?: any): void {
  if (DEBUG_LEVEL >= level) {
    if (data) {
      console.error(
        `[MCP-STDIO-DEBUG${level}] ${message}`,
        typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      );
    } else {
      console.error(`[MCP-STDIO-DEBUG${level}] ${message}`);
    }
  }
}

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
    name: 'memory-bank-mcp',
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('MCP_STDIO_SERVER_READY_FOR_TESTING');
}

// Handle graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Redirect console.log to stderr so only JSON responses go to stdout
/* eslint-disable no-console */
console.log = (...args: any[]): void => {
  // Avoid breaking tests that rely on return value of console.log
  console.error('[STDERR-LOG]', ...args);
};
/* eslint-enable no-console */

// Start the server
startServer().catch((error) => {
  console.error('Failed to start MCP stdio server:', error);
  process.exit(1);
});
