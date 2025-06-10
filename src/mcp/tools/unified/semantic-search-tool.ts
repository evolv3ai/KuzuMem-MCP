import { McpTool } from '../../types';

/**
 * Unified Semantic Search Tool (Future Implementation)
 * Placeholder for advanced semantic search capabilities
 */
export const semanticSearchTool: McpTool = {
  name: 'semantic-search',
  description: 'Advanced semantic and full-text search (future capability)',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['semantic', 'fulltext', 'hybrid'],
        description: 'Search mode',
      },
      query: {
        type: 'string',
        description: 'Search query',
      },
      filters: {
        type: 'object',
        description: 'Search filters',
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
    required: ['mode', 'query', 'clientProjectRoot', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the search succeeded',
      },
      results: {
        type: 'object',
        description: 'Search results',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
    },
  },
  annotations: {
    title: 'Semantic Search',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};