import { McpTool } from '../types';

/**
 * Export Memory Bank Tool
 * Used to export a repository's memory bank to YAML files
 */
export const exportMemoryBankTool: McpTool = {
  name: "export-memory-bank",
  description: "Export a repository memory bank to YAML files",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository name",
      },
    },
    required: ["repository"],
  },
  annotations: {
    title: "Export Memory Bank",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: "object",
    properties: {
      files: {
        type: "object",
        description: "Object with file paths and YAML content",
      },
    },
  },
};

/**
 * Import Memory Bank Tool
 * Used to import YAML content into a repository's memory bank
 */
export const importMemoryBankTool: McpTool = {
  name: "import-memory-bank",
  description: "Import YAML content into a repository memory bank",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository name",
      },
      content: {
        type: "string",
        description: "YAML content to import",
      },
      type: {
        type: "string",
        description: "Memory type",
        enum: ["metadata", "context", "component", "decision", "rule"],
      },
      id: {
        type: "string",
        description: "Memory item ID",
      },
    },
    required: ["repository", "content", "type", "id"],
  },
  annotations: {
    title: "Import Memory Bank",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  returns: {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "Whether the import was successful",
      },
    },
  },
};
