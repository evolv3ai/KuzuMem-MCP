/**
 * MCP Tools - Index File
 * Exports all unified tool definitions
 */

// Export all unified tools
export { memoryBankTool } from './unified/memory-bank-tool';
export { entityTool } from './unified/entity-tool';
export { introspectTool } from './unified/introspect-tool';
export { contextTool } from './unified/context-tool';
export { queryTool } from './unified/query-tool';
export { associateTool } from './unified/associate-tool';
export { analyzeTool } from './unified/analyze-tool';
export { detectTool } from './unified/detect-tool';
export { bulkImportTool } from './unified/bulk-import-tool';
export { semanticSearchTool } from './unified/semantic-search-tool';

// Import unified tools for the combined array
import { memoryBankTool } from './unified/memory-bank-tool';
import { entityTool } from './unified/entity-tool';
import { introspectTool } from './unified/introspect-tool';
import { contextTool } from './unified/context-tool';
import { queryTool } from './unified/query-tool';
import { associateTool } from './unified/associate-tool';
import { analyzeTool } from './unified/analyze-tool';
import { detectTool } from './unified/detect-tool';
import { bulkImportTool } from './unified/bulk-import-tool';
// Note: semanticSearchTool is not included in the broadcast list as it's a future capability

import { McpTool } from '../types';

/**
 * Combined array of all MCP tools
 * These are the tools that will be broadcast by the MCP server
 */
export const MEMORY_BANK_MCP_TOOLS: McpTool[] = [
  // Unified Tools
  memoryBankTool,
  entityTool,
  introspectTool,
  contextTool,
  queryTool,
  associateTool,
  analyzeTool,
  detectTool,
  bulkImportTool,
  // Note: semanticSearchTool is not included here as it's a future capability
];