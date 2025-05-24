import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Interim type for the structure of tool_call containing tool_response
interface ToolCallObjectWithResponse {
  tool_response: {
    content: Array<{ type: string; text?: string; data?: any } & { [key: string]: any }>;
    // Add other properties of tool_response if known/needed
  };
  // Add other properties of tool_call if known/needed
}

// Define a local interface for JSON-RPC Error Response structure
interface MyJSONRPCErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

// It's crucial to use actual types from @modelcontextprotocol/sdk if they are exported.
// The following are illustrative based on common JSON-RPC and the user's findings.
// import { JSONRPCRequest, JSONRPCResponse, /* ... other needed types ... */ } from '@modelcontextprotocol/sdk/dist/types'; // Example import path
// import { ProgressNotification, ProgressNotificationParams } from '@modelcontextprotocol/sdk/dist/protocol'; // Example import path
// Local type definitions. These are prioritized to resolve conflicts and type issues.

// Interface for requests that expect a response (non-null id)
interface IdentifiedJSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number; // Changed from string | number | null, as send() expects non-null id for tracked requests
  method: string;
  params?: any[] | object;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null; // Responses can have null id if the request was a notification (though we track identified reqs here)
  result?: any;
  error?: JSONRPCError;
}

// Based on user's summary for sendProgress and notifications/progress
interface ProgressNotificationParams {
  progressToken: string;
  progress?: number;
  message?: string;
  data?: any; // As per user summary: "a data sub-object"
}

export interface ProgressNotification {
  method: 'notifications/progress';
  params: ProgressNotificationParams;
}

// A union type for messages the onMessage handler might receive
export type SDKMessage = JSONRPCResponse | ProgressNotification; // Add other expected notification types

// Represents the structure of the 'result' field for a successful tool call
// This structure is based on the user's description of CallToolResult and how to access its content.
export interface CallToolResult {
  tool_call: {
    id: string; // Usually matches the MCP call's request ID that initiated this
    tool_name: string;
    tool_args: string; // JSON string of arguments passed to the tool
    tool_response: {
      // This part is populated in the response from the tool
      content: any[] | string; // The actual content returned by the tool
      [key: string]: any; // Tools might return other fields
    };
  };
  // Other potential fields in a tool call result if any
}

export interface HandleTransportEventsResult {
  progressEvents: ProgressNotificationParams[];
  finalEvent: JSONRPCResponse | null;
  errors: Error[]; // Errors encountered during transport handling or send
}

/**
 * Handles sending a request via the SDK transport and collecting progress
 * and final events for that request.
 * Assumes the sdkTransportInstance allows setting `onMessage` and `onError`
 * callback properties for handling incoming messages and transport errors.
 */
export async function handleTransportEvents(
  sdkTransportInstance: StreamableHTTPClientTransport, // Actual SDK type
  requestId: string | number, // Matches the id type in IdentifiedJSONRPCRequest
  requestToSend: IdentifiedJSONRPCRequest, // Use the refined request type
  timeoutMs: number = 10000,
): Promise<HandleTransportEventsResult> {
  return new Promise((resolve) => {
    const progressEvents: ProgressNotificationParams[] = [];
    let finalEvent: JSONRPCResponse | null = null;
    const handlerErrors: Error[] = [];
    let timeoutId: NodeJS.Timeout | null = null;

    // Cast to `any` to attempt to set hypothesized event handlers.
    // This is a workaround if StreamableHTTPClientTransport's type doesn't declare these.
    // The underlying assumption is that the JS object might still support them.
    const transportAsAny = sdkTransportInstance as any;
    const originalOnMessage = transportAsAny.onMessage;
    const originalOnError = transportAsAny.onError;
    // const originalOnClose = transportAsAny.onClose; // Add if onclose handling is also needed

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Restore original handlers
      transportAsAny.onMessage = originalOnMessage;
      transportAsAny.onError = originalOnError;
      // transportAsAny.onClose = originalOnClose;
    };

    transportAsAny.onMessage = (message: SDKMessage) => {
      console.log(
        '[DEBUG handleTransportEvents] onMessage received:',
        JSON.stringify(message, null, 2),
      );
      if (message && typeof message === 'object') {
        // Check if it's a response related to our request ID
        if ('id' in message && message.id === requestId) {
          console.log('[DEBUG handleTransportEvents] Final event found for requestId:', requestId);
          finalEvent = message as JSONRPCResponse;
          cleanup();
          resolve({ progressEvents, finalEvent, errors: handlerErrors });
        } else if ('method' in message && message.method === 'notifications/progress') {
          // Progress notifications are identified by method and contain a progressToken.
          // The server-side wrapper is expected to use the original request's ID as the progressToken.
          const progressMessage = message as ProgressNotification;
          if (
            progressMessage.params &&
            progressMessage.params.progressToken === String(requestId)
          ) {
            // Ensure progressToken is compared as string if requestId can be number
            console.log(
              '[DEBUG handleTransportEvents] Progress event found for requestId:',
              requestId,
            );
            progressEvents.push(progressMessage.params);
          }
        } else {
          console.log('[DEBUG handleTransportEvents] Unhandled message type or mismatched ID:', {
            messageId: 'id' in message ? message.id : 'no id',
            expectedId: requestId,
            messageMethod: 'method' in message ? message.method : 'no method',
          });
        }
        // Potentially handle other types of notifications if necessary
      }
    };

    transportAsAny.onError = (error: any) => {
      // Handles transport-level errors (e.g., connection issues, non-JSON-RPC errors)
      console.log('[DEBUG handleTransportEvents] Transport error received:', error);
      console.log('[DEBUG handleTransportEvents] Error type:', typeof error);
      console.log('[DEBUG handleTransportEvents] Error details:', JSON.stringify(error, null, 2));
      const err = error instanceof Error ? error : new Error(String(error?.message || error));
      handlerErrors.push(err);
      // A transport error likely means we won't get a finalEvent for this request.
      cleanup();
      resolve({ progressEvents, finalEvent: null, errors: handlerErrors });
    };

    // Set up a timeout for the entire operation
    timeoutId = setTimeout(() => {
      handlerErrors.push(
        new Error(
          `Timeout after ${timeoutMs}ms waiting for final response for request ID ${requestId}`,
        ),
      );
      cleanup();
      resolve({ progressEvents, finalEvent, errors: handlerErrors });
    }, timeoutMs);

    // Send the request using the transport
    // The `send` method is expected to be Promise<void>.
    console.log('[DEBUG handleTransportEvents] Sending request:', requestToSend);
    sdkTransportInstance.send(requestToSend as any).catch((sendError: any) => {
      // Catches errors from the send call itself (e.g., if the transport is not connected)
      console.log('[DEBUG handleTransportEvents] Send error:', sendError);
      const err =
        sendError instanceof Error ? sendError : new Error(String(sendError?.message || sendError));
      handlerErrors.push(err);
      // If send fails, it's unlikely onMessage or onError (for received messages) will be triggered for this request.
      cleanup();
      resolve({ progressEvents, finalEvent: null, errors: handlerErrors });
    });
  });
}

/**
 * Parses the content from a tool result object.
 * The tool result can be either the new MCP CallToolResult format or the old format.
 * The tool result is typically found in the `result` field of a successful
 * JSONRPCResponse for a tool invocation.
 */
export function parseSdkResponseContent<T = unknown>(toolResult: any | null | undefined): T | null {
  if (!toolResult) {
    return null;
  }

  // Check if this is the new MCP format with content array
  if (toolResult.content && Array.isArray(toolResult.content)) {
    if (toolResult.content.length > 0) {
      const firstContent = toolResult.content[0];
      if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
        try {
          // Try to parse the JSON string back to the original object
          return JSON.parse(firstContent.text) as T;
        } catch (parseError) {
          // If parsing fails, return the text as-is
          return firstContent.text as unknown as T;
        }
      }
    }
    return toolResult.content as T;
  }

  // Check if this is the old CallToolResult format
  if (toolResult.tool_call && toolResult.tool_call.tool_response) {
    return toolResult.tool_call.tool_response.content as T;
  }

  // If neither format matches, return as-is
  return toolResult as T;
}

// Old utility functions like collectSdkStreamEvents and their specific helper types
// (e.g., JSONRPCErrorWithName, McpProgressNotificationWithName, MyJSONRPCErrorResponse)
// are no longer needed with the new handleTransportEvents approach and should be removed.

// Ensure StreamableHTTPClientTransport is imported, e.g.:
// import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/dist/client/transport/http'; // Path might vary
// Make sure this file does not have conflicting definitions if SDK types are globally available or imported elsewhere.
