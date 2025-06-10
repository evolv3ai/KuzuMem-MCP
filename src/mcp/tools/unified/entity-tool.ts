import { McpTool } from '../../types';

/**
 * Unified Entity Tool
 * Handles CRUD operations for components, decisions, rules, files, and tags
 */
export const entityTool: McpTool = {
  name: 'entity',
  description: 'Create, read, update, and delete entities in the memory bank',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'update', 'get', 'delete'],
        description: 'CRUD operation to perform',
      },
      entityType: {
        type: 'string',
        enum: ['component', 'decision', 'rule', 'file', 'tag'],
        description: 'Type of entity to operate on',
      },
      id: {
        type: 'string',
        description: 'Entity ID (required for read, update, delete)',
      },
      data: {
        type: 'object',
        description: 'Entity data (required for create, update)',
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
    required: ['operation', 'entityType', 'repository'],
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
        description: 'Entity data or operation result',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Entity Management',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};
