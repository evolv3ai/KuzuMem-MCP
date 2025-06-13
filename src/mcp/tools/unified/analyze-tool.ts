import { McpTool } from '../../types';

/**
 * Unified Analyze Tool
 * Executes graph analysis algorithms
 */
export const analyzeTool: McpTool = {
  name: 'analyze',
  description: `Execute graph analysis algorithms to understand system structure and relationships.
Available algorithms:
- pagerank: Identify critical/important components by analyzing dependency relationships. Higher score = more important
- k-core: Find tightly coupled component clusters. Components in k-core have at least k connections to other components in the core
- louvain: Community detection to discover natural modules/groupings in your architecture. Components in same community = closely related

Use cases:
- PageRank: Find bottlenecks, prioritize testing, identify high-impact components
- K-Core: Detect tightly coupled code that might need refactoring
- Louvain: Discover microservice boundaries, understand system modules`,
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['pagerank', 'k-core', 'louvain'],
        description: 'Analysis algorithm to execute',
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
        items: { type: 'string' },
        description: 'Node table names to include in analysis',
      },
      relationshipTableNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Relationship table names to include in analysis',
      },
      damping: {
        type: 'number',
        description: 'Damping factor for PageRank (default: 0.85)',
      },
      maxIterations: {
        type: 'number',
        description: 'Maximum iterations for PageRank',
      },
      k: {
        type: 'number',
        description: 'K value for k-core decomposition',
      },
    },
    required: ['type', 'clientProjectRoot', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the analysis succeeded',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Analysis results',
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
