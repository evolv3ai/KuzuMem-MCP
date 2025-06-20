import { z } from 'zod';
import { MemoryOptimizationAgent } from '../../../../agents/memory-optimizer/memory-optimization-agent';
import type { OptimizationStrategy } from '../../../../agents/memory-optimizer/prompt-manager';
import { MemoryService } from '../../../../services/memory.service';
import { logger } from '../../../../utils/logger';
import type { EnrichedRequestHandlerExtra } from '../../../types/sdk-custom';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// Input schema for memory optimizer tool
const MemoryOptimizerInputSchema = z.object({
  operation: z.enum(['analyze', 'optimize', 'rollback', 'list-snapshots']),
  clientProjectRoot: z.string(),
  repository: z.string(),
  branch: z.string().default('main'),
  strategy: z.enum(['conservative', 'balanced', 'aggressive']).default('conservative'),
  llmProvider: z.enum(['openai', 'anthropic']).default('openai'),
  model: z.string().optional(),
  dryRun: z.boolean().default(true),
  confirm: z.boolean().default(false),
  maxDeletions: z.number().min(1).max(100).optional(),
  focusAreas: z
    .array(
      z.enum([
        'stale-detection',
        'redundancy-removal',
        'relationship-cleanup',
        'dependency-optimization',
        'tag-consolidation',
        'orphan-removal',
      ]),
    )
    .optional(),
  preserveCategories: z.array(z.string()).optional(),
  snapshotId: z.string().optional(),
  analysisId: z.string().optional(),
  enableMCPSampling: z.boolean().default(true),
  samplingStrategy: z
    .enum(['representative', 'problematic', 'recent', 'diverse'])
    .default('representative'),
  snapshotFailurePolicy: z.enum(['abort', 'continue', 'warn']).default('warn'),
});

type MemoryOptimizerParams = z.infer<typeof MemoryOptimizerInputSchema>;

// Cache for analysis results to enable multi-step workflows
const analysisCache = new Map<string, any>();

/**
 * Handler for memory optimizer tool operations
 *
 * @param params - Tool parameters (typed as any due to MCP signature requirements)
 * @param params.operation - Operation type: 'analyze' | 'optimize' | 'rollback' | 'list-snapshots'
 * @param params.repository - Repository name for memory operations
 * @param params.branch - Branch name for memory operations
 * @param params.clientProjectRoot - Optional client project root path
 * @param params.strategy - Optimization strategy: 'conservative' | 'balanced' | 'aggressive'
 * @param params.llmProvider - LLM provider: 'openai' | 'anthropic'
 * @param params.model - Model name (e.g., 'o1-mini', 'claude-3-5-sonnet')
 * @param params.dryRun - Whether to perform dry run (preview only)
 * @param params.confirm - Confirmation for actual optimization
 * @param params.analysisId - Analysis ID for optimization (from previous analyze)
 * @param params.snapshotId - Snapshot ID for rollback operation
 * @param params.enableMCPSampling - Enable MCP sampling for context-aware prompts
 * @param params.samplingStrategy - MCP sampling strategy: 'representative' | 'problematic' | 'recent' | 'diverse'
 *
 * @param context - MCP request context (typed as any due to MCP signature requirements)
 * @param context.session - Session information with clientProjectRoot, repository, branch
 * @param context.requestId - Unique request identifier
 * @param context.timestamp - Request timestamp
 *
 * @returns Promise<any> - Tool execution result with success, operation, data, message, warnings
 */
export async function memoryOptimizerHandler(params: any, context: any): Promise<any> {
  // Internal type assertions for better type safety and IntelliSense
  const typedParams = params as {
    operation: 'analyze' | 'optimize' | 'rollback' | 'list-snapshots';
    repository: string;
    branch: string;
    clientProjectRoot?: string;
    strategy?: 'conservative' | 'balanced' | 'aggressive';
    llmProvider?: 'openai' | 'anthropic';
    model?: string;
    dryRun?: boolean;
    confirm?: boolean;
    analysisId?: string;
    snapshotId?: string;
    enableMCPSampling?: boolean;
    samplingStrategy?: 'representative' | 'problematic' | 'recent' | 'diverse';
  };

  const typedContext = context as {
    session: {
      clientProjectRoot?: string;
      repository?: string;
      branch?: string;
    };
    requestId: string;
    timestamp: string;
  };

  const memoryService = await MemoryService.getInstance();
  const handlerLogger = logger.child({
    tool: 'memory-optimizer',
    operation: typedParams.operation,
    repository: typedParams.repository,
    branch: typedParams.branch,
  });

  try {
    // Validate input parameters using Zod schema
    const validatedParams = MemoryOptimizerInputSchema.parse(params);

    // Validate session and get clientProjectRoot
    const clientProjectRoot =
      validatedParams.clientProjectRoot || validateSession(context, 'memory-optimizer');

    // Update session context
    context.session.clientProjectRoot = clientProjectRoot;
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
      enableMCPSampling: validatedParams.enableMCPSampling,
      samplingStrategy: validatedParams.samplingStrategy,
      snapshotFailurePolicy: validatedParams.snapshotFailurePolicy,
    });

    // Route to appropriate operation handler
    switch (validatedParams.operation) {
      case 'analyze':
        return await handleAnalyzeOperation(
          agent,
          validatedParams,
          context as EnrichedRequestHandlerExtra,
          handlerLogger,
        );

      case 'optimize':
        return await handleOptimizeOperation(
          agent,
          validatedParams,
          context as EnrichedRequestHandlerExtra,
          handlerLogger,
        );

      case 'rollback':
        return await handleRollbackOperation(
          agent,
          validatedParams,
          context as EnrichedRequestHandlerExtra,
          handlerLogger,
        );

      case 'list-snapshots':
        return await handleListSnapshotsOperation(
          agent,
          validatedParams,
          context as EnrichedRequestHandlerExtra,
          handlerLogger,
        );

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
 *
 * @param agent - Memory optimization agent instance
 * @param params - Validated memory optimizer parameters
 * @param context - Enriched request handler context
 * @param logger - Logger instance for operation tracking
 * @returns Promise<any> - Analysis result with analysisId, summary, entities, recommendations
 */
async function handleAnalyzeOperation(
  agent: MemoryOptimizationAgent,
  params: MemoryOptimizerParams,
  context: EnrichedRequestHandlerExtra,
  logger: any,
): Promise<any> {
  // Internal type assertion for logger
  const typedLogger = logger as {
    info: (message: string, meta?: any) => void;
    error: (message: string, error?: any) => void;
  };
  typedLogger.info('Starting memory analysis operation');

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

    typedLogger.info('Memory analysis completed successfully', {
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
      warnings:
        analysisResult.riskAssessment.overallRisk === 'high'
          ? ['High risk detected - proceed with caution and use conservative strategy']
          : [],
    };
  } catch (error) {
    typedLogger.error('Memory analysis failed:', error);
    throw error;
  }
}

/**
 * Handle optimization operation
 *
 * @param agent - Memory optimization agent instance
 * @param params - Validated memory optimizer parameters
 * @param context - Enriched request handler context
 * @param logger - Logger instance for operation tracking
 * @returns Promise<any> - Optimization result with planId, status, actions, summary, snapshotId
 */
async function handleOptimizeOperation(
  agent: MemoryOptimizationAgent,
  params: MemoryOptimizerParams,
  context: EnrichedRequestHandlerExtra,
  logger: any,
): Promise<any> {
  // Internal type assertion for logger
  const typedLogger = logger as {
    info: (message: string, meta?: any) => void;
    error: (message: string, error?: any) => void;
  };

  typedLogger.info('Starting optimization operation', {
    dryRun: params.dryRun,
    confirm: params.confirm,
  });

  try {
    // Get analysis results (either from cache or perform new analysis)
    let analysisResult;
    if (params.analysisId && analysisCache.has(params.analysisId)) {
      analysisResult = analysisCache.get(params.analysisId);
      typedLogger.info('Using cached analysis results', { analysisId: params.analysisId });
    } else {
      typedLogger.info('No cached analysis found, performing new analysis');
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
        createSnapshot: !params.dryRun, // Only create snapshot for actual runs
        snapshotFailurePolicy: params.snapshotFailurePolicy,
      },
    );

    typedLogger.info('Optimization operation completed', {
      planId: optimizationResult.planId,
      status: optimizationResult.status,
      entitiesAffected:
        optimizationResult.summary.entitiesDeleted +
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
      warnings:
        optimizationResult.status === 'partial'
          ? ['Some optimization actions failed - check executedActions for details']
          : [],
    };
  } catch (error) {
    typedLogger.error('Optimization operation failed:', error);
    throw error;
  }
}

/**
 * Handle rollback operation
 *
 * @param agent - Memory optimization agent instance
 * @param params - Validated memory optimizer parameters
 * @param context - Enriched request handler context
 * @param logger - Logger instance for operation tracking
 * @returns Promise<any> - Rollback result with status, restored counts, rollback time
 */
async function handleRollbackOperation(
  agent: MemoryOptimizationAgent,
  params: MemoryOptimizerParams,
  context: EnrichedRequestHandlerExtra,
  logger: any,
): Promise<any> {
  // Internal type assertion for logger
  const typedLogger = logger as {
    info: (message: string, meta?: any) => void;
    error: (message: string, error?: any) => void;
  };

  typedLogger.info('Starting rollback operation', { snapshotId: params.snapshotId });

  try {
    const snapshotId = params.snapshotId;
    if (!snapshotId) {
      throw new Error('snapshotId is required for rollback operation');
    }

    // Execute rollback using the agent
    const rollbackResult = await agent.rollbackToSnapshot(
      context,
      params.clientProjectRoot,
      params.repository,
      params.branch,
      snapshotId,
    );

    typedLogger.info('Rollback operation completed', {
      snapshotId,
      restoredEntities: rollbackResult.restoredEntities,
      restoredRelationships: rollbackResult.restoredRelationships,
    });

    return {
      success: rollbackResult.success,
      operation: 'rollback',
      data: {
        rollbackStatus: rollbackResult.success ? 'success' : 'failed',
        restoredEntities: rollbackResult.restoredEntities,
        restoredRelationships: rollbackResult.restoredRelationships,
        rollbackTime: rollbackResult.rollbackTime,
        snapshotId: rollbackResult.snapshotId,
      },
      message: rollbackResult.message,
    };
  } catch (error) {
    typedLogger.error('Rollback operation failed:', error);
    throw error;
  }
}

/**
 * Handle list snapshots operation
 *
 * @param agent - Memory optimization agent instance
 * @param params - Validated memory optimizer parameters
 * @param context - Enriched request handler context
 * @param logger - Logger instance for operation tracking
 * @returns Promise<any> - Snapshots list with count, repository, branch information
 */
async function handleListSnapshotsOperation(
  agent: MemoryOptimizationAgent,
  params: MemoryOptimizerParams,
  context: EnrichedRequestHandlerExtra,
  logger: any,
): Promise<any> {
  // Internal type assertion for logger
  const typedLogger = logger as {
    info: (message: string, meta?: any) => void;
    error: (message: string, error?: any) => void;
  };

  typedLogger.info('Starting list snapshots operation', {
    repository: params.repository,
    branch: params.branch,
  });

  try {
    // List snapshots using the agent
    const snapshots = await agent.listSnapshots(
      context,
      params.clientProjectRoot,
      params.repository,
      params.branch,
    );

    typedLogger.info('List snapshots operation completed', {
      snapshotCount: snapshots.length,
    });

    return {
      success: true,
      operation: 'list-snapshots',
      data: {
        snapshots,
        count: snapshots.length,
        repository: params.repository,
        branch: params.branch,
      },
      message: `Found ${snapshots.length} snapshots for ${params.repository}${params.branch ? `:${params.branch}` : ''}`,
    };
  } catch (error) {
    typedLogger.error('List snapshots operation failed:', error);
    throw error;
  }
}
