import { z } from 'zod';

// Core entity types for optimization
export const EntityTypeSchema = z.enum(['component', 'decision', 'rule', 'file', 'context', 'tag']);

// Stale entity detection
export const StaleEntitySchema = z.object({
  id: z.string(),
  type: EntityTypeSchema,
  name: z.string(),
  staleness: z
    .number()
    .min(0)
    .max(1)
    .describe('Staleness score from 0 (fresh) to 1 (completely stale)'),
  reason: z.string().describe('Explanation of why this entity is considered stale'),
  safeToDelete: z.boolean().describe('Whether this entity can be safely deleted'),
  lastAccessed: z.string().optional().describe('Last access timestamp if available'),
  dependencies: z.array(z.string()).describe('IDs of entities that depend on this one'),
  dependsOn: z.array(z.string()).describe('IDs of entities this one depends on'),
});

// Redundancy detection
export const RedundancyGroupSchema = z.object({
  entities: z.array(z.string()).min(2).describe('IDs of redundant entities'),
  similarity: z.number().min(0).max(1).describe('Similarity score between entities'),
  type: z.enum(['duplicate', 'near-duplicate', 'overlapping']).describe('Type of redundancy'),
  mergeRecommendation: z.string().optional().describe('How to merge these entities'),
  primaryEntity: z.string().optional().describe('Which entity should be kept as primary'),
});

// Optimization opportunities
export const OptimizationOpportunitySchema = z.object({
  type: z
    .enum([
      'dependency-simplification',
      'tag-consolidation',
      'relationship-cleanup',
      'orphan-removal',
      'circular-dependency-fix',
    ])
    .describe('Type of optimization opportunity'),
  impact: z.enum(['low', 'medium', 'high']).describe('Expected impact of this optimization'),
  description: z.string().describe('Detailed description of the optimization'),
  entities: z.array(z.string()).describe('Entity IDs affected by this optimization'),
  estimatedSavings: z
    .object({
      storage: z.number().optional().describe('Estimated storage savings in bytes'),
      queryPerformance: z.number().optional().describe('Estimated query performance improvement %'),
    })
    .optional(),
});

// Memory context for analysis
export const MemoryContextSchema = z.object({
  repository: z.string(),
  branch: z.string(),
  entityCounts: z.object({
    components: z.number(),
    decisions: z.number(),
    rules: z.number(),
    files: z.number(),
    contexts: z.number(),
    tags: z.number(),
  }),
  totalEntities: z.number(),
  relationshipCount: z.number(),
  averageEntityAge: z.number().optional().describe('Average age of entities in days'),
  lastOptimization: z.string().optional().describe('Timestamp of last optimization'),
});

// Analysis result
export const AnalysisResultSchema = z.object({
  summary: z.object({
    totalEntitiesAnalyzed: z.number(),
    staleEntitiesFound: z.number(),
    redundancyGroupsFound: z.number(),
    optimizationOpportunities: z.number(),
    overallHealthScore: z.number().min(0).max(1).describe('Overall memory graph health score'),
  }),
  staleEntities: z.array(StaleEntitySchema),
  redundancies: z.array(RedundancyGroupSchema),
  optimizationOpportunities: z.array(OptimizationOpportunitySchema),
  recommendations: z.array(z.string()).describe('High-level recommendations for optimization'),
  riskAssessment: z.object({
    overallRisk: z.enum(['low', 'medium', 'high']),
    criticalEntitiesAtRisk: z.array(z.string()),
    safeguardsRecommended: z.array(z.string()),
  }),
});

// Optimization plan
export const OptimizationActionSchema = z.object({
  type: z.enum(['delete', 'merge', 'update', 'move']),
  entityId: z.string(),
  targetEntityId: z.string().optional().describe('Target entity for merge/move operations'),
  reason: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  safetyChecks: z.array(z.string()).describe('Safety checks to perform before execution'),
});

export const OptimizationPlanSchema = z.object({
  id: z.string().describe('Unique plan identifier'),
  strategy: z.enum(['conservative', 'balanced', 'aggressive']),
  actions: z.array(OptimizationActionSchema),
  estimatedImpact: z.object({
    entitiesAffected: z.number(),
    storageReduction: z.number().optional(),
    performanceImprovement: z.number().optional(),
  }),
  safetyMeasures: z.object({
    snapshotRequired: z.boolean(),
    confirmationRequired: z.boolean(),
    rollbackPlan: z.string(),
  }),
  executionOrder: z.array(z.string()).describe('Order in which actions should be executed'),
});

// Optimization result
export const OptimizationResultSchema = z.object({
  planId: z.string(),
  status: z.enum(['success', 'partial', 'failed']),
  executedActions: z.array(
    z.object({
      actionId: z.string(),
      status: z.enum(['success', 'failed', 'skipped']),
      error: z.string().optional(),
    }),
  ),
  summary: z.object({
    entitiesDeleted: z.number(),
    entitiesMerged: z.number(),
    entitiesUpdated: z.number(),
    storageFreed: z.number().optional(),
  }),
  snapshotId: z.string().optional().describe('Snapshot ID for rollback if needed'),
});

// Type exports
export type EntityType = z.infer<typeof EntityTypeSchema>;
export type StaleEntity = z.infer<typeof StaleEntitySchema>;
export type RedundancyGroup = z.infer<typeof RedundancyGroupSchema>;
export type OptimizationOpportunity = z.infer<typeof OptimizationOpportunitySchema>;
export type MemoryContext = z.infer<typeof MemoryContextSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type OptimizationAction = z.infer<typeof OptimizationActionSchema>;
export type OptimizationPlan = z.infer<typeof OptimizationPlanSchema>;
export type OptimizationResult = z.infer<typeof OptimizationResultSchema>;
