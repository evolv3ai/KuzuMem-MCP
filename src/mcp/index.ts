/**
 * MCP Module - Main Entry Point
 * This file re-exports everything from the MCP module
 */

// Import from the new locations
import { MemoryMcpServer } from './server';
import { MEMORY_BANK_MCP_TOOLS } from './tools';
import { McpServerMetadata, McpTool } from './types';

// Create server metadata
const MEMORY_BANK_MCP_SERVER: McpServerMetadata = {
  name: 'advanced-memory-bank-mcp',
  version: '2.0.0',
  description: 'MCP server for distributed Kuzu graphDB memory bank storage',
  tools: MEMORY_BANK_MCP_TOOLS.map((tool) => tool.name),
};

// Re-export everything
export { MemoryMcpServer, MEMORY_BANK_MCP_SERVER, MEMORY_BANK_MCP_TOOLS };

// Re-export individual tools for direct access
export * from './tools';

// Export types separately
export type { McpServerMetadata, McpTool };
