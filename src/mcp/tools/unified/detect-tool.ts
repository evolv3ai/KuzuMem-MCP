import { McpTool } from '../../types';

/**
 * Unified Detect Tool
 * Handles pattern detection in graphs
 */
export const detectTool: McpTool = {
  name: 'detect',
  description: 'Detect patterns and relationships in the graph',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['cycles', 'islands', 'path', 'strongly-connected', 'weakly-connected'],
        description: 'Pattern to detect',
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
      projectedGraphName: {
        type: 'string',
        description: 'Name for the projected graph',
      },
      nodeTableNames: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Node table names to include',
      },
      relationshipTableNames: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Relationship table names to include',
      },
      startNodeId: {
        type: 'string',
        description: 'Starting node ID for path detection',
      },
      endNodeId: {
        type: 'string',
        description: 'Ending node ID for path detection',
      },
    },
    required: [
      'type',
      'repository',
      'projectedGraphName',
      'nodeTableNames',
      'relationshipTableNames',
    ],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the detection succeeded',
      },
      results: {
        type: 'object',
        description: 'Detection results',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Pattern Detection',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
