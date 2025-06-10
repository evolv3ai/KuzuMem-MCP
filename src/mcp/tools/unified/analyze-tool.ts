import { McpTool } from '../../types';

/**
 * Unified Analyze Tool
 * Consolidates system analysis algorithms:
 * - pagerank: PageRank algorithm for importance analysis
 * - shortest-path: Find shortest path between nodes
 * - k-core: K-core decomposition for cohesion analysis
 * - louvain: Louvain community detection
 */
export const analyzeTool: McpTool = {
  name: 'analyze',
  description: 'Run graph analysis algorithms on the memory bank',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['pagerank', 'shortest-path', 'k-core', 'louvain'],
        description: 'Type of analysis to perform',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      // Graph projection parameters
      projectedGraphName: {
        type: 'string',
        description: 'Name for the projected graph (e.g., "component-dependencies")',
      },
      nodeTableNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Node tables to include (e.g., ["Component", "Decision"])',
      },
      relationshipTableNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Relationship tables to include (e.g., ["DEPENDS_ON"])',
      },
      // PageRank parameters
      damping: {
        type: 'number',
        description: 'For pagerank: damping factor (default 0.85)',
      },
      maxIterations: {
        type: 'integer',
        description: 'For pagerank: maximum iterations (default 100)',
      },
      // Shortest Path parameters
      startNodeId: {
        type: 'string',
        description: 'For shortest-path: starting node ID',
      },
      endNodeId: {
        type: 'string',
        description: 'For shortest-path: ending node ID',
      },
      // K-Core parameters
      k: {
        type: 'integer',
        description: 'For k-core: minimum degree value',
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
    title: 'System Analysis',
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
        description: 'The type of analysis that was performed',
      },
      status: {
        type: 'string',
        description: 'Status of the operation',
      },
      // PageRank/K-Core/Louvain return nodes with scores
      nodes: {
        type: 'array',
        description: 'For pagerank/k-core/louvain: nodes with analysis results',
      },
      // Shortest Path returns path information
      pathFound: {
        type: 'boolean',
        description: 'For shortest-path: whether a path was found',
      },
      path: {
        type: 'array',
        description: 'For shortest-path: the path found',
      },
      pathLength: {
        type: 'integer',
        description: 'For shortest-path: length of the path',
      },
      projectedGraphName: {
        type: 'string',
        description: 'Name of the projected graph used',
      },
      message: {
        type: 'string',
        description: 'Additional information about the analysis',
      },
    },
  },
};