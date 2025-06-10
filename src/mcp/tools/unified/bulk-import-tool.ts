import { McpTool } from '../../types';

/**
 * Unified Bulk Import Tool
 * Enables bulk import of entities into the memory bank:
 * - components: Import multiple components at once
 * - decisions: Import multiple decisions at once
 * - rules: Import multiple rules at once
 */
export const bulkImportTool: McpTool = {
  name: 'bulk-import',
  description: 'Bulk import entities into the memory bank',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['components', 'decisions', 'rules'],
        description: 'Type of entities to import',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      // Components array
      components: {
        type: 'array',
        description: 'For type=components: array of components to import',
      },
      // Decisions array
      decisions: {
        type: 'array',
        description: 'For type=decisions: array of decisions to import',
      },
      // Rules array
      rules: {
        type: 'array',
        description: 'For type=rules: array of rules to import',
      },
      overwrite: {
        type: 'boolean',
        description: 'Whether to overwrite existing entities (default: false)',
      },
    },
    required: ['type', 'repository'],
  },
  annotations: {
    title: 'Bulk Data Import',
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
        description: 'The type of entities that were imported',
      },
      status: {
        type: 'string',
        description: 'Status of the import operation',
      },
      imported: {
        type: 'integer',
        description: 'Number of entities successfully imported',
      },
      failed: {
        type: 'integer',
        description: 'Number of entities that failed to import',
      },
      skipped: {
        type: 'integer',
        description: 'Number of entities skipped (already exist)',
      },
      errors: {
        type: 'array',
        description: 'Details of any import errors',
      },
      message: {
        type: 'string',
        description: 'Summary message',
      },
    },
  },
};