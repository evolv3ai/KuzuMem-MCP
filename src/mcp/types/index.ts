/**
 * MCP Tool Definitions - Type Definitions
 * Following the Model Context Protocol specification
 * See: https://modelcontextprotocol.io
 */

/**
 * MCP Tool Interface
 * Base interface for all MCP tools
 */
export interface McpTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
        title?: string; // Optional title for parameters (per MCP spec)
        enum?: string[];
        items?: {
          type: string;
        };
      }
    >;
    required: string[];
  };
  returns: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
        title?: string; // Optional title for return values (per MCP spec)
      }
    >;
  };
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

/**
 * MCP Server Metadata
 */
export interface McpServerMetadata {
  name: string;
  version: string;
  description: string;
  tools: string[];
}
