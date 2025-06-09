import { McpTool } from '../types';

/**
 * Count Nodes by Label Tool
 * Used to count the number of nodes with a specific label in the graph
 */
export const countNodesByLabelTool: McpTool = {
  name: 'count_nodes_by_label',
  description: 'Count the number of nodes with a specific label in the memory bank graph',
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
      label: {
        type: 'string',
        description: 'Node label to count (e.g., Component, Decision, Rule, Context)',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'label'],
  },
  annotations: {
    title: 'Count Nodes by Label',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: 'The label that was counted',
      },
      count: {
        type: 'integer',
        description: 'Number of nodes with this label',
      },
    },
  },
};

/**
 * List Nodes by Label Tool
 * Used to list nodes with a specific label in the graph
 */
export const listNodesByLabelTool: McpTool = {
  name: 'list_nodes_by_label',
  description: 'List nodes with a specific label in the memory bank graph with optional pagination',
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
      label: {
        type: 'string',
        description: 'Node label to list (e.g., Component, Decision, Rule, Context)',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of nodes to return (optional)',
      },
      offset: {
        type: 'integer',
        description: 'Number of nodes to skip for pagination (optional)',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'label'],
  },
  annotations: {
    title: 'List Nodes by Label',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: 'The label that was queried',
      },
      nodes: {
        type: 'array',
        description: 'Array of nodes with the specified label',
      },
      limit: {
        type: 'integer',
        description: 'Limit that was applied',
      },
      offset: {
        type: 'integer',
        description: 'Offset that was applied',
      },
      totalInLabel: {
        type: 'integer',
        description: 'Total count of nodes with this label (if available)',
      },
    },
  },
};

/**
 * Get Node Properties Tool
 * Used to get the schema/properties for nodes with a specific label
 */
export const getNodePropertiesTool: McpTool = {
  name: 'get_node_properties',
  description: 'Get the schema and properties definition for nodes with a specific label',
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
      label: {
        type: 'string',
        description: 'Node label to get properties for (e.g., Component, Decision, Rule)',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch', 'label'],
  },
  annotations: {
    title: 'Get Node Properties',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: 'The label that was queried',
      },
      properties: {
        type: 'array',
        description: 'Array of property definitions with name and type',
      },
    },
  },
};

/**
 * List All Indexes Tool
 * Used to list all indexes in the graph database
 */
export const listAllIndexesTool: McpTool = {
  name: 'list_all_indexes',
  description: 'List all indexes defined in the memory bank graph database',
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
      label: {
        type: 'string',
        description: 'Optional: filter indexes by node label',
      },
    },
    required: ['clientProjectRoot', 'repository', 'branch'],
  },
  annotations: {
    title: 'List All Indexes',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      indexes: {
        type: 'array',
        description: 'Array of index definitions',
      },
    },
  },
};

/**
 * List All Labels Tool
 * Used to list all node labels in the graph database
 */
export const listAllLabelsTool: McpTool = {
  name: 'list_all_labels',
  description: 'List all node labels available in the memory bank graph database',
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
    },
    required: ['clientProjectRoot', 'repository', 'branch'],
  },
  annotations: {
    title: 'List All Labels',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  returns: {
    type: 'object',
    properties: {
      labels: {
        type: 'array',
        description: 'Array of all node labels in the graph',
      },
      status: {
        type: 'string',
        description: 'Operation status',
      },
      message: {
        type: 'string',
        description: 'Optional status message',
      },
    },
  },
};
