import { McpTool } from '../../types';

/**
 * Unified Memory Bank Tool
 * Handles memory bank operations: init, status, health
 */
export const memoryBankTool: McpTool = {
  name: 'memory-bank',
  description: `Initialize and manage memory bank instances. Operations: 
- init: Initialize a new memory bank for a repository/branch (creates KuzuDB graph database)
- get-metadata: Retrieve repository metadata (tech stack, architecture, project info)
- update-metadata: Update repository metadata with new information
Each repository/branch combination has its own isolated memory bank stored at the client project root.`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['init', 'get-metadata', 'update-metadata'],
        description: 'Memory bank operation to perform',
      },
      clientProjectRoot: {
        type: 'string',
        description: 'Absolute path to the client project root (required for init)',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: 'Git branch name',
      },
      metadata: {
        type: 'object',
        description: 'Repository metadata to update (for update-metadata operation)',
      },
    },
    required: ['operation', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation succeeded',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Operation-specific result data',
      },
    },
  },
  annotations: {
    title: 'Memory Bank Management',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
