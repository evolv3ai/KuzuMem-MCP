import { McpTool } from '../../types';

/**
 * Unified Query Tool
 * Executes queries against the memory bank
 */
export const queryTool: McpTool = {
  name: 'query',
  description: `Execute queries against the memory bank to retrieve information.
Available query types:
- context: Get session context and work history (what's been done recently)
- entities: List entities by type with filtering and pagination
- relationships: Explore entity relationships with depth control
- dependencies: Get component dependencies (what it needs) or dependents (what needs it)
- governance: Find rules and decisions that govern a specific component
- history: Track evolution and changes to an entity over time
- tags: Find entities by tag or get all tags

Common use cases:
- Before starting work: Use 'context' to understand recent changes
- Impact analysis: Use 'dependencies' to see what breaks if you change something
- Code review: Use 'governance' to check compliance with rules/decisions
- Architecture exploration: Use 'relationships' with depth 2-3`,
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
      // Query-specific parameters
      latest: {
        type: 'boolean',
        description: 'Get latest context entries only',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results',
      },
      offset: {
        type: 'number',
        description: 'Number of results to skip',
      },
      label: {
        type: 'string',
        description: 'Entity label for entities query',
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
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Query results',
      },
    },
  },
  annotations: {
    title: 'Query Execution',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
