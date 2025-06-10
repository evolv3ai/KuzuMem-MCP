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

// TODO: Add entity tool schemas

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
