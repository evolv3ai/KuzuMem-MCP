import { McpTool } from '../../types';

/**
 * Unified Delete Tool
 * Handles deletion of memories and entities from the memory bank
 */
export const deleteTool: McpTool = {
  name: 'delete',
  description: `Delete memories and entities from the memory bank. Supports single entity deletion, bulk deletion, and branch cleanup.

Available operations:
- single: Delete a specific entity by ID and type
- bulk-by-type: Delete all entities of a specific type (component, decision, rule, file, tag, context)
- bulk-by-tag: Delete all entities associated with a specific tag
- bulk-by-branch: Delete all memories related to a specific branch
- bulk-by-repository: Delete entire repository memory bank (all branches)
- bulk-by-filter: Delete entities matching specific criteria

Entity types available:
- component: System modules, services, or code units
- decision: Architectural and technical decisions
- rule: Coding standards and architectural constraints
- file: Source code files with metadata
- tag: Labels for categorizing entities
- context: Session logs and work history

Safety features:
- Confirmation required for bulk operations
- Relationship cleanup (removes all relationships before deleting nodes)
- Detailed logging and progress reporting
- Transaction rollback on errors
- Dry-run mode for testing deletion queries

Best practices:
- Always use dry-run first for bulk operations
- Backup important data before large deletions
- Use specific filters rather than deleting entire types
- Consider archiving instead of deleting for audit trails`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: [
          'single',
          'bulk-by-type',
          'bulk-by-tag',
          'bulk-by-branch',
          'bulk-by-repository',
          'bulk-by-filter',
        ],
        description: 'Type of deletion operation to perform',
      },
      repository: {
        type: 'string',
        description: 'Repository name (required for all operations)',
      },
      branch: {
        type: 'string',
        description: 'Git branch name (optional for repository-wide operations)',
      },
      clientProjectRoot: {
        type: 'string',
        description: 'Absolute path to the client project root',
      },
      // Single entity deletion parameters
      entityType: {
        type: 'string',
        enum: ['component', 'decision', 'rule', 'file', 'tag', 'context'],
        description: 'Type of entity to delete (required for single operation)',
      },
      id: {
        type: 'string',
        description: 'Entity ID to delete (required for single operation)',
      },
      // Bulk deletion parameters
      targetType: {
        type: 'string',
        enum: ['component', 'decision', 'rule', 'file', 'tag', 'context', 'all'],
        description: 'Type of entities to delete in bulk (required for bulk-by-type)',
      },
      tagId: {
        type: 'string',
        description: 'Tag ID for bulk deletion by tag (required for bulk-by-tag)',
      },
      targetBranch: {
        type: 'string',
        description: 'Branch to delete (required for bulk-by-branch)',
      },
      // Filter parameters for bulk-by-filter
      filterStatus: {
        type: 'string',
        description:
          'Filter by entity status (e.g., deprecated, inactive) for bulk-by-filter operation',
      },
      filterCreatedBefore: {
        type: 'string',
        description:
          'Delete entities created before this date (ISO format) for bulk-by-filter operation',
      },
      filterCreatedAfter: {
        type: 'string',
        description:
          'Delete entities created after this date (ISO format) for bulk-by-filter operation',
      },
      filterNamePattern: {
        type: 'string',
        description:
          'Delete entities with names matching this pattern (regex) for bulk-by-filter operation',
      },
      // Safety and control parameters
      confirm: {
        type: 'boolean',
        description: 'Confirmation for bulk operations (required for bulk operations)',
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview what would be deleted without actually deleting',
      },
      force: {
        type: 'boolean',
        description: 'Force deletion even if there are dependent relationships',
      },
    },
    required: ['operation', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the deletion operation succeeded',
      },
      operation: {
        type: 'string',
        description: 'The deletion operation that was performed',
      },
      message: {
        type: 'string',
        description: 'Result message describing what was deleted or any errors',
      },
      deletedCount: {
        type: 'number',
        description: 'Number of entities that were deleted',
      },
      deletedEntities: {
        type: 'array',
        description: 'List of entities that were deleted (array of objects with type, id, name)',
      },
      dryRun: {
        type: 'boolean',
        description: 'Whether this was a dry run (preview only)',
      },
      warnings: {
        type: 'array',
        description: 'Any warnings generated during the deletion process (array of strings)',
      },
    },
  },
  annotations: {
    title: 'Memory Deletion',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};
