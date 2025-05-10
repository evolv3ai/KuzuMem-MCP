import { McpTool } from '../types';

/**
 * Get Metadata Tool
 * Used to retrieve metadata for a repository
 */
export const getMetadataTool: McpTool = {
  name: "get-metadata",
  description: "Get metadata for a repository",
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
    title: "Get Metadata",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: "object",
    properties: {
      metadata: {
        type: "object",
        description: "Metadata content",
      },
    },
  },
};

/**
 * Update Metadata Tool
 * Used to update metadata for a repository
 */
export const updateMetadataTool: McpTool = {
  name: "update-metadata",
  description: "Update metadata for a repository",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository name",
      },
      metadata: {
        type: "object",
        description: "Metadata content to update",
      },
    },
    required: ["repository", "metadata"],
  },
  annotations: {
    title: "Update Metadata",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "Whether the update was successful",
      },
      metadata: {
        type: "object",
        description: "Updated metadata content",
      },
    },
  },
};
