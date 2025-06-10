import { McpTool } from '../../types';

/**
 * Unified Associate Tool
 * Consolidates relationship creation operations:
 * - file-component: associate-file-with-component
 * - tag-item: tag-item
 */
export const associateTool: McpTool = {
  name: 'associate',
  description: 'Create associations between entities in the memory bank',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['file-component', 'tag-item'],
        description: 'Type of association to create',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      // File-component association parameters
      fileId: {
        type: 'string',
        description: 'For file-component: ID of the file to associate',
      },
      componentId: {
        type: 'string',
        description: 'For file-component or tag-item: ID of the component',
      },
      // Tag-item association parameters
      itemId: {
        type: 'string',
        description:
          'For tag-item: ID of the item to tag (can be Component, Decision, Rule, or File)',
      },
      tagId: {
        type: 'string',
        description: 'For tag-item: ID of the tag to apply',
      },
    },
    required: ['type', 'repository'],
  },
  annotations: {
    title: 'Create Association',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'The type of association that was created',
      },
      success: {
        type: 'boolean',
        description: 'Whether the association was created successfully',
      },
      message: {
        type: 'string',
        description: 'Success or error message',
      },
      association: {
        type: 'object',
        description: 'Details of the created association',
      },
    },
  },
};