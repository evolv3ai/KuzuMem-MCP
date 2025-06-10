import { McpTool } from '../../types';

/**
 * Unified Context Tool
 * Updates and manages session context
 */
export const contextTool: McpTool = {
  name: 'context',
  description: `Update and manage session context to track work progress and maintain continuity across sessions.
Operation:
- update: Record what work has been done, observations made, and progress achieved

Context is used to:
- Maintain continuity between coding sessions
- Track architectural decisions and their implementation
- Record important observations about the codebase
- Document progress on features or refactoring

Best practices:
- Update context after completing significant work
- Include both summary (high-level) and observation (detailed) information
- Reference specific components or files that were modified
- Note any decisions made or patterns discovered`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['update'],
        description: 'Context operation (currently only update is supported)',
      },
      agent: {
        type: 'string',
        description: 'Agent identifier',
      },
      summary: {
        type: 'string',
        description: 'Summary of work performed',
      },
      observation: {
        type: 'string',
        description: 'Detailed observations',
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
    },
    required: ['operation', 'agent', 'summary', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the context update succeeded',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Context entry data',
      },
    },
  },
  annotations: {
    title: 'Context Management',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};
