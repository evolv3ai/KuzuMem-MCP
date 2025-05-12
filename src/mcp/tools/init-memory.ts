import { McpTool } from '../types';

/**
 * Initialize Memory Bank Tool
 * Used to initialize a new memory bank for a repository with branch support
 */
export const initMemoryBankTool: McpTool = {
  name: 'init-memory-bank',
  description: 'Initialize a new memory bank for a repository. Only call this once per repository.',
  parameters: {
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository name to initialize',
      },
      branch: {
        type: 'string',
        description: "Branch name for repository isolation (default: 'main')",
      },
    },
    required: ['repository', 'branch'],
  },
  annotations: {
    title: 'Initialize Memory Bank',
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
        description: 'Whether the initialization was successful',
      },
      message: {
        type: 'string',
        description: 'Status message',
      },
    },
  },
};
