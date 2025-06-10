import { McpTool } from '../../types';

/**
 * Unified Associate Tool
 * Handles associations between entities
 */
export const associateTool: McpTool = {
  name: 'associate',
  description: 'Create associations between entities',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['file-component', 'tag-item'],
        description: 'Type of association to create',
      },
      sourceId: {
        type: 'string',
        description: 'Source entity ID',
      },
      targetId: {
        type: 'string',
        description: 'Target entity ID',
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
    required: ['operation', 'sourceId', 'targetId', 'clientProjectRoot', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the association succeeded',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Entity Association',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};