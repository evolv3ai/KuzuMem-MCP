import { McpTool } from '../../types';

/**
 * Unified Entity Tool
 * Combines all entity management operations for:
 * - Components
 * - Decisions
 * - Rules
 * - Files
 * - Tags
 */
export const entityTool: McpTool = {
  name: 'entity',
  description:
    'Universal entity management tool for creating, reading, updating, and deleting Components, Decisions, Rules, Files, and Tags',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'update', 'get', 'delete'],
        description: 'The operation to perform on the entity',
      },
      entityType: {
        type: 'string',
        enum: ['component', 'decision', 'rule', 'file', 'tag'],
        description: 'The type of entity to operate on',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      id: {
        type: 'string',
        description: 'Entity ID (e.g., comp-AuthService, dec-20241210-api-design)',
      },
      data: {
        type: 'object',
        description: 'Entity data for create/update operations',
      },
    },
    required: ['operation', 'entityType', 'repository', 'id'],
  },
  annotations: {
    title: 'Entity Management',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation was successful',
      },
      message: {
        type: 'string',
        description: 'Status or error message',
      },
      entity: {
        type: 'object',
        description: 'The entity object (for create/get/update operations)',
      },
    },
  },
};