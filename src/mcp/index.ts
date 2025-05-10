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
  name: "memory-bank-mcp",
  version: "1.0.0",
  description: "MCP server for distributed YAML memory bank storage",
  tools: MEMORY_BANK_MCP_TOOLS.map((tool) => tool.name),
};

// Re-export everything
export {
  MemoryMcpServer,
  MEMORY_BANK_MCP_SERVER,
  MEMORY_BANK_MCP_TOOLS,
  McpServerMetadata,
  McpTool
};

// Re-export individual tools for direct access
export * from './tools';
