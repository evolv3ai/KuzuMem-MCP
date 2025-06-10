import { McpTool } from '../../types';

/**
 * Unified Memory Bank Tool
 * Handles memory bank operations: init, status, health
 */
export const memoryBankTool: McpTool = {
  name: 'memory-bank',
  description: 'Initialize and manage memory bank instances',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['init', 'status', 'health'],
        description: 'Memory bank operation to perform',
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
    required: ['operation', 'clientProjectRoot', 'repository'],
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
        description: 'Operation-specific result data',
      },
    },
  },
  annotations: {
    title: 'Memory Bank Management',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};