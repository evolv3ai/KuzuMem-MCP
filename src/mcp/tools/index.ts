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
export { exportMemoryBankTool, importMemoryBankTool } from './import-export';

// Import all tools for the combined array
import { initMemoryBankTool } from './init-memory';
import { getMetadataTool, updateMetadataTool } from './metadata-tools';
import { getContextTool, updateContextTool } from './context-tools';
import { addComponentTool } from './component-tool';
import { addDecisionTool } from './decision-tool';
import { addRuleTool } from './rule-tool';
import { exportMemoryBankTool, importMemoryBankTool } from './import-export';
import { McpTool } from '../types';

/**
 * Combined array of all MCP tools
 */
export const MEMORY_BANK_MCP_TOOLS: McpTool[] = [
  initMemoryBankTool,
  getMetadataTool,
  updateMetadataTool,
  getContextTool,
  updateContextTool,
  addComponentTool,
  addDecisionTool,
  addRuleTool,
  exportMemoryBankTool,
  importMemoryBankTool
];
