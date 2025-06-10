import { McpTool } from '../../types';

/**
 * Unified Introspect Tool
 * Handles database introspection operations
 */
export const introspectTool: McpTool = {
  name: 'introspect',
  description: 'Introspect database structure and contents',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['labels', 'count', 'list', 'properties', 'indexes'],
        description: 'Introspection operation to perform',
      },
      label: {
        type: 'string',
        description: 'Node label for count/list/properties operations',
      },
      limit: {
        type: 'string',
        description: 'Maximum number of results',
      },
      offset: {
        type: 'string',
        description: 'Number of results to skip',
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
    required: ['operation', 'clientProjectRoot', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation succeeded',
      },
      data: {
        type: 'object',
        description: 'Introspection results',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Database Introspection',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};