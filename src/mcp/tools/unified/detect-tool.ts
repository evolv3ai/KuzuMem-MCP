import { McpTool } from '../../types';

/**
 * Unified Detect Tool
 * Consolidates pattern detection algorithms:
 * - strongly-connected: Strongly connected components (circular dependencies)
 * - weakly-connected: Weakly connected components (isolated subsystems)
 */
export const detectTool: McpTool = {
  name: 'detect',
  description: 'Detect patterns and structures in the memory bank graph',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['strongly-connected', 'weakly-connected'],
        description: 'Type of pattern detection to perform',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      projectedGraphName: {
        type: 'string',
        description: 'Name for the projected graph (e.g., "circular-dependencies")',
      },
      nodeTableNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Node tables to include (e.g., ["Component"])',
      },
      relationshipTableNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Relationship tables to include (e.g., ["DEPENDS_ON"])',
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
  annotations: {
    title: 'Pattern Detection',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'The type of detection that was performed',
      },
      status: {
        type: 'string',
        description: 'Status of the operation',
      },
      components: {
        type: 'array',
        description: 'Detected components with their nodes',
      },
      totalComponents: {
        type: 'integer',
        description: 'Total number of components found',
      },
      projectedGraphName: {
        type: 'string',
        description: 'Name of the projected graph used',
      },
      message: {
        type: 'string',
        description: 'Additional information about the detection',
      },
    },
  },
};