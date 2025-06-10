import { McpTool } from '../../types';

/**
 * Unified Memory Bank Tool
 * Combines memory bank lifecycle operations:
 * - init: Initialize a new memory bank
 * - get-metadata: Retrieve repository metadata
 * - update-metadata: Update repository metadata
 */
export const memoryBankTool: McpTool = {
  name: 'memory-bank',
  description:
    'Unified tool for memory bank lifecycle management including initialization, metadata retrieval, and updates',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['init', 'get-metadata', 'update-metadata'],
        description: 'The operation to perform on the memory bank',
      },
      clientProjectRoot: {
        type: 'string',
        description: 'Absolute path to the client project root (required for init operation)',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      metadata: {
        type: 'object',
        description: 'Metadata content for update operation',
      },
    },
    required: ['operation', 'repository'],
  },
  annotations: {
    title: 'Memory Bank Management',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      // Init operation returns
      success: {
        type: 'boolean',
        description: 'Whether the operation was successful',
      },
      message: {
        type: 'string',
        description: 'Status message',
      },
      path: {
        type: 'string',
        description: 'Path to the initialized memory bank (init operation)',
      },
      // Get metadata returns the metadata directly
      id: {
        type: 'string',
        description: 'Metadata ID (get-metadata operation)',
      },
      project: {
        type: 'object',
        description: 'Project information (get-metadata operation)',
      },
      tech_stack: {
        type: 'object',
        description: 'Technology stack (get-metadata operation)',
      },
      architecture: {
        type: 'string',
        description: 'Architecture description (get-metadata operation)',
      },
      memory_spec_version: {
        type: 'string',
        description: 'Memory specification version (get-metadata operation)',
      },
    },
  },
};