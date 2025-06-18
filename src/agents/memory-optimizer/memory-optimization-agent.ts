import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { MemoryService } from '../../services/memory.service.js';
import { MemoryContextBuilder } from './context-builder.js';
import { PromptManager, type AgentRole, type OptimizationStrategy } from './prompt-manager.js';
import { MCPSamplingManager } from './mcp-sampling-manager.js';
import { logger } from '../../utils/logger.js';
import type { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom.js';
import type {
  MemoryContext,
  AnalysisResult,
  OptimizationPlan,
  OptimizationResult
} from '../../schemas/optimization/types.js';
import {
  AnalysisResultSchema,
  OptimizationPlanSchema
} from '../../schemas/optimization/types.js';

export interface MemoryOptimizationConfig {
  llmProvider: 'openai' | 'anthropic';
  model?: string;
  promptVersion?: string;
  defaultStrategy?: OptimizationStrategy;
  enableMCPSampling?: boolean;
  samplingStrategy?: 'representative' | 'problematic' | 'recent' | 'diverse';
}

/**
 * Dynamic Memory Optimization Agent
 * 
 * Uses LLM intelligence to analyze memory graphs and generate safe optimization plans.
 * Leverages existing KuzuMem-MCP infrastructure for data access and execution.
 */
export class MemoryOptimizationAgent {
  private llmClient: any;
  private contextBuilder: MemoryContextBuilder;
  private promptManager: PromptManager;
  private samplingManager: MCPSamplingManager;
  private agentLogger = logger.child({ component: 'MemoryOptimizationAgent' });

  constructor(
    private memoryService: MemoryService,
    private config: MemoryOptimizationConfig = {
      llmProvider: 'openai',
      enableMCPSampling: true,
      samplingStrategy: 'representative'
    }
  ) {
    // Initialize LLM client based on provider
    this.llmClient = this.initializeLLMClient();

    // Initialize supporting services
    this.contextBuilder = new MemoryContextBuilder(memoryService);
    this.samplingManager = new MCPSamplingManager(memoryService);
    this.promptManager = new PromptManager('./src/prompts', this.samplingManager);

    // Configure sampling manager in prompt manager
    this.promptManager.setSamplingManager(this.samplingManager);

    this.agentLogger.info('Memory Optimization Agent initialized', {
      provider: config.llmProvider,
      model: config.model,
      mcpSampling: config.enableMCPSampling,
      samplingStrategy: config.samplingStrategy,
    });
  }

  /**
   * Analyze memory graph and identify optimization opportunities
   */
  async analyzeMemory(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string = 'main',
    strategy: OptimizationStrategy = 'conservative'
  ): Promise<AnalysisResult> {
    const analysisLogger = this.agentLogger.child({
      operation: 'analyzeMemory',
      repository,
      branch,
      strategy,
    });

    try {
      analysisLogger.info('Starting memory analysis');

      // Build comprehensive memory context
      const memoryContext = await this.contextBuilder.buildMemoryContext(
        mcpContext,
        clientProjectRoot,
        repository,
        branch
      );

      // Get additional context for analysis
      const staleEntityCandidates = await this.contextBuilder.getStaleEntityCandidates(
        mcpContext,
        clientProjectRoot,
        repository,
        branch,
        this.getStaleDaysThreshold(strategy)
      );

      const relationshipSummary = await this.contextBuilder.getRelationshipSummary(
        mcpContext,
        clientProjectRoot,
        repository,
        branch
      );

      // Build prompts for LLM analysis (with optional MCP sampling)
      const systemPrompt = this.config.enableMCPSampling
        ? await this.promptManager.buildContextAwareSystemPrompt(
            'analyzer',
            strategy,
            mcpContext,
            clientProjectRoot,
            repository,
            branch,
            true,
            this.config.samplingStrategy || 'representative'
          )
        : await this.promptManager.buildSystemPrompt('analyzer', strategy);

      const userPrompt = await this.promptManager.buildUserPrompt(
        'analysis',
        memoryContext,
        strategy,
        JSON.stringify({ staleEntityCandidates, relationshipSummary })
      );

      analysisLogger.debug('Sending analysis request to LLM', {
        totalEntities: memoryContext.totalEntities,
        staleCandidates: staleEntityCandidates.length,
      });

      // Generate analysis using LLM with reasoning configuration
      const result = await generateObject({
        model: this.llmClient,
        system: systemPrompt,
        prompt: userPrompt,
        schema: AnalysisResultSchema,
        temperature: 0.1, // Low temperature for consistent analysis
        ...this.getReasoningConfig(),
      });

      const analysisResult = result.object as AnalysisResult;

      analysisLogger.info('Memory analysis completed', {
        staleEntitiesFound: analysisResult.staleEntities.length,
        redundancyGroupsFound: analysisResult.redundancies.length,
        optimizationOpportunities: analysisResult.optimizationOpportunities.length,
        overallHealthScore: analysisResult.summary.overallHealthScore,
      });

      return analysisResult;
    } catch (error) {
      analysisLogger.error('Memory analysis failed:', error);
      throw new Error(`Memory analysis failed: ${error}`);
    }
  }

  /**
   * Generate optimization plan based on analysis results
   */
  async generateOptimizationPlan(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    analysisResult: AnalysisResult,
    strategy: OptimizationStrategy = 'conservative'
  ): Promise<OptimizationPlan> {
    const planLogger = this.agentLogger.child({
      operation: 'generateOptimizationPlan',
      repository,
      branch,
      strategy,
    });

    try {
      planLogger.info('Generating optimization plan');

      // Build memory context for plan generation
      const memoryContext = await this.contextBuilder.buildMemoryContext(
        mcpContext,
        clientProjectRoot,
        repository,
        branch
      );

      // Build prompts for optimization planning (with optional MCP sampling)
      const systemPrompt = this.config.enableMCPSampling
        ? await this.promptManager.buildContextAwareSystemPrompt(
            'optimizer',
            strategy,
            mcpContext,
            clientProjectRoot,
            repository,
            branch,
            true,
            this.config.samplingStrategy || 'representative'
          )
        : await this.promptManager.buildSystemPrompt('optimizer', strategy);

      const userPrompt = await this.promptManager.buildUserPrompt(
        'optimization',
        memoryContext,
        strategy,
        JSON.stringify(analysisResult)
      );

      planLogger.debug('Sending optimization request to LLM', {
        staleEntities: analysisResult.staleEntities.length,
        redundancies: analysisResult.redundancies.length,
      });

      // Generate optimization plan using LLM with reasoning configuration
      const result = await generateObject({
        model: this.llmClient,
        system: systemPrompt,
        prompt: userPrompt,
        schema: OptimizationPlanSchema,
        temperature: 0.1, // Low temperature for consistent planning
        ...this.getReasoningConfig(),
      });

      const optimizationPlan = result.object as OptimizationPlan;

      // Validate plan against strategy constraints
      const validatedPlan = await this.validateOptimizationPlan(optimizationPlan, strategy);

      planLogger.info('Optimization plan generated', {
        planId: validatedPlan.id,
        totalActions: validatedPlan.actions.length,
        entitiesAffected: validatedPlan.estimatedImpact.entitiesAffected,
      });

      return validatedPlan;
    } catch (error) {
      planLogger.error('Optimization plan generation failed:', error);
      throw new Error(`Optimization plan generation failed: ${error}`);
    }
  }

  /**
   * Execute optimization plan safely
   */
  async executeOptimizationPlan(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    plan: OptimizationPlan,
    options: {
      dryRun?: boolean;
      requireConfirmation?: boolean;
      createSnapshot?: boolean;
    } = {}
  ): Promise<OptimizationResult> {
    const executeLogger = this.agentLogger.child({
      operation: 'executeOptimizationPlan',
      planId: plan.id,
      repository,
      branch,
      dryRun: options.dryRun,
    });

    try {
      executeLogger.info('Executing optimization plan', {
        totalActions: plan.actions.length,
        dryRun: options.dryRun,
        createSnapshot: options.createSnapshot,
      });

      // Create snapshot before optimization (if not dry run)
      let snapshotId: string | undefined;
      if (!options.dryRun && options.createSnapshot !== false) {
        try {
          const snapshotService = await this.memoryService.getSnapshotService(mcpContext, clientProjectRoot);
          const snapshotResult = await snapshotService.createSnapshot(
            repository,
            branch,
            `Pre-optimization snapshot for plan ${plan.id}`
          );
          snapshotId = snapshotResult.snapshotId;

          executeLogger.info('Created pre-optimization snapshot', {
            snapshotId,
            entitiesCount: snapshotResult.entitiesCount,
            relationshipsCount: snapshotResult.relationshipsCount,
          });
        } catch (snapshotError) {
          executeLogger.error('Failed to create snapshot:', snapshotError);
          // Continue without snapshot but log the warning
          executeLogger.warn('Proceeding with optimization without snapshot - rollback will not be available');
        }
      }

      const executedActions: OptimizationResult['executedActions'] = [];
      let entitiesDeleted = 0;
      let entitiesMerged = 0;
      let entitiesUpdated = 0;

      // Execute actions in the specified order
      for (const actionId of plan.executionOrder) {
        const action = plan.actions.find(a => a.entityId === actionId);
        if (!action) {
          executeLogger.warn(`Action not found: ${actionId}`);
          continue;
        }

        try {
          if (options.dryRun) {
            executeLogger.info(`DRY RUN: Would execute ${action.type} on ${action.entityId}`);
            executedActions.push({
              actionId: action.entityId,
              status: 'success',
            });
          } else {
            // Execute actual action using existing MemoryService methods
            await this.executeAction(mcpContext, clientProjectRoot, repository, branch, action);
            
            executedActions.push({
              actionId: action.entityId,
              status: 'success',
            });

            // Update counters
            switch (action.type) {
              case 'delete':
                entitiesDeleted++;
                break;
              case 'merge':
                entitiesMerged++;
                break;
              case 'update':
                entitiesUpdated++;
                break;
            }
          }
        } catch (error) {
          executeLogger.error(`Failed to execute action ${action.entityId}:`, error);
          executedActions.push({
            actionId: action.entityId,
            status: 'failed',
            error: String(error),
          });
        }
      }

      const result: OptimizationResult = {
        planId: plan.id,
        status: executedActions.every(a => a.status === 'success') ? 'success' : 'partial',
        executedActions,
        summary: {
          entitiesDeleted,
          entitiesMerged,
          entitiesUpdated,
        },
        snapshotId,
      };

      executeLogger.info('Optimization plan execution completed', {
        status: result.status,
        entitiesDeleted,
        entitiesMerged,
        entitiesUpdated,
      });

      return result;
    } catch (error) {
      executeLogger.error('Optimization plan execution failed:', error);
      throw new Error(`Optimization plan execution failed: ${error}`);
    }
  }

  /**
   * Rollback to a previous snapshot
   */
  async rollbackToSnapshot(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    snapshotId: string
  ): Promise<{
    success: boolean;
    snapshotId: string;
    restoredEntities: number;
    restoredRelationships: number;
    rollbackTime: string;
    message: string;
  }> {
    const rollbackLogger = this.agentLogger.child({
      operation: 'rollbackToSnapshot',
      snapshotId,
      repository,
      branch,
    });

    try {
      rollbackLogger.info('Starting rollback to snapshot');

      // Get snapshot service
      const snapshotService = await this.memoryService.getSnapshotService(mcpContext, clientProjectRoot);

      // Validate snapshot before rollback
      const validation = await snapshotService.validateSnapshot(snapshotId);
      if (!validation.valid) {
        throw new Error(`Snapshot validation failed: ${validation.issues.join(', ')}`);
      }

      rollbackLogger.info('Snapshot validation passed, executing rollback', {
        entityCount: validation.entityCount,
        relationshipCount: validation.relationshipCount,
      });

      // Execute rollback
      const rollbackResult = await snapshotService.rollbackToSnapshot(snapshotId);

      rollbackLogger.info('Rollback completed successfully', {
        restoredEntities: rollbackResult.restoredEntities,
        restoredRelationships: rollbackResult.restoredRelationships,
      });

      return {
        success: rollbackResult.success,
        snapshotId: rollbackResult.snapshotId,
        restoredEntities: rollbackResult.restoredEntities,
        restoredRelationships: rollbackResult.restoredRelationships,
        rollbackTime: rollbackResult.rollbackTime,
        message: `Successfully rolled back to snapshot ${snapshotId}. Restored ${rollbackResult.restoredEntities} entities and ${rollbackResult.restoredRelationships} relationships.`,
      };
    } catch (error) {
      rollbackLogger.error('Rollback failed:', error);
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * List available snapshots for a repository
   */
  async listSnapshots(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch?: string
  ): Promise<any[]> {
    try {
      const snapshotService = await this.memoryService.getSnapshotService(mcpContext, clientProjectRoot);
      return await snapshotService.listSnapshots(repository, branch);
    } catch (error) {
      this.agentLogger.error('Failed to list snapshots:', error);
      throw new Error(`Failed to list snapshots: ${error}`);
    }
  }

  /**
   * Initialize LLM client based on configuration
   */
  private initializeLLMClient(): any {
    switch (this.config.llmProvider) {
      case 'openai':
        // Use latest reasoning models with HIGH reasoning settings
        return openai(this.config.model || 'o1-mini');
      case 'anthropic':
        // Use latest Claude models with extended thinking
        return anthropic(this.config.model || 'claude-3-5-sonnet-20241022');
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
    }
  }

  /**
   * Get reasoning configuration based on provider
   */
  private getReasoningConfig(): any {
    switch (this.config.llmProvider) {
      case 'openai':
        // OpenAI o1/o3 models with HIGH reasoning
        return {
          reasoning: 'high', // HIGH reasoning setting for o1/o3 models
          maxReasoningTokens: 32768, // Maximum reasoning tokens for complex analysis
        };
      case 'anthropic':
        // Claude models with extended thinking (2048 token budget)
        return {
          thinking: {
            enabled: true,
            maxTokens: 2048, // 2048 token thinking budget
          },
        };
      default:
        return {};
    }
  }

  /**
   * Get stale days threshold based on strategy
   */
  private getStaleDaysThreshold(strategy: OptimizationStrategy): number {
    switch (strategy) {
      case 'conservative':
        return 180; // 6 months
      case 'balanced':
        return 90;  // 3 months
      case 'aggressive':
        return 30;  // 1 month
      default:
        return 90;
    }
  }

  /**
   * Validate optimization plan against strategy constraints
   */
  private async validateOptimizationPlan(
    plan: OptimizationPlan,
    strategy: OptimizationStrategy
  ): Promise<OptimizationPlan> {
    const strategyConfig = await this.promptManager.getStrategyConfig(strategy);
    
    // Limit actions based on strategy
    if (plan.actions.length > strategyConfig.maxDeletions) {
      plan.actions = plan.actions.slice(0, strategyConfig.maxDeletions);
      plan.estimatedImpact.entitiesAffected = plan.actions.length;
    }

    // Ensure confirmation is required for strategy
    if (strategyConfig.requiresConfirmation) {
      plan.safetyMeasures.confirmationRequired = true;
    }

    return plan;
  }

  /**
   * Execute individual optimization action
   */
  private async executeAction(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any
  ): Promise<void> {
    // TODO: Implement actual action execution using existing MemoryService methods
    // This would use the delete tool we already implemented
    this.agentLogger.info(`Executing ${action.type} action on ${action.entityId}`);
  }
}
