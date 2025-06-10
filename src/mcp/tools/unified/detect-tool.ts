import { McpTool } from '../../types';

/**
 * Unified Detect Tool
 * Detects patterns and relationships in the graph
 */
export const detectTool: McpTool = {
  name: 'detect',
  description: `Detect patterns and relationships in the knowledge graph.
Available pattern detections:
- cycles: Find circular dependencies in components (A→B→C→A)
- islands: Discover isolated component groups with no external connections
- path: Find connection path between two specific nodes
- strongly-connected: Components that can reach each other (potential circular dependencies)
- weakly-connected: Components connected regardless of direction (isolated subsystems)

Use cases:
- Cycles: Identify architectural problems, potential deadlocks
- Islands: Find unused/orphaned components, candidates for extraction
- Path: Trace request flows, understand change propagation
- Strongly-connected: Refactoring targets, dependency cleanup
- Weakly-connected: System modularity analysis`,
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['cycles', 'islands', 'path', 'strongly-connected', 'weakly-connected'],
        description: 'Pattern to detect',
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
      projectedGraphName: {
        type: 'string',
        description: 'Name for the projected graph',
      },
      nodeTableNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Node table names to include',
      },
      relationshipTableNames: {
        type: 'array',
        items: { type: 'string' },
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
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Detection results',
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
