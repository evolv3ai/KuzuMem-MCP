// Import SDK components with the correct paths
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Import types
import {
  JSONRPCResponse as SDKJSONRPCResponse,
  isJSONRPCError,
  ToolAnnotations,
  ProgressNotification as SDKProgressNotification,
  McpError as SDKMcpError,
} from '@modelcontextprotocol/sdk/types.js';

import path from 'path';

// Explicit type for a JSON-RPC Error Response structure
interface StdioJSONRPCErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null; // id can be null for some errors
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Define a simpler local error type for client-side issues NOT representing JSON-RPC errors
type ClientSideError = {
  clientError: {
    message: string;
    code?: number;
    data?: unknown;
  };
};

// Call tool options
interface CallToolOptions {
  progress?: boolean;
  stream?: boolean;
}

// Ensure paths are relative to project root if this file is moved
const projectRoot = path.resolve(__dirname, '../../../'); // Adjust depth if utils moves

// Define a type for the constructor options to make envVars explicit
interface McpStdioClientOptions {
  envVars?: Record<string, string>;
  serverScriptPath?: string; // Allow overriding for tests if needed
  useTsNode?: boolean; // Flag to use ts-node or direct node execution
  debug?: boolean; // For verbose logging from this client utility
}

export class McpStdioClient {
  private sdkClient: Client;
  private transport: StdioClientTransport;
  private static readonly DEFAULT_SERVER_SCRIPT_PATH = path.join(
    projectRoot,
    'src/mcp-stdio-server.ts',
  );

  // Moved class member declarations to the correct class scope
  private serverReadyPromise: Promise<void>;
  private _isServerReady: boolean = false;
  private _serverProcessExited: boolean = false;
  private _debug: boolean;

  constructor(options: McpStdioClientOptions = {}) {
    const {
      envVars = {},
      serverScriptPath = McpStdioClient.DEFAULT_SERVER_SCRIPT_PATH,
      useTsNode = true, // Default to using ts-node for .ts script
      debug = false,
    } = options;
    this._debug = debug;

    let command: string;
    let args: string[];

    if (useTsNode) {
      command = 'npx';
      args = ['ts-node', '--transpile-only', serverScriptPath];
    } else {
      command = 'node';
      args = [serverScriptPath]; // Assuming serverScriptPath points to a .js file
    }

    if (this._debug) {
      console.log(
        `E2E SDK Client: Initializing StdioClientTransport. Command: ${command}, Args: ${args.join(' ')}, Env: ${JSON.stringify(envVars)}`,
      );
    }

    this.transport = new StdioClientTransport({
      command,
      args,
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...envVars }).filter(([_, v]) => v !== undefined),
      ) as Record<string, string>,
      // Removed onStdErr and onExit as they are not in StdioServerParameters type
      // The SDK transport should handle stderr and process exit internally,
      // or expose them via different means if needed.
    });

    this.sdkClient = new Client({
      transport: this.transport,
      name: 'e2e-mcp-client',
      version: '0.0.1',
    });

    // Attempt to determine server readiness.
    // This is a best guess. The ideal way is if transport exposes a status or connect() promise.
    // For now, we'll assume the first successful interaction means it's ready,
    // or if the transport has an explicit startup mechanism.
    this.serverReadyPromise = this._initializeConnection();
  }

  private logDebug(message: string, ...data: any[]): void {
    if (this._debug) {
      const logData =
        data.length > 0
          ? data.map((d) => (typeof d === 'object' ? JSON.stringify(d, null, 2) : d))
          : [];
      console.log(`[MCP E2E SDK Client DEBUG] ${message}`, ...logData);
    }
  }

  private async _initializeConnection(): Promise<void> {
    try {
      // First, connect the SDK client to the transport.
      // This will internally call transport.start() and perform the MCP initialize handshake.
      this.logDebug('Connecting SDK client to transport...');
      await this.sdkClient.connect(this.transport);
      this.logDebug('SDK client connect() successful. Server should be initialized.');

      // Now, a light operation like listTools can confirm server is responsive post-initialization.
      this.logDebug('Attempting to list tools to confirm server responsiveness post-connect...');
      await this.sdkClient.listTools(); // This call now happens *after* client.connect()
      this._isServerReady = true;
      this.logDebug(
        'Server connection confirmed and responsive (listTools successful post-connect).',
      );

      // Monitor for disconnection if the transport provides such an event
      if (typeof (this.transport as any).on === 'function') {
        (this.transport as any).on('close', () => {
          // Assuming a 'close' or 'exit' event
          this.logDebug('Transport indicated server process exit.');
          this._isServerReady = false;
          this._serverProcessExited = true;
        });
      }
    } catch (error) {
      this._isServerReady = false;
      this._serverProcessExited = true; // Assume exit on initial connection error
      console.error(
        'E2E SDK Client: Failed to initialize connection with server or server is not ready.',
        error,
      );
      throw new Error(
        `Server failed to become ready: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensures the server is ready before proceeding. Throws if not.
   */
  public async ensureServerReady(): Promise<void> {
    if (this._serverProcessExited) {
      throw new Error(
        'E2E SDK Client: Server process has exited or failed to start. Cannot make requests.',
      );
    }
    if (!this._isServerReady) {
      this.logDebug('Server not ready, awaiting initialization promise...');
      await this.serverReadyPromise;
      if (this._serverProcessExited) {
        // Check again after await
        throw new Error('E2E SDK Client: Server process exited during readiness check.');
      }
      if (!this._isServerReady) {
        throw new Error(
          'E2E SDK Client: Server did not become ready after awaiting initial connection.',
        );
      }
    }
    this.logDebug('Server is ready.');
  }

  /**
   * Calls a tool on the MCP server.
   * For streaming tools, this returns an AsyncIterable to consume progress and final result.
   * For non-streaming tools, it effectively yields one item (the final result or error).
   */
  public async *callTool(
    toolName: string,
    params?: any,
    options?: CallToolOptions,
  ): AsyncIterable<
    SDKProgressNotification | SDKJSONRPCResponse | StdioJSONRPCErrorResponse | ClientSideError
  > {
    await this.ensureServerReady();
    this.logDebug(`Calling tool '${toolName}' (adapted for single yield)`, { params, options });

    const callToolArgs = {
      name: toolName,
      arguments: params,
      _meta: {
        progress: options?.progress,
        stream: options?.stream,
      },
    };

    try {
      const finalResult = await this.sdkClient.callTool(callToolArgs as any);
      this.logDebug(`Adapted callTool: Received final result for ${toolName}:`, finalResult);
      yield finalResult as SDKJSONRPCResponse;
    } catch (error) {
      this.logDebug(`Adapted callTool: Error from sdkClient.callTool for '${toolName}':`, error);
      if (isJSONRPCError(error)) {
        yield error as StdioJSONRPCErrorResponse;
      } else {
        const clientError: ClientSideError = {
          clientError: {
            message: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code || -32001,
            data: error,
          },
        };
        yield clientError;
      }
    }
  }

  /**
   * A utility method to get the final result from a tool call,
   * especially for non-streaming tools or when only the end result of a stream is needed.
   * It will iterate through progress events if any.
   */
  public async getFinalToolResult(
    toolName: string,
    params?: any,
    options?: CallToolOptions,
  ): Promise<SDKJSONRPCResponse | StdioJSONRPCErrorResponse | ClientSideError> {
    await this.ensureServerReady();
    this.logDebug(`Getting final result for tool '${toolName}'`, { params, options });

    const callToolArgs = {
      name: toolName,
      arguments: params,
      _meta: {
        progress: options?.progress,
        stream: options?.stream,
      },
    };

    try {
      const finalResult = await this.sdkClient.callTool(callToolArgs as any);
      this.logDebug(`Final MCP result for ${toolName}:`, finalResult);

      // Extract actual data from MCP CallToolResult format
      if (finalResult && typeof finalResult === 'object' && 'content' in finalResult) {
        const mcpResult = finalResult as any;
        if (Array.isArray(mcpResult.content) && mcpResult.content.length > 0) {
          const firstContent = mcpResult.content[0];
          if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
            try {
              // Try to parse the JSON string back to the original object
              const parsedData = JSON.parse(firstContent.text);
              this.logDebug(`Extracted data from MCP format for ${toolName}:`, parsedData);
              return parsedData as SDKJSONRPCResponse;
            } catch (parseError) {
              this.logDebug(
                `Failed to parse MCP content as JSON for ${toolName}, returning text:`,
                firstContent.text,
              );
              // If it's not valid JSON, return the text as-is
              return firstContent.text as SDKJSONRPCResponse;
            }
          }
        }
      }

      // Fallback: return the raw result if it's not in expected MCP format
      this.logDebug(`Using raw result for ${toolName} (not MCP format):`, finalResult);
      return finalResult as SDKJSONRPCResponse;
    } catch (error) {
      this.logDebug(`Error from sdkClient.callTool for ${toolName}:`, error);
      if (isJSONRPCError(error)) {
        return error as StdioJSONRPCErrorResponse;
      }
      const clientError: ClientSideError = {
        clientError: {
          message: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code || -32001,
          data: error,
        },
      };
      return clientError;
    }
  }

  public async listTools(): Promise<ToolAnnotations[]> {
    await this.ensureServerReady();
    this.logDebug('Listing tools (raw SDK output)...');
    try {
      const response = await this.sdkClient.listTools();
      // Attempt to access a 'tools' property, or use response directly if it's the array.
      // Cast to 'any' to handle potential structural changes in the SDK response.
      const toolsArray = (response as any)?.tools || response;

      if (!Array.isArray(toolsArray)) {
        console.error(
          'E2E SDK Client: listTools response is not an array and has no .tools property or is not the array itself:',
          response,
        );
        throw new Error('Unexpected listTools response structure from SDK');
      }

      this.logDebug(
        'Successfully listed tools (raw): ',
        toolsArray.length > 0 ? toolsArray[0] : 'No tools',
      );
      return toolsArray as ToolAnnotations[]; // Ensure the final return is cast to the expected type
    } catch (error) {
      console.error('E2E SDK Client: Error listing tools (raw): ', error);
      throw error; // Rethrow to be handled by test
    }
  }

  public async stopServer(): Promise<void> {
    this.logDebug('Stopping server via transport.close().');
    this._isServerReady = false;
    this._serverProcessExited = true; // Mark as exited when stop is initiated
    if (this.transport && typeof (this.transport as any).close === 'function') {
      try {
        await (this.transport as any).close(); // SDK transport should handle killing the process
        this.logDebug('Transport closed.');
      } catch (error) {
        console.error('E2E SDK Client: Error during transport.close():', error);
      }
    } else {
      this.logDebug('Transport has no close method or transport is not defined.');
    }
  }

  public isServerReady(): boolean {
    return this._isServerReady && !this._serverProcessExited;
  }
}
