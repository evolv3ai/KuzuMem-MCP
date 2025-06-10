/**
 * MCP Tools - Index File
 * Re-exports all individual tool definitions
 */

// Export all individual tools
export { initMemoryBankTool } from './init-memory';
export { getMetadataTool, updateMetadataTool } from './metadata-tools';
export { getContextTool, updateContextTool } from './context-tools';
export { addComponentTool } from './component-tool';
export { addDecisionTool } from './decision-tool';
export { addRuleTool } from './rule-tool';

// New Basic Traversal Tools
export { getComponentDependenciesTool } from './get-component-dependencies-tool';
export { getComponentDependentsTool } from './get-component-dependents-tool';
export { getItemContextualHistoryTool } from './get-item-contextual-history-tool';
export { getGoverningItemsForComponentTool } from './get-governing-items-for-component-tool';
export { getRelatedItemsTool } from './get-related-items-tool';

// New Graph Algorithm Tools
export { kCoreDecompositionTool } from './k-core-decomposition-tool';
export { louvainCommunityDetectionTool } from './louvain-community-detection-tool';
export { pageRankTool } from './pagerank-tool';
export { stronglyConnectedComponentsTool } from './strongly-connected-components-tool';
export { weaklyConnectedComponentsTool } from './weakly-connected-components-tool';
export { shortestPathTool } from './shortest-path-tool';

// Unified Tools (New Consolidated Tools)
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

// Import all tools for the combined array
import { initMemoryBankTool } from './init-memory';
import { getMetadataTool, updateMetadataTool } from './metadata-tools';
import { getContextTool, updateContextTool } from './context-tools';
import { addComponentTool } from './component-tool';
import { addDecisionTool } from './decision-tool';
import { addRuleTool } from './rule-tool';
import { McpTool } from '../types';

// Imports for New Basic Traversal Tools
import { getComponentDependenciesTool } from './get-component-dependencies-tool';
import { getComponentDependentsTool } from './get-component-dependents-tool';
import { getItemContextualHistoryTool } from './get-item-contextual-history-tool';
import { getGoverningItemsForComponentTool } from './get-governing-items-for-component-tool';
import { getRelatedItemsTool } from './get-related-items-tool';

// Imports for New Graph Algorithm Tools
import { kCoreDecompositionTool } from './k-core-decomposition-tool';
import { louvainCommunityDetectionTool } from './louvain-community-detection-tool';
import { pageRankTool } from './pagerank-tool';
import { stronglyConnectedComponentsTool } from './strongly-connected-components-tool';
import { weaklyConnectedComponentsTool } from './weakly-connected-components-tool';
import { shortestPathTool } from './shortest-path-tool';

// Imports for Unified Tools
import { memoryBankTool } from './unified/memory-bank-tool';
import { entityTool } from './unified/entity-tool';
import { introspectTool } from './unified/introspect-tool';
import { contextTool } from './unified/context-tool';
import { queryTool } from './unified/query-tool';
import { associateTool } from './unified/associate-tool';
import { analyzeTool } from './unified/analyze-tool';
import { detectTool } from './unified/detect-tool';
import { bulkImportTool } from './unified/bulk-import-tool';

/**
 * Combined array of all MCP tools
 */
export const MEMORY_BANK_MCP_TOOLS: McpTool[] = [
  // Memory Bank Management Tools
  initMemoryBankTool,
  getMetadataTool,
  updateMetadataTool,
  getContextTool,
  updateContextTool,
  addComponentTool,
  addDecisionTool,
  addRuleTool,
  // New Basic Traversal Tools
  getComponentDependenciesTool,
  getComponentDependentsTool,
  getItemContextualHistoryTool,
  getGoverningItemsForComponentTool,
  getRelatedItemsTool,
  // New Graph Algorithm Tools
  kCoreDecompositionTool,
  louvainCommunityDetectionTool,
  pageRankTool,
  stronglyConnectedComponentsTool,
  weaklyConnectedComponentsTool,
  shortestPathTool,
  // Unified Tools (temporary - will replace old tools in phase 2)
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

// List of all tools that the server broadcasts
