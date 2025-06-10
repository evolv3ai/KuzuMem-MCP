/**
 * Legacy compatibility schemas for memory operations
 * These are minimal schemas needed by memory operations until they are refactored
 */

import { z } from 'zod';

// Component Schema
export const ComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().nullable(),
  repository: z.string(),
  branch: z.string(),
  status: z.string().nullable(),
  depends_on: z.array(z.string()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AddComponentInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  id: z.string(),
  name: z.string(),
  kind: z.enum(['service', 'repository', 'controller', 'utility', 'middleware', 'model']),
  status: z.enum(['active', 'deprecated', 'planned']).default('active'),
  dependsOn: z.array(z.string()).optional(),
});

// Decision Schema
export const DecisionSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  context: z.string().nullable(),
  repository: z.string(),
  branch: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AddDecisionInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  id: z.string(),
  name: z.string(),
  date: z.string(),
  context: z.string().optional(),
});

// Rule Schema
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.string(),
  content: z.string().nullable(),
  repository: z.string(),
  branch: z.string(),
  status: z.string().nullable(),
  triggers: z.array(z.string()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AddRuleInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  id: z.string(),
  name: z.string(),
  created: z.string(),
  content: z.string().optional(),
  status: z.enum(['active', 'deprecated', 'proposed']).default('active'),
  triggers: z.array(z.string()).optional(),
});

export const RuleStatusSchema = z.enum(['active', 'deprecated', 'proposed']);

// Context Schema
export const ContextSchema = z.object({
  id: z.string(),
  iso_date: z.string(),
  agent: z.string().nullable(),
  summary: z.string().nullable(),
  observation: z.string().nullable(),
  repository: z.string(),
  branch: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const UpdateContextInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  agent: z.string(),
  summary: z.string(),
  observation: z.string().optional(),
});

export const GetContextOutputSchema = z.array(ContextSchema);

// Metadata Schema
export const MetadataContentSchema = z
  .object({
    id: z.string(),
    project: z
      .object({
        name: z.string(),
        description: z.string().optional(),
      })
      .optional(),
    tech_stack: z.record(z.any()).optional(),
    architecture: z.any().optional(),
    memspec_version: z.string().optional(),
  })
  .passthrough();

// File Schema
export const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  content: z.string().nullable(),
  repository: z.string(),
  branch: z.string(),
  metrics: z.record(z.any()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AddFileInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  id: z.string(),
  name: z.string(),
  path: z.string(),
  content: z.string().optional(),
  metrics: z.record(z.any()).optional(),
});

// Tag Schema
export const TagSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  category: z.string().nullable(),
  repository: z.string(),
  branch: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AddTagInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  color: z.string().optional(),
  category: z.enum(['security', 'performance', 'architecture', 'business', 'technical-debt']).optional(),
});

// Graph operation schemas
export const GetComponentDependenciesInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  componentId: z.string(),
});

export const GetComponentDependentsInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  componentId: z.string(),
});

export const GetItemContextualHistoryInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  itemId: z.string(),
  itemType: z.enum(['Component', 'Decision', 'Rule']),
});

export const GetGoverningItemsForComponentInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  componentId: z.string(),
});

export const GetRelatedItemsInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  startItemId: z.string(),
  depth: z.number().int().min(1).max(5).default(2),
  relationshipFilter: z.enum(['ALL', 'DEPENDS_ON', 'GOVERNED_BY']).default('ALL'),
  targetNodeTypeFilter: z.enum(['ALL', 'Component', 'Decision', 'Rule']).default('ALL'),
});

// Algorithm schemas
export const PageRankInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  projectedGraphName: z.string(),
  nodeTableNames: z.array(z.string()),
  relationshipTableNames: z.array(z.string()),
  dampingFactor: z.number().min(0).max(1).default(0.85),
  maxIterations: z.number().int().min(1).default(20),
});

export const ShortestPathInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  projectedGraphName: z.string(),
  nodeTableNames: z.array(z.string()),
  relationshipTableNames: z.array(z.string()),
  startNodeId: z.string(),
  endNodeId: z.string(),
});

export const StronglyConnectedComponentsInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  projectedGraphName: z.string(),
  nodeTableNames: z.array(z.string()),
  relationshipTableNames: z.array(z.string()),
});

export const WeaklyConnectedComponentsInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  projectedGraphName: z.string(),
  nodeTableNames: z.array(z.string()),
  relationshipTableNames: z.array(z.string()),
});

export const KCoreDecompositionInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  projectedGraphName: z.string(),
  nodeTableNames: z.array(z.string()),
  relationshipTableNames: z.array(z.string()),
  k: z.number().int().min(1),
});

export const LouvainCommunityDetectionInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  projectedGraphName: z.string(),
  nodeTableNames: z.array(z.string()),
  relationshipTableNames: z.array(z.string()),
});

// Introspection schemas
export const CountNodesByLabelInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  label: z.string(),
});

export const ListNodesByLabelInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  label: z.string(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});

export const GetNodePropertiesInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  label: z.string(),
});

export const ListAllIndexesInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  label: z.string().optional(),
});

export const ListAllLabelsInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
});

// Association schemas
export const AssociateFileWithComponentInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  fileId: z.string(),
  componentId: z.string(),
});

export const TagItemInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  itemId: z.string(),
  itemType: z.enum(['Component', 'Decision', 'Rule', 'File']),
  tagId: z.string(),
});

export const FindItemsByTagInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  tagId: z.string(),
  itemTypeFilter: z.enum(['ALL', 'Component', 'Decision', 'Rule', 'File']).optional(),
});

// Other schemas
export const GetMetadataInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
});

export const UpdateMetadataInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  metadata: MetadataContentSchema,
});

export const GetContextInputSchema = z.object({
  repository: z.string(),
  branch: z.string().default('main'),
  latest: z.boolean().optional(),
  limit: z.number().int().positive().default(10),
});

export const InitMemoryBankInputSchema = z.object({
  clientProjectRoot: z.string(),
  repository: z.string(),
  branch: z.string().default('main'),
});