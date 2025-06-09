import { McpTool } from '../types';

/**
 * Add File Tool
 * Used to add a file record to the memory bank
 */
export const addFileTool: McpTool = {
  name: 'add_file',
  description: 'Add a file record to the memory bank with metadata and optional metrics',
  parameters: {
    type: 'object',
    properties: {
      clientProjectRoot: {
        type: 'string',
        description:
          "The absolute file system path to the root of the client's project where the memory bank will be stored.",
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
        description: "File node ID (e.g., 'file-path/to/file.ts-v1')",
      },
      name: {
        type: 'string',
        description: "File name (e.g., 'file.ts')",
      },
      path: {
        type: 'string',
        description: 'File path',
      },
      language: {
        type: 'string',
        description: 'Primary programming language of the file (optional)',
      },
      metrics: {
        type: 'object',
        description:
          'JSON object for various file metrics, e.g., line_count, complexity (optional)',
      },
      content_hash: {
        type: 'string',
        description: 'SHA256 hash of the file content for versioning/caching (optional)',
      },
      mime_type: {
        type: 'string',
        description: 'MIME type of the file (optional)',
      },
      size_bytes: {
        type: 'integer',
        description: 'File size in bytes (optional)',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'id', 'name', 'path'],
  },
  annotations: {
    title: 'Add File',
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
        description: 'Status message',
      },
      file: {
        type: 'object',
        description: 'Added file record',
      },
    },
  },
};

/**
 * Associate File with Component Tool
 * Used to create a relationship between a file and a component
 */
export const associateFileWithComponentTool: McpTool = {
  name: 'associate_file_with_component',
  description: 'Create a CONTAINS_FILE relationship from Component to File',
  parameters: {
    type: 'object',
    properties: {
      clientProjectRoot: {
        type: 'string',
        description:
          "The absolute file system path to the root of the client's project where the memory bank will be stored.",
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      componentId: {
        type: 'string',
        description: 'Component ID to associate with',
      },
      fileId: {
        type: 'string',
        description: 'File ID to associate',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'componentId', 'fileId'],
  },
  annotations: {
    title: 'Associate File with Component',
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
        description: 'Whether the association was successful',
      },
      message: {
        type: 'string',
        description: 'Status message',
      },
    },
  },
};

/**
 * Add Tag Tool
 * Used to add a tag to the memory bank
 */
export const addTagTool: McpTool = {
  name: 'add_tag',
  description: 'Add a tag to the memory bank for categorizing and organizing items',
  parameters: {
    type: 'object',
    properties: {
      clientProjectRoot: {
        type: 'string',
        description:
          "The absolute file system path to the root of the client's project where the memory bank will be stored.",
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
        description: "Tag ID (e.g., 'tag-typescript')",
      },
      name: {
        type: 'string',
        description: "Tag name (e.g., 'typescript')",
      },
      color: {
        type: 'string',
        description: 'Color associated with the tag, e.g., hex code (optional)',
      },
      description: {
        type: 'string',
        description: 'Tag description (optional)',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'id', 'name'],
  },
  annotations: {
    title: 'Add Tag',
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
        description: 'Status message',
      },
      tag: {
        type: 'object',
        description: 'Added tag record',
      },
    },
  },
};

/**
 * Tag Item Tool
 * Used to apply a tag to an item (Component, Decision, Rule, File, Context)
 */
export const tagItemTool: McpTool = {
  name: 'tag_item',
  description: 'Apply a tag to an item by creating an IS_TAGGED_WITH relationship',
  parameters: {
    type: 'object',
    properties: {
      clientProjectRoot: {
        type: 'string',
        description:
          "The absolute file system path to the root of the client's project where the memory bank will be stored.",
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      itemId: {
        type: 'string',
        description: 'ID of the item to tag',
      },
      itemType: {
        type: 'string',
        description: 'Type of the item to tag',
        enum: ['Component', 'Decision', 'Rule', 'File', 'Context'],
      },
      tagId: {
        type: 'string',
        description: 'Tag ID to apply',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'itemId', 'itemType', 'tagId'],
  },
  annotations: {
    title: 'Tag Item',
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
        description: 'Whether the tagging was successful',
      },
      message: {
        type: 'string',
        description: 'Status message',
      },
    },
  },
};

/**
 * Find Items by Tag Tool
 * Used to find all items that have a specific tag
 */
export const findItemsByTagTool: McpTool = {
  name: 'find_items_by_tag',
  description: 'Find all items that are tagged with a specific tag',
  parameters: {
    type: 'object',
    properties: {
      clientProjectRoot: {
        type: 'string',
        description:
          "The absolute file system path to the root of the client's project where the memory bank will be stored.",
      },
      repository: {
        type: 'string',
        description: 'Repository name',
      },
      branch: {
        type: 'string',
        description: "Repository branch (defaults to 'main')",
      },
      tagId: {
        type: 'string',
        description: 'Tag ID to search by',
      },
      itemTypeFilter: {
        type: 'string',
        description: 'Optional filter for item type',
        enum: ['Component', 'Decision', 'Rule', 'File', 'Context', 'All'],
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'tagId'],
  },
  annotations: {
    title: 'Find Items by Tag',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      tagId: {
        type: 'string',
        description: 'The tag ID that was searched',
      },
      items: {
        type: 'array',
        description: 'Array of items with the specified tag',
      },
    },
  },
};
