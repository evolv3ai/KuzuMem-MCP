/**
 * MCP Tools - Index File
 * Exports all unified tool definitions
 */

// Export all unified tools
export { analyzeTool } from './unified/analyze-tool';
export { associateTool } from './unified/associate-tool';
export { bulkImportTool } from './unified/bulk-import-tool';
export { contextTool } from './unified/context-tool';
export { deleteTool } from './unified/delete-tool';
export { detectTool } from './unified/detect-tool';
export { entityTool } from './unified/entity-tool';
export { introspectTool } from './unified/introspect-tool';
export { memoryBankTool } from './unified/memory-bank-tool';
export { memoryOptimizerTool } from './unified/memory-optimizer-tool';
export { queryTool } from './unified/query-tool';
export { searchTool } from './unified/search-tool';

// Import unified tools for the combined array
import { analyzeTool } from './unified/analyze-tool';
import { associateTool } from './unified/associate-tool';
import { bulkImportTool } from './unified/bulk-import-tool';
import { contextTool } from './unified/context-tool';
import { deleteTool } from './unified/delete-tool';
import { detectTool } from './unified/detect-tool';
import { entityTool } from './unified/entity-tool';
import { introspectTool } from './unified/introspect-tool';
import { memoryBankTool } from './unified/memory-bank-tool';
import { memoryOptimizerTool } from './unified/memory-optimizer-tool';
import { queryTool } from './unified/query-tool';
import { searchTool } from './unified/search-tool';

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
  searchTool,
  deleteTool,
  memoryOptimizerTool,
];
