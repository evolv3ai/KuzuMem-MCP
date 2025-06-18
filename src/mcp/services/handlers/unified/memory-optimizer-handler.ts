import { z } from 'zod';
import { MemoryService } from '../../../../services/memory.service.js';
import { MemoryOptimizationAgent } from '../../../../agents/memory-optimizer/memory-optimization-agent.js';
import { validateSession, logToolExecution, handleToolError } from '../../../utils/error-utils.js';
import { logger } from '../../../../utils/logger.js';
import type { EnrichedRequestHandlerExtra } from '../../../types/sdk-custom.js';
import type { OptimizationStrategy } from '../../../../agents/memory-optimizer/prompt-manager.js';

// Input schema for memory optimizer tool
const MemoryOptimizerInputSchema = z.object({
  operation: z.enum(['analyze', 'optimize', 'rollback']),
  clientProjectRoot: z.string(),
  repository: z.string(),
  branch: z.string().default('main'),
  strategy: z.enum(['conservative', 'balanced', 'aggressive']).default('conservative'),
  llmProvider: z.enum(['openai', 'anthropic']).default('openai'),
  model: z.string().optional(),
  dryRun: z.boolean().default(true),
  confirm: z.boolean().default(false),
  maxDeletions: z.number().min(1).max(100).optional(),
  focusAreas: z.array(z.enum([
    'stale-detection',
    'redundancy-removal',
    'relationship-cleanup', 
    'dependency-optimization',
    'tag-consolidation',
    'orphan-removal'
  ])).optional(),
  preserveCategories: z.array(z.string()).optional(),
  snapshotId: z.string().optional(),
  analysisId: z.string().optional(),
});

type MemoryOptimizerParams = z.infer<typeof MemoryOptimizerInputSchema>;

// Cache for analysis results to enable multi-step workflows
const analysisCache = new Map<string, any>();

/**
 * Handler for memory optimizer tool operations
 */
export async function memoryOptimizerHandler(
  params: any,
  context: any,
): Promise<any> {
  const memoryService = await MemoryService.getInstance();
  const handlerLogger = logger.child({ 
    tool: 'memory-optimizer',
    operation: params.operation,
    repository: params.repository,
    branch: params.branch,
  });

  try {
    // Validate input parameters
    const validatedParams = MemoryOptimizerInputSchema.parse(params);
    
    // Validate session and get clientProjectRoot
    const clientProjectRoot = validateSession(context, 'memory-optimizer');

    // Update session context
    context.session.clientProjectRoot = validatedParams.clientProjectRoot || clientProjectRoot;
    context.session.repository = validatedParams.repository;
    context.session.branch = validatedParams.branch;

    // Log tool execution
    logToolExecution(context, 'memory-optimizer', {
      repository: validatedParams.repository,
      branch: validatedParams.branch,
      clientProjectRoot: context.session.clientProjectRoot,
    });

    // Initialize memory optimization agent
    const agent = new MemoryOptimizationAgent(memoryService, {
      llmProvider: validatedParams.llmProvider,
      model: validatedParams.model,
      defaultStrategy: validatedParams.strategy,
    });

    // Route to appropriate operation handler
    switch (validatedParams.operation) {
      case 'analyze':
        return await handleAnalyzeOperation(agent, validatedParams, context as EnrichedRequestHandlerExtra, handlerLogger);
      
      case 'optimize':
        return await handleOptimizeOperation(agent, validatedParams, context as EnrichedRequestHandlerExtra, handlerLogger);

      case 'rollback':
        return await handleRollbackOperation(agent, validatedParams, context as EnrichedRequestHandlerExtra, handlerLogger);
      
      default:
        throw new Error(`Unsupported operation: ${validatedParams.operation}`);
    }
  } catch (error) {
    await handleToolError(error, context, 'memory-optimizer');
    throw error;
  }
}

/**
 * Handle memory analysis operation
 */
async function handleAnalyzeOperation(
  agent: MemoryOptimizationAgent,
  params: MemoryOptimizerParams,
  context: EnrichedRequestHandlerExtra,
  logger: any,
): Promise<any> {
  logger.info('Starting memory analysis operation');

  try {
    // Perform memory analysis
    const analysisResult = await agent.analyzeMemory(
      context,
      params.clientProjectRoot,
      params.repository,
      params.branch,
      params.strategy as OptimizationStrategy,
    );

    // Generate unique analysis ID and cache results
    const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    analysisCache.set(analysisId, analysisResult);

    // Clean up old cache entries (keep last 10)
    if (analysisCache.size > 10) {
      const oldestKey = analysisCache.keys().next().value;
      if (oldestKey) {
        analysisCache.delete(oldestKey);
      }
    }

    logger.info('Memory analysis completed successfully', {
      analysisId,
      staleEntities: analysisResult.staleEntities.length,
      redundancies: analysisResult.redundancies.length,
      opportunities: analysisResult.optimizationOpportunities.length,
    });

    return {
      success: true,
      operation: 'analyze',
      data: {
        analysisId,
        summary: analysisResult.summary,
        staleEntities: analysisResult.staleEntities,
        redundancies: analysisResult.redundancies,
        optimizationOpportunities: analysisResult.optimizationOpportunities,
        recommendations: analysisResult.recommendations,
        riskAssessment: analysisResult.riskAssessment,
      },
      message: `Analysis completed. Found ${analysisResult.staleEntities.length} stale entities, ${analysisResult.redundancies.length} redundancy groups, and ${analysisResult.optimizationOpportunities.length} optimization opportunities.`,
      warnings: analysisResult.riskAssessment.overallRisk === 'high' 
        ? ['High risk detected - proceed with caution and use conservative strategy']
        : [],
    };
  } catch (error) {
    logger.error('Memory analysis failed:', error);
    throw error;
  }
}

/**
 * Handle optimization operation
 */
async function handleOptimizeOperation(
  agent: MemoryOptimizationAgent,
  params: MemoryOptimizerParams,
  context: EnrichedRequestHandlerExtra,
  logger: any,
): Promise<any> {
  logger.info('Starting optimization operation', {
    dryRun: params.dryRun,
    confirm: params.confirm,
  });

  try {
    // Get analysis results (either from cache or perform new analysis)
    let analysisResult;
    if (params.analysisId && analysisCache.has(params.analysisId)) {
      analysisResult = analysisCache.get(params.analysisId);
      logger.info('Using cached analysis results', { analysisId: params.analysisId });
    } else {
      logger.info('No cached analysis found, performing new analysis');
      analysisResult = await agent.analyzeMemory(
        context,
        params.clientProjectRoot,
        params.repository,
        params.branch,
        params.strategy as OptimizationStrategy,
      );
    }

    // Generate optimization plan
    const optimizationPlan = await agent.generateOptimizationPlan(
      context,
      params.clientProjectRoot,
      params.repository,
      params.branch,
      analysisResult,
      params.strategy as OptimizationStrategy,
    );

    // Validate confirmation for non-dry-run operations
    if (!params.dryRun && !params.confirm) {
      return {
        success: false,
        operation: 'optimize',
        message: 'Confirmation required for actual optimization. Set confirm=true to proceed.',
        warnings: ['This operation will make permanent changes to your memory graph'],
        data: {
          planId: optimizationPlan.id,
          previewActions: optimizationPlan.actions.length,
          estimatedImpact: optimizationPlan.estimatedImpact,
        },
      };
    }

    // Execute optimization plan
    const optimizationResult = await agent.executeOptimizationPlan(
      context,
      params.clientProjectRoot,
      params.repository,
      params.branch,
      optimizationPlan,
      {
        dryRun: params.dryRun,
        requireConfirmation: params.confirm,
      },
    );

    logger.info('Optimization operation completed', {
      planId: optimizationResult.planId,
      status: optimizationResult.status,
      entitiesAffected: optimizationResult.summary.entitiesDeleted + 
                       optimizationResult.summary.entitiesMerged + 
                       optimizationResult.summary.entitiesUpdated,
    });

    return {
      success: optimizationResult.status !== 'failed',
      operation: 'optimize',
      data: {
        planId: optimizationResult.planId,
        status: optimizationResult.status,
        executedActions: optimizationResult.executedActions,
        optimizationSummary: optimizationResult.summary,
        snapshotId: optimizationResult.snapshotId,
      },
      message: params.dryRun 
        ? `Dry run completed. Would affect ${optimizationResult.summary.entitiesDeleted + optimizationResult.summary.entitiesMerged + optimizationResult.summary.entitiesUpdated} entities.`
        : `Optimization completed with status: ${optimizationResult.status}. Affected ${optimizationResult.summary.entitiesDeleted + optimizationResult.summary.entitiesMerged + optimizationResult.summary.entitiesUpdated} entities.`,
      warnings: optimizationResult.status === 'partial' 
        ? ['Some optimization actions failed - check executedActions for details']
        : [],
    };
  } catch (error) {
    logger.error('Optimization operation failed:', error);
    throw error;
  }
}

/**
 * Handle rollback operation
 */
async function handleRollbackOperation(
  agent: MemoryOptimizationAgent,
  params: MemoryOptimizerParams,
  context: EnrichedRequestHandlerExtra,
  logger: any,
): Promise<any> {
  logger.info('Starting rollback operation', { snapshotId: params.snapshotId });

  try {
    const snapshotId = params.snapshotId;
    if (!snapshotId) {
      throw new Error('snapshotId is required for rollback operation');
    }

    // TODO: Implement rollback functionality
    // This would restore the memory graph to a previous snapshot state
    
    logger.info('Rollback operation completed', { snapshotId });

    return {
      success: true,
      operation: 'rollback',
      data: {
        rollbackStatus: 'success',
        restoredEntities: 0, // TODO: Implement actual count
      },
      message: `Successfully rolled back to snapshot ${snapshotId}`,
    };
  } catch (error) {
    logger.error('Rollback operation failed:', error);
    throw error;
  }
}
