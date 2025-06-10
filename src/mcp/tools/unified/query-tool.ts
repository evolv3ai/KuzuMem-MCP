import { McpTool } from '../../types';

/**
 * Unified Query Tool
 * Handles various query operations: dependencies, governance, context, metadata, etc.
 */
export const queryTool: McpTool = {
  name: 'query',
  description: 'Execute queries against the memory bank',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: [
          'context',
          'entities',
          'relationships',
          'dependencies',
          'governance',
          'history',
          'tags',
        ],
        description: 'Type of query to execute',
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
      // Type-specific parameters
      latest: {
        type: 'boolean',
        description: 'Get latest context entries only',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results',
      },
      label: {
        type: 'string',
        description: 'Entity label for entities query',
      },
      offset: {
        type: 'number',
        description: 'Number of results to skip',
      },
      startItemId: {
        type: 'string',
        description: 'Start item ID for relationships query',
      },
      depth: {
        type: 'number',
        description: 'Depth for relationships query',
      },
      relationshipFilter: {
        type: 'string',
        description: 'Relationship type filter',
      },
      targetNodeTypeFilter: {
        type: 'string',
        description: 'Target node type filter',
      },
      componentId: {
        type: 'string',
        description: 'Component ID for dependencies/governance queries',
      },
      direction: {
        type: 'string',
        enum: ['dependencies', 'dependents'],
        description: 'Direction for dependencies query',
      },
      itemId: {
        type: 'string',
        description: 'Item ID for history query',
      },
      itemType: {
        type: 'string',
        enum: ['Component', 'Decision', 'Rule'],
        description: 'Item type for history query',
      },
      tagId: {
        type: 'string',
        description: 'Tag ID for tags query',
      },
      entityType: {
        type: 'string',
        description: 'Entity type filter for tags query',
      },
    },
    required: ['type', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the query succeeded',
      },
      data: {
        type: 'object',
        description: 'Query results',
      },
      totalCount: {
        type: 'number',
        description: 'Total number of matching results',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Query Operations',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
