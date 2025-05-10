import { McpTool } from '../types';

/**
 * Get Context Tool
 * Used to retrieve context for a repository
 */
export const getContextTool: McpTool = {
  name: "get-context",
  description: "Get the latest or all context entries for a repository. Use latest=true for the most recent context.",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository name",
      },
      latest: {
        type: "boolean",
        description: "Whether to get only the latest context (true) or all contexts (false)",
      },
      limit: {
        type: "integer",
        description: "Number of contexts to return when latest is false",
      },
    },
    required: ["repository"],
  },
  annotations: {
    title: "Get Context",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: "object",
    properties: {
      context: {
        type: "array",
        description: "Context objects",
      },
    },
  },
};

/**
 * Update Context Tool
 * Used to update context for a repository
 */
export const updateContextTool: McpTool = {
  name: "update-context",
  description: "Update context for a repository with new information",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository name",
      },
      agent: {
        type: "string",
        description: "Agent name",
      },
      issue: {
        type: "string",
        description: "Related issue",
      },
      summary: {
        type: "string",
        description: "Context summary",
      },
      decision: {
        type: "string",
        description: "Decision to add",
      },
      observation: {
        type: "string",
        description: "Observation to add",
      },
    },
    required: ["repository"],
  },
  annotations: {
    title: "Update Context",
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
        description: "Whether the update was successful",
      },
      context: {
        type: "object",
        description: "Updated context content",
      },
    },
  },
};
