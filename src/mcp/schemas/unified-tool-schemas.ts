import { z } from 'zod';

// ============================================
// Memory Bank Tool Schemas
// ============================================

export const MemoryBankInputSchema = z.object({
  operation: z.enum(['init', 'get-metadata', 'update-metadata']),
  clientProjectRoot: z.string().optional(), // Required only for init operation
  repository: z.string(),
  branch: z.string().default('main'),
  // Operation-specific fields
  metadata: z
    .object({
      id: z.string(),
      project: z.object({
        name: z.string(),
        created: z.string(),
        description: z.string().optional(),
      }),
      tech_stack: z.record(z.string()),
      architecture: z.string(),
      memory_spec_version: z.string(),
    })
    .optional(), // For update-metadata operation
});

// Different output schemas for different operations
export const InitMemoryBankOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  path: z.string().optional(),
});

export const GetMetadataOutputSchema = z.object({
  id: z.string(),
  project: z.object({
    name: z.string(),
    created: z.string(),
    description: z.string().optional(),
  }),
  tech_stack: z.record(z.string()),
  architecture: z.string(),
  memory_spec_version: z.string(),
});

export const UpdateMetadataOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// Union of all possible outputs for memory-bank tool
export const MemoryBankOutputSchema = z.union([
  InitMemoryBankOutputSchema,
  GetMetadataOutputSchema,
  UpdateMetadataOutputSchema,
]);

// ============================================
// Entity Tool Schemas
// ============================================

export const EntityInputSchema = z.object({
  operation: z.enum(['create', 'update', 'get', 'delete']),
  entityType: z.enum(['component', 'decision', 'rule', 'file', 'tag']),
  clientProjectRoot: z.string().optional(), // From session
  repository: z.string(),
  branch: z.string().default('main'),
  id: z.string(),
  data: z
    .object({
      // Common fields
      name: z.string().optional(),

      // Component-specific fields
      kind: z.string().optional(),
      status: z.enum(['active', 'deprecated', 'planned']).optional(),
      depends_on: z.array(z.string()).optional(),

      // Decision-specific fields
      date: z.string().optional(), // YYYY-MM-DD
      context: z.string().optional(),
      decisionStatus: z
        .enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'])
        .optional(),

      // Rule-specific fields
      created: z.string().optional(), // YYYY-MM-DD
      content: z.string().optional(),
      triggers: z.array(z.string()).optional(),
      ruleStatus: z.enum(['active', 'deprecated', 'proposed']).optional(),

      // File-specific fields
      path: z.string().optional(),
      language: z.string().optional(),
      metrics: z.record(z.any()).optional(),
      content_hash: z.string().optional(),
      mime_type: z.string().optional(),
      size_bytes: z.number().optional(),

      // Tag-specific fields
      color: z.string().optional(),
      description: z.string().optional(),
      category: z
        .enum(['security', 'performance', 'architecture', 'business', 'technical-debt'])
        .optional(),
    })
    .optional(),
});

// Output schemas for different operations
export const EntityCreateOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  entity: z.record(z.any()), // Generic entity object
});

export const EntityGetOutputSchema = z.object({
  success: z.boolean(),
  entity: z.record(z.any()).optional(),
  message: z.string().optional(),
});

export const EntityUpdateOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  entity: z.record(z.any()).optional(),
});

export const EntityDeleteOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Union of all entity outputs
export const EntityOutputSchema = z.union([
  EntityCreateOutputSchema,
  EntityGetOutputSchema,
  EntityUpdateOutputSchema,
  EntityDeleteOutputSchema,
]);

// ============================================
// Introspect Tool Schemas
// ============================================

export const IntrospectInputSchema = z.object({
  query: z.enum(['labels', 'count', 'properties', 'indexes']),
  clientProjectRoot: z.string().optional(), // From session
  repository: z.string(),
  branch: z.string().default('main'),
  target: z.string().optional(), // Required for count and properties queries
});

// Different output schemas for each query type
export const LabelsOutputSchema = z.object({
  labels: z.array(z.string()),
  status: z.enum(['complete', 'error']),
  message: z.string(),
});

export const CountOutputSchema = z.object({
  label: z.string(),
  count: z.number(),
  message: z.string().optional(),
});

export const PropertiesOutputSchema = z.object({
  label: z.string(),
  properties: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    }),
  ),
});

export const IndexesOutputSchema = z.object({
  indexes: z.array(
    z.object({
      name: z.string(),
      tableName: z.string(),
      propertyName: z.string(),
      isPrimaryKey: z.boolean(),
      indexType: z.string(),
    }),
  ),
});

// Union of all introspect outputs
export const IntrospectOutputSchema = z.union([
  LabelsOutputSchema,
  CountOutputSchema,
  PropertiesOutputSchema,
  IndexesOutputSchema,
]);

// ============================================
// Context Tool Schemas
// ============================================

export const ContextInputSchema = z.object({
  operation: z.enum(['update']), // Only update operation for now
  clientProjectRoot: z.string().optional(), // From session
  repository: z.string(),
  branch: z.string().default('main'),
  agent: z.string(),
  summary: z.string(),
  observation: z.string().optional(),
});

export const ContextUpdateOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  context: z
    .object({
      id: z.string(),
      iso_date: z.string(),
      agent: z.string(),
      summary: z.string(),
      observation: z.string().nullable(),
      repository: z.string(),
      branch: z.string(),
      created_at: z.string().nullable(),
      updated_at: z.string().nullable(),
    })
    .optional(),
});

// ============================================
// Query Tool Schemas
// ============================================

export const QueryInputSchema = z
  .object({
    type: z.enum([
      'context',
      'entities',
      'relationships',
      'dependencies',
      'governance',
      'history',
      'tags',
    ]),
    clientProjectRoot: z.string().optional(), // From session
    repository: z.string(),
    branch: z.string().default('main'),

    // Type-specific parameters
    // For context query
    latest: z.boolean().optional(),
    limit: z.number().int().positive().optional(),

    // For entities query
    label: z.string().optional(),
    offset: z.number().int().nonnegative().optional(),

    // For relationships query
    startItemId: z.string().optional(),
    depth: z.number().int().positive().optional(),
    relationshipFilter: z.string().optional(),
    targetNodeTypeFilter: z.string().optional(),

    // For dependencies query
    componentId: z.string().optional(),
    direction: z.enum(['dependencies', 'dependents']).optional(),

    // For governance query (uses componentId)

    // For history query
    itemId: z.string().optional(),
    itemType: z.enum(['Component', 'Decision', 'Rule']).optional(),

    // For tags query
    tagId: z.string().optional(),
    entityType: z.string().optional(),
  })
  .refine(
    (data) => {
      // Type-specific validation
      switch (data.type) {
        case 'entities':
          return !!data.label;
        case 'relationships':
          return !!data.startItemId;
        case 'dependencies':
        case 'governance':
          return !!data.componentId;
        case 'history':
          return !!data.itemId && !!data.itemType;
        case 'tags':
          return !!data.tagId;
        case 'context':
          return true; // No required fields
        default:
          return false;
      }
    },
    {
      message: 'Required fields missing for the specified query type',
      path: [],
    },
  )
  .refine(
    (data) => {
      // Additional validation for dependencies query
      if (data.type === 'dependencies') {
        return !!data.direction;
      }
      return true;
    },
    {
      message: 'direction is required for dependencies query',
      path: ['direction'],
    },
  );

// Different output schemas for each query type
export const ContextQueryOutputSchema = z.object({
  type: z.literal('context'),
  contexts: z.array(
    z.object({
      id: z.string(),
      iso_date: z.string(),
      agent: z.string().nullable(),
      summary: z.string().nullable(),
      observation: z.string().nullable(),
      repository: z.string(),
      branch: z.string(),
      created_at: z.string().nullable(),
      updated_at: z.string().nullable(),
    }),
  ),
});

export const EntitiesQueryOutputSchema = z.object({
  type: z.literal('entities'),
  label: z.string(),
  entities: z.array(z.any()), // Generic entities
  limit: z.number().optional(),
  offset: z.number().optional(),
  totalCount: z.number().optional(),
});

export const RelationshipsQueryOutputSchema = z.object({
  type: z.literal('relationships'),
  startItemId: z.string(),
  relatedItems: z.array(
    z
      .object({
        id: z.string(),
        type: z.string(),
      })
      .catchall(z.any()),
  ),
  relationshipFilter: z.string().optional(),
  depth: z.number().optional(),
});

export const DependenciesQueryOutputSchema = z.object({
  type: z.literal('dependencies'),
  componentId: z.string(),
  direction: z.string(),
  components: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      kind: z.string().optional(),
      status: z.string().optional(),
      depends_on: z.array(z.string()).optional(),
      repository: z.string(),
      branch: z.string(),
    }),
  ),
});

export const GovernanceQueryOutputSchema = z.object({
  type: z.literal('governance'),
  componentId: z.string(),
  decisions: z.array(z.any()),
  rules: z.array(z.any()),
});

export const HistoryQueryOutputSchema = z.object({
  type: z.literal('history'),
  itemId: z.string(),
  itemType: z.string(),
  contextHistory: z.array(z.any()),
});

export const TagsQueryOutputSchema = z.object({
  type: z.literal('tags'),
  tagId: z.string(),
  items: z.array(
    z
      .object({
        id: z.string(),
        type: z.string(),
      })
      .catchall(z.any()),
  ),
});

// Union of all query outputs
export const QueryOutputSchema = z.union([
  ContextQueryOutputSchema,
  EntitiesQueryOutputSchema,
  RelationshipsQueryOutputSchema,
  DependenciesQueryOutputSchema,
  GovernanceQueryOutputSchema,
  HistoryQueryOutputSchema,
  TagsQueryOutputSchema,
]);

// ============================================
// Associate Tool Schemas
// ============================================

export const AssociateInputSchema = z.object({
  type: z.enum(['file-component', 'tag-item']),
  clientProjectRoot: z.string().optional(), // From session
  repository: z.string(),
  branch: z.string().default('main'),

  // For file-component association
  fileId: z.string().optional(),
  componentId: z.string().optional(),

  // For tag-item association
  itemId: z.string().optional(),
  tagId: z.string().optional(),
});

export const AssociateOutputSchema = z.object({
  type: z.enum(['file-component', 'tag-item']),
  success: z.boolean(),
  message: z.string(),
  association: z.object({
    from: z.string(),
    to: z.string(),
    relationship: z.string(),
  }),
});

// ============================================
// Analyze Tool Schemas
// ============================================

export const AnalyzeInputSchema = z
  .object({
    type: z.enum(['pagerank', 'k-core', 'louvain', 'shortest-path']),
    clientProjectRoot: z.string().optional(), // From session
    repository: z.string(),
    branch: z.string().default('main'),

    // Common graph projection parameters
    projectedGraphName: z.string(),
    nodeTableNames: z.array(z.string()),
    relationshipTableNames: z.array(z.string()),

    // PageRank specific
    damping: z.number().optional(),
    maxIterations: z.number().optional(),

    // K-Core specific
    k: z.number().int().positive().optional(),

    // Shortest path specific - these are optional but required when type is 'shortest-path'
    startNodeId: z.string().optional(),
    endNodeId: z.string().optional(),
  })
  .refine(
    (data) => {
      // When type is 'shortest-path', startNodeId and endNodeId are required
      if (data.type === 'shortest-path') {
        return data.startNodeId && data.endNodeId;
      }
      return true;
    },
    {
      message: "startNodeId and endNodeId are required when type is 'shortest-path'",
      path: ['startNodeId', 'endNodeId'],
    },
  );

// Different output schemas for each analysis type
export const PageRankOutputSchema = z.object({
  type: z.literal('pagerank'),
  status: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      pagerank: z.number(),
    }),
  ),
  projectedGraphName: z.string(),
  message: z.string().optional(),
});

export const ShortestPathOutputSchema = z.object({
  type: z.literal('shortest-path'),
  status: z.string(),
  pathFound: z.boolean(),
  path: z.array(z.string()).optional(),
  pathLength: z.number().optional(),
  message: z.string().optional(),
});

export const KCoreOutputSchema = z.object({
  type: z.literal('k-core'),
  status: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      coreNumber: z.number(),
    }),
  ),
  projectedGraphName: z.string(),
  message: z.string().optional(),
});

export const LouvainOutputSchema = z.object({
  type: z.literal('louvain'),
  status: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      communityId: z.number(),
    }),
  ),
  projectedGraphName: z.string(),
  message: z.string().optional(),
});

// Union of all analyze outputs
export const AnalyzeOutputSchema = z.union([
  PageRankOutputSchema,
  ShortestPathOutputSchema,
  KCoreOutputSchema,
  LouvainOutputSchema,
]);

// ============================================
// Detect Tool Schemas
// ============================================

export const DetectInputSchema = z.object({
  type: z.enum(['cycles', 'islands', 'path', 'strongly-connected', 'weakly-connected']),
  clientProjectRoot: z.string().optional(), // From session
  repository: z.string(),
  branch: z.string().default('main'),

  // Graph projection parameters
  projectedGraphName: z.string(),
  nodeTableNames: z.array(z.string()),
  relationshipTableNames: z.array(z.string()),

  // Path-specific parameters
  startNodeId: z.string().optional(),
  endNodeId: z.string().optional(),
});

export const DetectOutputSchema = z.object({
  type: z.enum(['cycles', 'islands', 'path', 'strongly-connected', 'weakly-connected']),
  status: z.string(),
  components: z
    .array(
      z.object({
        componentId: z.number(),
        nodes: z.array(z.string()),
      }),
    )
    .optional(),
  totalComponents: z.number().optional(),
  projectedGraphName: z.string(),
  message: z.string().optional(),
  // Path-specific fields
  pathFound: z.boolean().optional(),
  path: z.array(z.string()).optional(),
  pathLength: z.number().optional(),
});

// ============================================
// Bulk Import Tool Schemas
// ============================================

export const BulkImportInputSchema = z.object({
  type: z.enum(['components', 'decisions', 'rules']),
  clientProjectRoot: z.string().optional(), // From session
  repository: z.string(),
  branch: z.string().default('main'),

  // Type-specific data arrays
  components: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.string().optional(),
        status: z.enum(['active', 'deprecated', 'planned']).optional(),
        depends_on: z.array(z.string()).optional(),
      }),
    )
    .optional(),

  decisions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        date: z.string(),
        context: z.string().optional(),
      }),
    )
    .optional(),

  rules: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        created: z.string(),
        content: z.string(),
        triggers: z.array(z.string()).optional(),
        status: z.enum(['active', 'deprecated']).optional(),
      }),
    )
    .optional(),

  // Options
  overwrite: z.boolean().default(false),
});

export const BulkImportOutputSchema = z.object({
  type: z.enum(['components', 'decisions', 'rules']),
  status: z.string(),
  imported: z.number(),
  failed: z.number(),
  skipped: z.number(),
  errors: z
    .array(
      z.object({
        id: z.string(),
        error: z.string(),
      }),
    )
    .optional(),
  message: z.string().optional(),
});

// ============================================
// Search Tool Schemas (Full-Text Search)
// ============================================

export const SearchInputSchema = z.object({
  query: z.string(),
  clientProjectRoot: z.string().optional(), // From session
  repository: z.string(),
  branch: z.string().default('main'),

  // Search mode and options
  mode: z.enum(['fulltext', 'semantic', 'hybrid']).default('fulltext'),
  entityTypes: z.array(z.enum(['component', 'decision', 'rule', 'file', 'context'])).optional(),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.7), // Similarity threshold for semantic/hybrid modes
});

export const SearchOutputSchema = z.object({
  status: z.string(),
  mode: z.enum(['fulltext', 'semantic', 'hybrid']),
  results: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['component', 'decision', 'rule', 'file', 'context']),
      name: z.string(),
      score: z.number(),
      snippet: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    }),
  ),
  totalResults: z.number(),
  query: z.string(),
  message: z.string().optional(),
});
