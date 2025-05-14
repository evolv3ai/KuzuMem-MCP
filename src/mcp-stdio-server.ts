import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { MEMORY_BANK_MCP_TOOLS } from './mcp';
import { MemoryService } from './services/memory.service';
import { toolHandlers } from './mcp/tool-handlers';
import { createProgressHandler } from './mcp/streaming/progress-handler';
import { StdioProgressTransport } from './mcp/streaming/stdio-transport';
import { ToolExecutionService } from './mcp/services/tool-execution.service';

// Determine Client Project Root at startup (for context only, not for DB initialization)
const serverCwd = process.cwd();
console.error(
  `MCP stdio server CWD (Current Working Directory): ${serverCwd}. Note: Actual memory bank paths are determined by 'init-memory-bank' calls per repository/branch.`,
);

// Map to store clientProjectRoot for each repository and branch
// Key: "repositoryName:branchName", Value: "clientProjectRootPath"
const repositoryRootMap = new Map<string, string>();

// IMPORTANT: We do NOT initialize directories or memory service at startup!
// Database initialization should only happen through the init-memory-bank tool
// or when explicitly requested by a tool call

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let initialized = false;

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
  error?: { code: number; message: string; data?: any };
}

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

const progressTransport = new StdioProgressTransport(debugLog);

function sendResponse(response: McpResponse): void {
  debugLog(1, `Sending response for id: ${response.id}`);
  debugLog(2, 'Response details:', response);
  process.stdout.write(JSON.stringify(response) + '\n');
}

rl.on('line', async (line) => {
  let request: McpRequest;
  try {
    request = JSON.parse(line);
    debugLog(1, `Received request: ${request.method}`);
    debugLog(2, 'Request details:', request);

    if (!request.jsonrpc || !request.method) {
      sendResponse({
        jsonrpc: '2.0',
        id: request.id || null,
        error: { code: -32600, message: 'Invalid Request: missing required fields' },
      });
      return;
    }

    switch (request.method) {
      case 'initialize':
        const protocolVersion = request.params?.protocolVersion || '0.1';
        initialized = true;
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion,
            capabilities: { memory: { list: true }, tools: { list: true, call: true } },
            serverInfo: { name: 'memory-bank-mcp', version: '1.0.0' },
          },
        });
        break;
      case 'initialized':
        initialized = true;
        break;
      case 'notifications/initialized':
        debugLog(1, 'Handling notifications/initialized');
        sendResponse({ jsonrpc: '2.0', id: request.id, result: {} });
        break;
      case 'resources/list':
      case 'resources/templates/list':
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: { resources: [], templates: [], cursor: null },
        });
        break;
      case 'tools/list':
        debugLog(1, `Returning tools/list with ${MEMORY_BANK_MCP_TOOLS.length} tools`);
        const convertedTools = MEMORY_BANK_MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters || { type: 'object', properties: {}, required: [] },
          outputSchema: tool.returns || { type: 'object', properties: {} },
          annotations: tool.annotations || {
            title: tool.name,
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        }));
        sendResponse({ jsonrpc: '2.0', id: request.id, result: { tools: convertedTools } });
        break;
      case 'tools/call':
        const toolName = request.params?.name;
        const toolArgs = request.params?.arguments || {};
        debugLog(1, `Handling tools/call for tool: ${toolName}`);

        const toolDefinition = MEMORY_BANK_MCP_TOOLS.find((t) => t.name === toolName);
        if (!toolDefinition) {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: `Tool '${toolName}' not found.` }],
              isError: true,
            },
          });
          break;
        }

        let effectiveClientProjectRoot: string | undefined;

        if (toolName === 'init-memory-bank') {
          effectiveClientProjectRoot = toolArgs.clientProjectRoot;
          if (effectiveClientProjectRoot && toolArgs.repository && toolArgs.branch) {
            const repoBranchKey = `${toolArgs.repository}:${toolArgs.branch}`;
            repositoryRootMap.set(repoBranchKey, effectiveClientProjectRoot);
            debugLog(
              2,
              `Stored clientProjectRoot for ${repoBranchKey}: ${effectiveClientProjectRoot}`,
            );
          } else {
            debugLog(
              0,
              `Error: init-memory-bank called without required arguments for storing clientProjectRoot (repository, branch, clientProjectRoot).`,
            );
            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `Tool '${toolName}' called without repository, branch, or clientProjectRoot for mapping.`,
                  },
                ],
                isError: true,
              },
            });
            break;
          }
        } else {
          // For other tools, retrieve clientProjectRoot from the map
          if (toolArgs.repository && toolArgs.branch) {
            const repoBranchKey = `${toolArgs.repository}:${toolArgs.branch}`;
            effectiveClientProjectRoot = repositoryRootMap.get(repoBranchKey);
            if (!effectiveClientProjectRoot) {
              debugLog(
                0,
                `Error: clientProjectRoot not found in map for ${repoBranchKey}. Was init-memory-bank called for this repo/branch?`,
              );
              // Fallback to detectedClientProjectRoot (server CWD) if not found, though this is the problematic behavior we want to avoid.
              // Ideally, this should be an error if strict mapping is required.
              // For now, to maintain some prior behavior if uninitialized, let's log an error and consider it a failure.
              sendResponse({
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `Memory for repository '${toolArgs.repository}' on branch '${toolArgs.branch}' not initialized. Please call 'init-memory-bank' first.`,
                    },
                  ],
                  isError: true,
                },
              });
              break;
            }
            debugLog(
              2,
              `Retrieved clientProjectRoot for ${repoBranchKey}: ${effectiveClientProjectRoot}`,
            );
          } else {
            // If repository or branch are not in toolArgs, this is a problem for most tools.
            debugLog(
              0,
              `Error: Tool '${toolName}' called without repository or branch arguments needed to find clientProjectRoot.`,
            );
            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `Tool '${toolName}' requires repository and branch arguments.`,
                  },
                ],
                isError: true,
              },
            });
            break;
          }
        }

        if (!effectiveClientProjectRoot && toolName === 'init-memory-bank') {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                { type: 'text', text: `Tool '${toolName}' requires clientProjectRoot argument.` },
              ],
              isError: true,
            },
          });
          break;
        }
        if (!effectiveClientProjectRoot) {
          // Should not happen if init-memory-bank was called correctly first for other tools
          // And if the logic above correctly assigns effectiveClientProjectRoot from the map
          console.error(
            `CRITICAL: effectiveClientProjectRoot is not defined for tool ${toolName}. This indicates a problem with server launch context, tool argument passing, or the repositoryRootMap logic.`,
          );
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Server error: clientProjectRoot context not established for tool '${toolName}'.`,
                },
              ],
              isError: true,
            },
          });
          break;
        }

        try {
          const progressHandler = createProgressHandler(
            String(request.id),
            progressTransport,
            debugLog,
          );
          const toolExecutionService = await ToolExecutionService.getInstance();

          const toolResult = await toolExecutionService.executeTool(
            toolName,
            toolArgs,
            toolHandlers,
            effectiveClientProjectRoot, // Pass the determined clientProjectRoot
            progressHandler,
            debugLog,
          );

          if (toolResult !== null) {
            // Successful tool execution (or tool returning its own error structure within the result)
            sendResponse({
              jsonrpc: '2.0',
              id: String(request.id),
              result: {
                content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
                isError: !!toolResult?.error, // This custom flag is part of the expected content structure
              },
            });
          }
          // If toolResult is null, it implies progressHandler handled the final response, or it was a notification-style call
        } catch (err: any) {
          debugLog(
            0,
            `FATAL ERROR (tools/call in stdio-server catch block): ${err.message || String(err)}`,
            err.stack,
          );
          // Send a standard JSON-RPC error response
          sendResponse({
            jsonrpc: '2.0',
            id: request.id, // Use original request.id
            error: {
              code: -32000, // Generic server error
              message: `Server error executing tool '${toolName}': ${err.message || String(err)}`,
              data: err.stack, // Optional: include stack trace or other data
            },
          });
        }
        break;
      default:
        if (!initialized) {
          sendResponse({
            jsonrpc: '2.0',
            id: String(request.id),
            error: { code: -32002, message: 'Server not initialized' },
          });
          return;
        }
        // Fallback for other methods - this section is largely legacy and might be removed
        // as all actions should ideally go through tools/call with the new refactor.
        console.error(
          `Warning: Received direct method call '${request.method}' which is deprecated. Use 'tools/call'.`,
        );
        sendResponse({
          jsonrpc: '2.0',
          id: String(request.id),
          error: {
            code: -32601,
            message: `Method not implemented: ${request.method}. Use tools/call.`,
          },
        });
    }
  } catch (err: any) {
    debugLog(0, `Parse error or other top-level error: ${err.message || String(err)}`, err);
    sendResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

console.log('MCP_STDIO_SERVER_READY_FOR_TESTING');
