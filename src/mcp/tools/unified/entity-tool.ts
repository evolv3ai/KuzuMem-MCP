import { McpTool } from '../../types';

/**
 * Unified Entity Tool
 * Handles CRUD operations for all entities
 */
export const entityTool: McpTool = {
  name: 'entity',
  description: `Create, read, update, and delete entities in the memory bank. 
Entity types available:
- component: System modules, services, or code units (e.g., AuthService, DatabaseConnection)
- decision: Architectural and technical decisions with context and rationale
- rule: Coding standards and architectural constraints
- file: Source code files with metadata and metrics
- tag: Labels for categorizing entities (e.g., security-critical, performance)

Operations: create, update, get, delete
Each entity has relationships to other entities forming a knowledge graph.`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'update', 'get', 'delete'],
        description: 'CRUD operation to perform',
      },
      entityType: {
        type: 'string',
        enum: ['component', 'decision', 'rule', 'file', 'tag'],
        description: 'Type of entity to operate on',
      },
      id: {
        type: 'string',
        description: 'Entity ID (required for read, update, delete)',
      },
      data: {
        type: 'object',
        description: 'Entity data (required for create, update)',
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
    required: ['operation', 'entityType', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation succeeded',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Entity data or operation result',
      },
    },
  },
  annotations: {
    title: 'Entity Management',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};
