import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MEMORY_BANK_MCP_TOOLS } from './mcp';
import { toolHandlers } from './mcp/tool-handlers';
import { createProgressHandler } from './mcp/streaming/progress-handler';
import { StdioProgressTransport } from './mcp/streaming/stdio-transport';
import { ToolExecutionService } from './mcp/services/tool-execution.service';

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
  // For others, we use detectedClientProjectRoot from server's context.
  const effectiveClientProjectRoot =
    toolName === 'init-memory-bank' ? toolArgs.clientProjectRoot : detectedClientProjectRoot;

  if (!effectiveClientProjectRoot && toolName === 'init-memory-bank') {
    throw new Error(`Tool '${toolName}' requires clientProjectRoot argument.`);
  }

  if (!effectiveClientProjectRoot) {
    console.error(
      `CRITICAL: effectiveClientProjectRoot is not defined for tool ${toolName}. This indicates a problem with server launch context or tool argument passing.`,
    );
    throw new Error(
      `Server error: clientProjectRoot context not established for tool '${toolName}'.`,
    );
  }

  try {
    const progressHandler = createProgressHandler(requestId, progressTransport, debugLog);
    const toolExecutionService = await ToolExecutionService.getInstance();

    const toolResult = await toolExecutionService.executeTool(
      toolName,
      toolArgs,
      toolHandlers,
      effectiveClientProjectRoot,
      progressHandler,
      debugLog,
    );

    if (toolResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
        isError: !!toolResult?.error,
      };
    } else {
      return {
        content: [{ type: 'text', text: 'Tool executed successfully' }],
      };
    }
  } catch (err: any) {
    debugLog(
      0,
      `FATAL ERROR (tools/call in stdio-server): ${err.message || String(err)}`,
      err.stack,
    );
    throw new Error(`Server error: ${err.message || String(err)}`);
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

// Start the server
startServer().catch((error) => {
  console.error('Failed to start MCP stdio server:', error);
  process.exit(1);
});
