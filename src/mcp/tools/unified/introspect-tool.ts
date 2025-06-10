import { McpTool } from '../../types';

/**
 * Unified Introspect Tool
 * Introspects database structure and contents
 */
export const introspectTool: McpTool = {
  name: 'introspect',
  description: `Introspect database structure and contents to understand what's stored in the memory bank.
Available introspection queries:
- labels: List all node types in the database (Component, Decision, Rule, File, Tag, Context)
- count: Count how many nodes exist for a specific label
- properties: Get schema information for a node type (property names, types, sample values)
- indexes: View database indexes for performance optimization

Use cases:
- labels: Understand what entity types exist in your memory bank
- count: Monitor memory bank size, validate migrations
- properties: Understand data structure before writing queries
- indexes: Database performance troubleshooting

Example: Use 'labels' first to see available types, then 'count' to check sizes, then 'properties' to understand the schema.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        enum: ['labels', 'count', 'properties', 'indexes'],
        description: 'Introspection query to perform',
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
      target: {
        type: 'string',
        description: 'Node label for count/properties operations',
      },
    },
    required: ['query', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the introspection succeeded',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Introspection results',
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
