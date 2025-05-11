import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { MEMORY_BANK_MCP_TOOLS } from './mcp';
import { MemoryService } from './services/memory.service';
import { toolHandlers } from './mcp/tool-handlers';
import { createProgressHandler } from './mcp/streaming/progress-handler';
import { StdioProgressTransport } from './mcp/streaming/stdio-transport';
import { ToolExecutionService } from './mcp/services/tool-execution.service';

// Ensure database directory and file exists
// Always use the project root for consistency
const projectRoot = path.resolve(__dirname, '..');
// DB_FILENAME is now set by test-db-setup.ts or .env for other runs
let dbPath = process.env.DB_FILENAME || path.join(projectRoot, 'memory-bank.kuzu'); // Fallback if not set
const dbDir = path.dirname(dbPath);

if (!path.isAbsolute(dbPath)) {
  dbPath = path.resolve(projectRoot, dbPath);
}
process.env.DB_FILENAME = dbPath; // Ensure it's absolute for KuzuDBClient if it re-reads

console.error(`MCP server using database path: ${dbPath}`);

// Ensure PARENT directory exists (KuzuDB will create the actual DB directory/file itself)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.error(`Created parent directory for KuzuDB: ${dbDir}`);
}

// Initialize memory service early
let memoryServiceInstance: MemoryService | null = null;
MemoryService.getInstance()
  .then((instance) => {
    memoryServiceInstance = instance;
    console.error('Memory service initialized');
  })
  .catch((err) => {
    console.error('Failed to initialize memory service:', err);
  });

// Create the readline interface for stdio
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// Track the initialized state
let initialized = false;

// Define MCP message types following the exact spec
interface McpRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}

interface McpResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface McpError {
  code: number;
  message: string;
  data?: any;
}

// Debug levels
const DEBUG_LEVEL = process.env.DEBUG ? parseInt(process.env.DEBUG, 10) || 1 : 0;

// Debug logging helper
function debugLog(level: number, message: string, data?: any): void {
  if (DEBUG_LEVEL >= level) {
    if (data) {
      console.error(
        `[DEBUG${level}] ${message}`,
        typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      );
    } else {
      console.error(`[DEBUG${level}] ${message}`);
    }
  }
}

// Create transport once
const progressTransport = new StdioProgressTransport(debugLog);

// Helper for sending responses
function sendResponse(response: McpResponse): void {
  // Only log the full response for debug level 2+
  debugLog(1, `Sending response for id: ${response.id}`);
  debugLog(2, 'Response details:', response);
  process.stdout.write(JSON.stringify(response) + '\n');
}

// Helper for tool errors
function createToolError(message: string): any {
  return {
    error: message,
  };
}

// Process incoming messages
rl.on('line', async (line) => {
  let request: McpRequest;

  try {
    request = JSON.parse(line);
    debugLog(1, `Received request: ${request.method}`);
    debugLog(2, 'Request details:', request);

    // Validate the request has required fields
    if (!request.jsonrpc || !request.method) {
      sendResponse({
        jsonrpc: '2.0',
        id: request.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request: missing required fields',
        },
      });
      return;
    }

    // Process the request based on method
    switch (request.method) {
      case 'initialize': {
        // MCP initialization
        const protocolVersion = request.params?.protocolVersion || '0.1';
        initialized = true;

        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion,
            capabilities: {
              memory: { list: true },
              tools: { list: true, call: true },
            },
            serverInfo: {
              name: 'memory-bank-mcp',
              version: '1.0.0',
            },
          },
        });
        break;
      }

      case 'initialized': {
        // Just acknowledge, no response needed
        initialized = true;
        break;
      }

      case 'notifications/initialized': {
        // This is used by the client to signal initialization of notifications
        // In our implementation, we don't need to respond specifically
        debugLog(1, 'Handling notifications/initialized');
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {},
        });
        break;
      }

      case 'resources/list': {
        // Return an empty resources list as we don't have any resources
        debugLog(1, 'Handling resources/list request');
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resources: [],
            cursor: null,
          },
        });
        break;
      }

      case 'resources/templates/list': {
        // Return an empty templates list as we don't have any resource templates
        debugLog(1, 'Handling resources/templates/list request');
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            templates: [],
            cursor: null,
          },
        });
        break;
      }

      case 'tools/list': {
        // Ensure tools is an array and follows MCP spec exactly
        debugLog(1, `Returning tools/list with ${MEMORY_BANK_MCP_TOOLS.length} tools`);

        // Debug log all tools before conversion
        debugLog(2, 'Tools before conversion:');
        MEMORY_BANK_MCP_TOOLS.forEach((tool, i) => {
          debugLog(2, `Tool #${i}: ${tool.name}`);
          debugLog(3, `Tool #${i} details:`, {
            name: tool.name,
            parametersPresent: !!tool.parameters,
            returnsPresent: !!tool.returns,
            annotationsPresent: !!tool.annotations,
          });
        });

        // Convert our tool format to what MCP clients expect with defaults
        const convertedTools = MEMORY_BANK_MCP_TOOLS.map((tool) => {
          // Create a safe version of the tool with default values for missing properties
          const defaultParameters = {
            type: 'object',
            properties: {},
            required: [],
          };

          const defaultReturns = {
            type: 'object',
            properties: {},
          };

          const defaultAnnotations = {
            title: tool.name,
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          };

          return {
            name: tool.name,
            description: tool.description,
            // Map parameters to inputSchema with defaults
            inputSchema: tool.parameters || defaultParameters,
            // Map returns to outputSchema with defaults
            outputSchema: tool.returns || defaultReturns,
            // Keep annotations with defaults
            annotations: tool.annotations || defaultAnnotations,
          };
        });

        if (convertedTools.length > 0) {
          debugLog(2, 'First converted tool:', convertedTools[0]);
        }

        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: convertedTools,
          },
        });
        break;
      }

      case 'tools/call': {
        const toolName = request.params?.name;
        const toolArgs = request.params?.arguments || {};
        debugLog(1, `Handling tools/call for tool: ${toolName}`);

        const toolDefinition = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
        if (!toolDefinition) {
          // For a tool not found, send a direct standard error response.
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Tool '${toolName}' not found in definitions.`,
                },
              ],
              isError: true,
            },
          });
          break;
        }

        try {
          const progressHandler = createProgressHandler(request.id, progressTransport);
          const toolExecutionService = await ToolExecutionService.getInstance();

          const toolResult = await toolExecutionService.executeTool(
            toolName,
            toolArgs,
            toolHandlers,
            progressHandler, // Always pass it, service/handler will decide to use it
            debugLog,
          );

          // If toolResult is not null, it means the tool handler did not use
          // progressHandler.complete() itself (e.g., it's a batch tool, or an error
          // was returned by ToolExecutionService in a batch format).
          // In this case, send a standard single JSON-RPC response.
          if (toolResult !== null) {
            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
                isError: !!toolResult?.error,
              },
            });
          }
          // If toolResult IS null, it means progressHandler.complete() was called by
          // the tool handler (via OperationClass) or by ToolExecutionService for an error
          // in a streaming context. The response (final progress + standard response) is already handled.
        } catch (err: any) {
          // This top-level catch handles unexpected errors in the stdio server itself,
          // outside of ToolExecutionService or if ToolExecutionService.getInstance() fails.
          debugLog(
            0,
            `FATAL ERROR (tools/call in stdio-server): ${err.message || String(err)}`,
            err.stack,
          );
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: `Server error: ${err.message || String(err)}` }],
              isError: true,
            },
          });
        }
        break;
      }

      default: {
        if (!initialized) {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32002,
              message: 'Server not initialized',
            },
          });
          return;
        }

        // Handle tool calls
        try {
          const memoryService = await MemoryService.getInstance();

          switch (request.method) {
            case 'init-memory-bank': {
              const { repository, branch = 'main' } = request.params || {};
              if (!repository) {
                sendResponse({
                  jsonrpc: '2.0',
                  id: request.id,
                  result: createToolError(`Missing repository parameter for branch ${branch}`),
                });
                return;
              }
              await memoryService.initMemoryBank(repository, branch);
              sendResponse({
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  success: true,
                  message: `Memory bank initialized for ${repository} (branch: ${branch})`,
                },
              });
              break;
            }
            case 'get-metadata': {
              const { repository, branch = 'main' } = request.params || {};
              if (!repository) {
                sendResponse({
                  jsonrpc: '2.0',
                  id: request.id,
                  result: createToolError(`Missing repository parameter for branch ${branch}`),
                });
                return;
              }
              const metadata = await memoryService.getMetadata(repository, branch);
              if (!metadata) {
                sendResponse({
                  jsonrpc: '2.0',
                  id: request.id,
                  result: createToolError(
                    `Metadata not found for ${repository} (branch: ${branch})`,
                  ),
                });
                return;
              }

              sendResponse({
                jsonrpc: '2.0',
                id: request.id,
                result: { metadata },
              });
              break;
            }

            // Add other tool implementations similarly

            default:
              sendResponse({
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32601,
                  message: `Method not implemented: ${request.method}`,
                },
              });
          }
        } catch (err: any) {
          debugLog(0, `ERROR: ${err.message || String(err)}`, err);
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: createToolError(`Internal error: ${err.message || String(err)}`),
          });
        }
      }
    }
  } catch (err: any) {
    debugLog(0, `Parse error: ${err.message || String(err)}`, err);
    sendResponse({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    });
  }
});

// Handle process events
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Use console.log for the final ready message to ensure it goes to STDOUT
console.log('MCP_STDIO_SERVER_READY_FOR_TESTING');
