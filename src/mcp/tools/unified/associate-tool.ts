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
      type: {
        type: 'string',
        enum: ['file-component', 'tag-item'],
        description: 'Type of association to create',
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
      fileId: {
        type: 'string',
        description: 'File ID (for file-component association)',
      },
      componentId: {
        type: 'string',
        description: 'Component ID (for file-component association)',
      },
      itemId: {
        type: 'string',
        description: 'Item ID (for tag-item association)',
      },
      tagId: {
        type: 'string',
        description: 'Tag ID (for tag-item association)',
      },
    },
    required: ['type', 'repository'],
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
