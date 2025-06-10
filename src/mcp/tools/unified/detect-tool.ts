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
      pattern: {
        type: 'string',
        enum: ['cycles', 'islands', 'path'],
        description: 'Pattern to detect',
      },
      startNodeId: {
        type: 'string',
        description: 'Starting node ID for path detection',
      },
      endNodeId: {
        type: 'string',
        description: 'Ending node ID for path detection',
      },
      graphName: {
        type: 'string',
        description: 'Name for the projected graph',
      },
      nodeTypes: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Node types to include',
      },
      relationshipTypes: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Relationship types to include',
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
    required: ['pattern', 'clientProjectRoot', 'repository'],
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