import { McpTool } from '../../types';

/**
 * Unified Associate Tool
 * Creates associations between entities
 */
export const associateTool: McpTool = {
  name: 'associate',
  description: `Create associations between entities to build relationships in the knowledge graph.
Available association types:
- file-component: Link a source code file to the component it implements
  Example: Link AuthService.ts file to comp-AuthService component
- tag-item: Apply a tag to any entity (component, decision, rule, or file)
  Example: Tag comp-PaymentService with tag-security-critical

Associations enable:
- Code-to-architecture traceability (which files implement which components)
- Categorization and filtering (find all security-critical components)
- Impact analysis (changes to a file affect which components)
- Governance tracking (which components are affected by which rules)

Best practices:
- Associate files when adding new components
- Use consistent tagging for better organization
- Tag items immediately when identifying concerns (security, performance, etc.)`,
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['file-component', 'tag-item'],
        description: 'Type of association to create',
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
      // File-component association
      fileId: {
        type: 'string',
        description: 'File ID (for file-component association)',
      },
      componentId: {
        type: 'string',
        description: 'Component ID (for file-component association)',
      },
      // Tag-item association
      tagId: {
        type: 'string',
        description: 'Tag ID (for tag-item association)',
      },
      itemId: {
        type: 'string',
        description: 'Item ID (for tag-item association)',
      },
    },
    required: ['type', 'repository'],
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the association was created',
      },
      message: {
        type: 'string',
        description: 'Result message',
      },
      data: {
        type: 'object',
        description: 'Association details',
      },
    },
  },
  annotations: {
    title: 'Entity Association',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
