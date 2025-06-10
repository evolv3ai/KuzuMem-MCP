import { McpTool } from '../../types';

/**
 * Unified Analyze Tool
 * Handles graph analysis algorithms
 */
export const analyzeTool: McpTool = {
  name: 'analyze',
  description: 'Execute graph analysis algorithms',
  parameters: {
    type: 'object',
    properties: {
      algorithm: {
        type: 'string',
        enum: ['pagerank', 'kcore', 'community', 'centrality'],
        description: 'Analysis algorithm to execute',
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
        description: 'Node types to include in analysis',
      },
      relationshipTypes: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Relationship types to include in analysis',
      },
      parameters: {
        type: 'object',
        description: 'Algorithm-specific parameters',
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
    required: ['algorithm', 'clientProjectRoot', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the analysis succeeded',
      },
      results: {
        type: 'object',
        description: 'Analysis results',
      },
      metadata: {
        type: 'object',
        description: 'Analysis metadata',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Graph Analysis',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};