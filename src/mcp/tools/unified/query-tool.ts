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
          'dependencies',
          'dependents',
          'governance',
          'context',
          'metadata',
          'history',
          'related',
        ],
        description: 'Type of query to execute',
      },
      targetId: {
        type: 'string',
        description: 'Target entity ID for the query',
      },
      filters: {
        type: 'object',
        description: 'Query filters and parameters',
      },
      limit: {
        type: 'string',
        description: 'Maximum number of results',
      },
      offset: {
        type: 'string',
        description: 'Number of results to skip',
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
    required: ['type', 'clientProjectRoot', 'repository'],
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
        type: 'string',
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