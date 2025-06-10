import { McpTool } from '../../types';

/**
 * Unified Query Tool
 * Consolidates all search and query operations:
 * - context: get-context
 * - entities: list-nodes-by-label
 * - relationships: get-related-items
 * - dependencies: get-component-dependencies/dependents
 * - governance: get-governing-items-for-component
 * - history: get-item-contextual-history
 * - tags: find-items-by-tag
 */
export const queryTool: McpTool = {
  name: 'query',
  description: 'Unified search and query tool for all memory bank data',
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
        description: 'Type of query to perform',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      // Context query parameters
      latest: {
        type: 'boolean',
        description: 'For context query: get only the latest context',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of results to return',
      },
      // Entities query parameters
      label: {
        type: 'string',
        description: 'For entities query: node label to query',
      },
      offset: {
        type: 'integer',
        description: 'For entities query: number of results to skip',
      },
      // Relationships query parameters
      startItemId: {
        type: 'string',
        description: 'For relationships query: starting node ID',
      },
      depth: {
        type: 'integer',
        description: 'For relationships query: traversal depth',
      },
      relationshipFilter: {
        type: 'string',
        description: 'For relationships query: filter by relationship type',
      },
      targetNodeTypeFilter: {
        type: 'string',
        description: 'For relationships query: filter by target node type',
      },
      // Dependencies query parameters
      componentId: {
        type: 'string',
        description: 'For dependencies/governance queries: component ID',
      },
      direction: {
        type: 'string',
        enum: ['dependencies', 'dependents'],
        description: 'For dependencies query: query direction',
      },
      // History query parameters
      itemId: {
        type: 'string',
        description: 'For history query: item ID',
      },
      itemType: {
        type: 'string',
        enum: ['Component', 'Decision', 'Rule'],
        description: 'For history query: type of item',
      },
      // Tags query parameters
      tagId: {
        type: 'string',
        description: 'For tags query: tag ID to search by',
      },
      entityType: {
        type: 'string',
        description: 'For tags query: filter results by entity type',
      },
    },
    required: ['type', 'repository'],
  },
  annotations: {
    title: 'Universal Query',
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
        description: 'The type of query that was performed',
      },
      // Results vary by query type
      contexts: {
        type: 'array',
        description: 'For context query: array of contexts',
      },
      entities: {
        type: 'array',
        description: 'For entities query: array of entities',
      },
      relatedItems: {
        type: 'array',
        description: 'For relationships query: array of related items',
      },
      components: {
        type: 'array',
        description: 'For dependencies query: array of components',
      },
      decisions: {
        type: 'array',
        description: 'For governance query: array of decisions',
      },
      rules: {
        type: 'array',
        description: 'For governance query: array of rules',
      },
      contextHistory: {
        type: 'array',
        description: 'For history query: array of historical contexts',
      },
      items: {
        type: 'array',
        description: 'For tags query: array of tagged items',
      },
    },
  },
};