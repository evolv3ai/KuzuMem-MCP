import { McpTool } from '../../types';

/**
 * Unified Introspect Tool
 * Provides graph schema and metadata introspection capabilities:
 * - List all node labels
 * - Count nodes by label
 * - Get node properties for a label
 * - List all indexes
 */
export const introspectTool: McpTool = {
  name: 'introspect',
  description: 'Graph schema and metadata introspection for understanding database structure',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        enum: ['labels', 'count', 'properties', 'indexes'],
        description: 'Type of introspection query to perform',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      target: {
        type: 'string',
        description: 'Target label for count and properties queries',
      },
    },
    required: ['query', 'repository'],
  },
  annotations: {
    title: 'Schema Introspection',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      // Returns vary by query type
      labels: {
        type: 'array',
        description: 'List of node labels (for labels query)',
      },
      count: {
        type: 'number',
        description: 'Number of nodes with the target label (for count query)',
      },
      properties: {
        type: 'array',
        description: 'Property definitions for the target label (for properties query)',
      },
      indexes: {
        type: 'array',
        description: 'Index definitions (for indexes query)',
      },
      status: {
        type: 'string',
        description: 'Operation status',
      },
      message: {
        type: 'string',
        description: 'Status or error message',
      },
    },
  },
};