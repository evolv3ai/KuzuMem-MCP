import { McpTool } from '../../types';

/**
 * Unified Context Tool
 * Handles context updates and session management
 */
export const contextTool: McpTool = {
  name: 'context',
  description: 'Update and manage session context',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['update'],
        description: 'Context operation (currently only update is supported)',
      },
      agent: {
        type: 'string',
        description: 'Agent identifier',
      },
      summary: {
        type: 'string',
        description: 'Summary of work performed',
      },
      observation: {
        type: 'string',
        description: 'Detailed observations',
      },
      clientProjectRoot: {
        type: 'string',
        description: 'Absolute path to the client project root',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: 'Git branch name',
      },
    },
    required: ['operation', 'agent', 'summary', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation succeeded',
      },
      contextId: {
        type: 'string',
        description: 'ID of the created context entry',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Context Management',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};
