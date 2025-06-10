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
      type: {
        type: 'string',
        enum: ['components', 'decisions', 'rules'],
        description: 'Type of entities to bulk import',
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
      // Type-specific arrays are handled dynamically by the schema
      overwrite: {
        type: 'boolean',
        description: 'Whether to overwrite existing entities',
      },
    },
    required: ['type', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Import status',
      },
      imported: {
        type: 'number',
        description: 'Number of entities imported',
      },
      failed: {
        type: 'number',
        description: 'Number of entities failed',
      },
      skipped: {
        type: 'number',
        description: 'Number of entities skipped',
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
