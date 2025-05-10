import { McpTool } from '../types';

/**
 * Add Rule Tool
 * Used to add a rule to a repository's memory bank
 */
export const addRuleTool: McpTool = {
  name: "add-rule",
  description: "Add a rule to a repository's memory bank",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository name",
      },
      id: {
        type: "string",
        description: "Rule ID",
      },
      name: {
        type: "string",
        description: "Rule name",
      },
      created: {
        type: "string",
        description: "Rule creation date (YYYY-MM-DD)",
      },
      triggers: {
        type: "array",
        description: "Rule triggers",
        items: {
          type: "string",
        },
      },
      content: {
        type: "string",
        description: "Rule content",
      },
      status: {
        type: "string",
        description: "Rule status",
        enum: ["active", "deprecated"],
      },
    },
    required: ["repository", "id", "name", "created"],
  },
  annotations: {
    title: "Add Rule",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  returns: {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "Whether the operation was successful",
      },
      rule: {
        type: "object",
        description: "Added rule content",
      },
    },
  },
};
