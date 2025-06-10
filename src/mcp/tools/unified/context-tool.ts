import { McpTool } from '../../types';

/**
 * Unified Context Tool
 * Handles context update operations for tracking work progress.
 * Note: get-context functionality is moved to the query tool.
 */
export const contextTool: McpTool = {
  name: 'context',
  description: 'Update work context to track progress and observations',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['update'],
        description: 'Operation to perform (currently only update)',
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      agent: {
        type: 'string',
        description: 'Agent identifier (e.g., cursor, copilot)',
      },
      summary: {
        type: 'string',
        description: 'Summary of work done',
      },
      observation: {
        type: 'string',
        description: 'Optional observation or note about the work',
      },
    },
    required: ['operation', 'repository', 'agent', 'summary'],
  },
  annotations: {
    title: 'Context Update',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the update was successful',
      },
      message: {
        type: 'string',
        description: 'Success or error message',
      },
      context: {
        type: 'object',
        description: 'The updated context object',
      },
    },
  },
};