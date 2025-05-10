import { McpTool } from '../types';

/**
 * Add Component Tool
 * Used to add a component to a repository
 */
export const addComponentTool: McpTool = {
  name: "add-component",
  description: "Add a new component to a repository's memory bank",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository name",
      },
      id: {
        type: "string",
        description: "Component ID",
      },
      name: {
        type: "string",
        description: "Component name",
      },
      kind: {
        type: "string",
        description: "Component kind",
      },
      depends_on: {
        type: "array",
        description: "Component dependencies",
        items: {
          type: "string",
        },
      },
      status: {
        type: "string",
        description: "Component status",
        enum: ["active", "deprecated", "planned"],
      },
    },
    required: ["repository", "id", "name"],
  },
  annotations: {
    title: "Add Component",
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
      component: {
        type: "object",
        description: "Added component content",
      },
    },
  },
};
