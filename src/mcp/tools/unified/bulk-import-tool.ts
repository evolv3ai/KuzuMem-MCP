import { McpTool } from '../../types';

/**
 * Unified Bulk Import Tool
 * Handles batch import operations
 */
export const bulkImportTool: McpTool = {
  name: 'bulk-import',
  description: 'Efficiently import multiple entities and relationships',
  parameters: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Array of entities to import',
      },
      relationships: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Array of relationships to create',
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
    required: ['clientProjectRoot', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the import succeeded',
      },
      entitiesCreated: {
        type: 'string',
        description: 'Number of entities created',
      },
      relationshipsCreated: {
        type: 'string',
        description: 'Number of relationships created',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Bulk Import',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};