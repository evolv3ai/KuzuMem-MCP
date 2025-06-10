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
// Context Tool Schemas
// ============================================

// TODO: Add context tool schemas

// ============================================
// Query Tool Schemas
// ============================================

// TODO: Add query tool schemas

// ============================================
// Introspect Tool Schemas
// ============================================

// TODO: Add introspect tool schemas

// ============================================
// Associate Tool Schemas
// ============================================

// TODO: Add associate tool schemas

// ============================================
// Analyze Tool Schemas
// ============================================

// TODO: Add analyze tool schemas

// ============================================
// Detect Tool Schemas
// ============================================

// TODO: Add detect tool schemas

// ============================================
// Bulk Import Tool Schemas
// ============================================

// TODO: Add bulk import tool schemas

// ============================================
// Semantic Search Tool Schemas (Future)
// ============================================

// TODO: Add semantic search tool schemas
