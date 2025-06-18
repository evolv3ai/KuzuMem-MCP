import { McpTool } from '../../types';

/**
 * Unified Bulk Import Tool
 * Efficiently imports multiple entities and relationships
 */
export const bulkImportTool: McpTool = {
  name: 'bulk-import',
  description: `Efficiently import multiple entities and relationships in batch operations.
Available import types:
- components: Import multiple components with their dependencies in one operation
- decisions: Import architectural decisions in bulk
- rules: Import coding standards and governance rules in batch

Use cases:
- Initial project setup: Import existing architecture documentation
- Migration: Move data from other documentation systems
- Team onboarding: Share architectural knowledge across teams
- Backup restoration: Restore memory bank from exports

Features:
- Automatic relationship creation (dependencies between components)
- Duplicate detection (based on entity IDs)
- Transactional imports (all or nothing)
- Progress tracking for large imports

Best practices:
- Use 'overwrite: false' to preserve existing data
- Validate data format before importing
- Start with small batches to test import process`,
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['components', 'decisions', 'rules'],
        description: 'Type of entities to bulk import',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: 'Git branch name',
      },
      clientProjectRoot: {
        type: 'string',
        description: 'Absolute path to the client project root',
      },
      overwrite: {
        type: 'boolean',
        description: 'Whether to overwrite existing entities',
      },
      components: {
        type: 'array',
        description: 'Array of component entities to import',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Component ID' },
            name: { type: 'string', description: 'Component name' },
            kind: { type: 'string', description: 'Component kind (e.g., service, library)' },
            status: {
              type: 'string',
              enum: ['active', 'deprecated', 'planned'],
              description: 'Component status'
            },
            depends_on: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of component IDs this component depends on'
            },
          },
          required: ['id', 'name'],
        },
      },
      decisions: {
        type: 'array',
        description: 'Array of decision entities to import',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Decision ID' },
            name: { type: 'string', description: 'Decision name' },
            date: { type: 'string', description: 'Decision date (YYYY-MM-DD)' },
            context: { type: 'string', description: 'Decision context' },
          },
          required: ['id', 'name', 'date'],
        },
      },
      rules: {
        type: 'array',
        description: 'Array of rule entities to import',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Rule ID' },
            name: { type: 'string', description: 'Rule name' },
            created: { type: 'string', description: 'Rule creation date (YYYY-MM-DD)' },
            content: { type: 'string', description: 'Rule content' },
            triggers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of trigger keywords'
            },
            status: {
              type: 'string',
              enum: ['active', 'deprecated'],
              description: 'Rule status'
            },
          },
          required: ['id', 'name', 'created', 'content'],
        },
      },
    },
    required: ['type', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the bulk import succeeded',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Import statistics and results',
      },
    },
  },
  annotations: {
    title: 'Bulk Import',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};
