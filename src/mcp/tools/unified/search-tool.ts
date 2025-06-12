import { McpTool } from '../../types';

/**
 * Unified Search Tool
 * Provides both full-text and semantic search capabilities
 */
export const searchTool: McpTool = {
  name: 'search',
  description: `Search across memory entities using full-text or semantic search.
Available search modes:
- fulltext: Fast keyword-based search using KuzuDB FTS extension
- semantic: AI-powered similarity search (future capability)
- hybrid: Combined fulltext and semantic search (future capability)

Entity types that can be searched:
- component: System modules, services, or code units
- decision: Architectural and technical decisions
- rule: Coding standards and constraints
- file: Source code files with content
- context: Session logs and observations`,
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['fulltext', 'semantic', 'hybrid'],
        description: 'Search mode (semantic and hybrid are future capabilities)',
      },
      query: {
        type: 'string',
        description: 'Search query text',
      },
      entityTypes: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Types of entities to search (component, decision, rule, file, context)',
      },
      conjunctive: {
        type: 'boolean',
        description: 'Whether all query terms must match (AND vs OR) - for fulltext mode only',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-50)',
      },
      threshold: {
        type: 'number',
        description: 'Similarity threshold for semantic search (0.0-1.0) - future use',
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
    required: ['query', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Status of the search operation',
      },
      results: {
        type: 'array',
        description: 'Array of search results with scores and snippets',
      },
      totalResults: {
        type: 'number',
        description: 'Total number of results found',
      },
      query: {
        type: 'string',
        description: 'Original search query',
      },
      mode: {
        type: 'string',
        description: 'Search mode used',
      },
      message: {
        type: 'string',
        description: 'Additional information about the search operation',
      },
    },
  },
  annotations: {
    title: 'Search',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
