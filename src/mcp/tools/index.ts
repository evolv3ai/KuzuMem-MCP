/**
 * MCP Tools - Index File
 * Re-exports all individual tool definitions
 */

// Export all individual tools
export { initMemoryBankTool } from "./init-memory";
export { getMetadataTool, updateMetadataTool } from "./metadata-tools";
export { getContextTool, updateContextTool } from "./context-tools";
export { addComponentTool } from "./component-tool";
export { addDecisionTool } from "./decision-tool";
export { addRuleTool } from "./rule-tool";
export { exportMemoryBankTool, importMemoryBankTool } from "./import-export";

// New Basic Traversal Tools
export { getComponentDependenciesTool } from "./get-component-dependencies-tool";
export { getComponentDependentsTool } from "./get-component-dependents-tool";
export { getItemContextualHistoryTool } from "./get-item-contextual-history-tool";
export { getGoverningItemsForComponentTool } from "./get-governing-items-for-component-tool";
export { getRelatedItemsTool } from "./get-related-items-tool";

// New Graph Algorithm Tools
export { kCoreDecompositionTool } from "./k-core-decomposition-tool";
export { louvainCommunityDetectionTool } from "./louvain-community-detection-tool";
export { pageRankTool } from "./pagerank-tool";
export { stronglyConnectedComponentsTool } from "./strongly-connected-components-tool";
export { weaklyConnectedComponentsTool } from "./weakly-connected-components-tool";
export { shortestPathTool } from "./shortest-path-tool";

// Import all tools for the combined array
import { initMemoryBankTool } from "./init-memory";
import { getMetadataTool, updateMetadataTool } from "./metadata-tools";
import { getContextTool, updateContextTool } from "./context-tools";
import { addComponentTool } from "./component-tool";
import { addDecisionTool } from "./decision-tool";
import { addRuleTool } from "./rule-tool";
import { exportMemoryBankTool, importMemoryBankTool } from "./import-export";
import { McpTool } from "../types";

// Imports for New Basic Traversal Tools
import { getComponentDependenciesTool } from "./get-component-dependencies-tool";
import { getComponentDependentsTool } from "./get-component-dependents-tool";
import { getItemContextualHistoryTool } from "./get-item-contextual-history-tool";
import { getGoverningItemsForComponentTool } from "./get-governing-items-for-component-tool";
import { getRelatedItemsTool } from "./get-related-items-tool";

// Imports for New Graph Algorithm Tools
import { kCoreDecompositionTool } from "./k-core-decomposition-tool";
import { louvainCommunityDetectionTool } from "./louvain-community-detection-tool";
import { pageRankTool } from "./pagerank-tool";
import { stronglyConnectedComponentsTool } from "./strongly-connected-components-tool";
import { weaklyConnectedComponentsTool } from "./weakly-connected-components-tool";
import { shortestPathTool } from "./shortest-path-tool";

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
  exportMemoryBankTool,
  importMemoryBankTool,
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
];
