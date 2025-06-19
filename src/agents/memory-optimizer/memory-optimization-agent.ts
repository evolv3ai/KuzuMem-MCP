import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { MemoryService } from '../../services/memory.service';
import { MemoryContextBuilder } from './context-builder';
import { PromptManager, type AgentRole, type OptimizationStrategy } from './prompt-manager';
import { MCPSamplingManager } from './mcp-sampling-manager';
import { logger } from '../../utils/logger';
import type { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import type {
  MemoryContext,
  AnalysisResult,
  OptimizationPlan,
  OptimizationResult
} from '../../schemas/optimization/types';
import {
  AnalysisResultSchema,
  OptimizationPlanSchema
} from '../../schemas/optimization/types';

export interface MemoryOptimizationConfig {
  llmProvider: 'openai' | 'anthropic';
  model?: string;
  promptVersion?: string;
  defaultStrategy?: OptimizationStrategy;
  enableMCPSampling?: boolean;
  samplingStrategy?: 'representative' | 'problematic' | 'recent' | 'diverse';
  snapshotFailurePolicy?: 'abort' | 'continue' | 'warn';
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
  private config: MemoryOptimizationConfig;

  constructor(
    private memoryService: MemoryService,
    config: MemoryOptimizationConfig = {
      llmProvider: 'openai',
      enableMCPSampling: true,
      samplingStrategy: 'representative',
      snapshotFailurePolicy: 'warn'
    }
  ) {
    // Merge provided config with defaults
    const defaults: MemoryOptimizationConfig = {
      llmProvider: 'openai',
      enableMCPSampling: true,
      samplingStrategy: 'representative',
      snapshotFailurePolicy: 'warn',
    };
    this.config = { ...defaults, ...config };
    // Initialize LLM client based on provider
    this.llmClient = this.initializeLLMClient();

    // Initialize supporting services
    this.contextBuilder = new MemoryContextBuilder(memoryService);
    this.samplingManager = new MCPSamplingManager(memoryService);
    this.promptManager = new PromptManager('./src/prompts', this.samplingManager);

    // Configure sampling manager in prompt manager
    this.promptManager.setSamplingManager(this.samplingManager);

    this.agentLogger.info('Memory Optimization Agent initialized', {
      provider: this.config.llmProvider,
      model: this.config.model,
      mcpSampling: this.config.enableMCPSampling,
      samplingStrategy: this.config.samplingStrategy,
      snapshotFailurePolicy: this.config.snapshotFailurePolicy,
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
      snapshotFailurePolicy?: 'abort' | 'continue' | 'warn';
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

          // Determine snapshot failure policy (options override config)
          const failurePolicy = options.snapshotFailurePolicy || this.config.snapshotFailurePolicy || 'warn';

          switch (failurePolicy) {
            case 'abort':
              executeLogger.error('Aborting optimization due to snapshot failure (policy: abort)');
              throw new Error(`Optimization aborted: Failed to create snapshot - ${snapshotError}. Rollback will not be available.`);

            case 'continue':
              executeLogger.info('Continuing optimization without snapshot (policy: continue)');
              break;

            case 'warn':
            default:
              executeLogger.warn('Proceeding with optimization without snapshot - rollback will not be available (policy: warn)');
              executeLogger.warn('Consider using snapshotFailurePolicy: "abort" for production environments requiring guaranteed rollback');
              break;
          }
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
    // Always use real LLM clients since API keys are available in e2e environment
    switch (this.config.llmProvider) {
      case 'openai':
        // Use GPT-4 models that support structured outputs (JSON schema)
        // o1 models don't support structured outputs, so we use gpt-4o instead
        return openai(this.config.model || 'gpt-4o');
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
        // GPT-4o models don't support reasoning parameter, use standard configuration
        return {
          // No special reasoning config for GPT-4o
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
    const actionLogger = this.agentLogger.child({
      actionType: action.type,
      entityId: action.entityId,
      targetEntityId: action.targetEntityId,
    });

    actionLogger.info(`Executing ${action.type} action on ${action.entityId}`, {
      reason: action.reason,
      priority: action.priority,
    });

    try {
      switch (action.type) {
        case 'delete':
          await this.executeDeleteAction(mcpContext, clientProjectRoot, repository, branch, action, actionLogger);
          break;

        case 'merge':
          await this.executeMergeAction(mcpContext, clientProjectRoot, repository, branch, action, actionLogger);
          break;

        case 'update':
          await this.executeUpdateAction(mcpContext, clientProjectRoot, repository, branch, action, actionLogger);
          break;

        case 'move':
          await this.executeMoveAction(mcpContext, clientProjectRoot, repository, branch, action, actionLogger);
          break;

        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      actionLogger.info(`Successfully executed ${action.type} action on ${action.entityId}`);
    } catch (error) {
      actionLogger.error(`Failed to execute ${action.type} action on ${action.entityId}:`, error);
      throw error;
    }
  }

  /**
   * Execute delete action using MemoryService
   */
  private async executeDeleteAction(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any
  ): Promise<void> {
    const entityId = action.entityId;

    // Determine entity type from the entityId or action metadata
    const entityType = this.determineEntityType(entityId, action);

    logger.info(`Deleting ${entityType} entity: ${entityId}`);

    switch (entityType) {
      case 'component':
        await this.memoryService.deleteComponent(mcpContext, clientProjectRoot, repository, branch, entityId);
        break;
      case 'decision':
        await this.memoryService.deleteDecision(mcpContext, clientProjectRoot, repository, branch, entityId);
        break;
      case 'rule':
        await this.memoryService.deleteRule(mcpContext, clientProjectRoot, repository, branch, entityId);
        break;
      case 'file':
        await this.memoryService.deleteFile(mcpContext, clientProjectRoot, repository, branch, entityId);
        break;
      case 'context':
        await this.memoryService.deleteContext(mcpContext, clientProjectRoot, repository, branch, entityId);
        break;
      case 'tag':
        await this.memoryService.deleteTag(mcpContext, clientProjectRoot, repository, branch, entityId);
        break;
      default:
        throw new Error(`Unsupported entity type for deletion: ${entityType}`);
    }

    logger.info(`Successfully deleted ${entityType} entity: ${entityId}`);
  }

  /**
   * Execute merge action (merge source entity into target entity)
   */
  private async executeMergeAction(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any
  ): Promise<void> {
    const sourceEntityId = action.entityId;
    const targetEntityId = action.targetEntityId;

    if (!targetEntityId) {
      throw new Error(`Merge action requires targetEntityId for entity ${sourceEntityId}`);
    }

    logger.info(`Merging entity ${sourceEntityId} into ${targetEntityId}`);

    // For merge operations, we need to:
    // 1. Get the source entity data
    // 2. Merge relevant data into the target entity
    // 3. Update relationships to point to the target entity
    // 4. Delete the source entity

    const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

    // Get source entity data
    const sourceQuery = `
      MATCH (source {id: $sourceId, repository: $repository, branch: $branch})
      RETURN source, labels(source) AS sourceLabels
    `;
    const sourceResult = await kuzuClient.executeQuery(sourceQuery, {
      sourceId: sourceEntityId,
      repository,
      branch,
    });

    if (sourceResult.length === 0) {
      throw new Error(`Source entity not found: ${sourceEntityId}`);
    }

    const sourceEntity = sourceResult[0].source;
    const sourceLabels = sourceResult[0].sourceLabels;

    // Update relationships to point to target entity
    const updateRelationshipsQuery = `
      MATCH (source {id: $sourceId, repository: $repository, branch: $branch})-[r]-(other)
      MATCH (target {id: $targetId, repository: $repository, branch: $branch})
      WHERE NOT (target)-[r]-(other)
      CREATE (target)-[newR:${sourceLabels[0] === 'Component' ? 'DEPENDS_ON' : 'RELATED_TO'}]->(other)
      SET newR = properties(r)
    `;
    await kuzuClient.executeQuery(updateRelationshipsQuery, {
      sourceId: sourceEntityId,
      targetId: targetEntityId,
      repository,
      branch,
    });

    // Delete the source entity (this will also delete its relationships)
    const entityType = this.determineEntityType(sourceEntityId, action);
    await this.executeDeleteAction(mcpContext, clientProjectRoot, repository, branch,
      { ...action, type: 'delete', entityId: sourceEntityId }, logger);

    logger.info(`Successfully merged entity ${sourceEntityId} into ${targetEntityId}`);
  }

  /**
   * Execute update action (update entity properties)
   */
  private async executeUpdateAction(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any
  ): Promise<void> {
    const entityId = action.entityId;
    const updates = action.updates || {};

    logger.info(`Updating entity ${entityId}`, { updates });

    const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

    // Build update query
    const updateFields = Object.keys(updates)
      .map(key => `n.${key} = $${key}`)
      .join(', ');

    if (updateFields.length === 0) {
      logger.warn(`No updates specified for entity ${entityId}`);
      return;
    }

    const updateQuery = `
      MATCH (n {id: $entityId, repository: $repository, branch: $branch})
      SET ${updateFields}
      RETURN n
    `;

    const params = {
      entityId,
      repository,
      branch,
      ...updates,
    };

    const result = await kuzuClient.executeQuery(updateQuery, params);

    if (result.length === 0) {
      throw new Error(`Entity not found for update: ${entityId}`);
    }

    logger.info(`Successfully updated entity ${entityId}`);
  }

  /**
   * Execute move action (change entity relationships or hierarchy)
   */
  private async executeMoveAction(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any
  ): Promise<void> {
    const entityId = action.entityId;
    const targetEntityId = action.targetEntityId;

    if (!targetEntityId) {
      throw new Error(`Move action requires targetEntityId for entity ${entityId}`);
    }

    logger.info(`Moving entity ${entityId} to be related to ${targetEntityId}`);

    const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

    // Remove existing relationships of the specified type
    const removeQuery = `
      MATCH (source {id: $sourceId, repository: $repository, branch: $branch})-[r:DEPENDS_ON]-()
      DELETE r
    `;
    await kuzuClient.executeQuery(removeQuery, {
      sourceId: entityId,
      repository,
      branch,
    });

    // Create new relationship to target
    const createQuery = `
      MATCH (source {id: $sourceId, repository: $repository, branch: $branch})
      MATCH (target {id: $targetId, repository: $repository, branch: $branch})
      CREATE (source)-[:DEPENDS_ON]->(target)
    `;
    await kuzuClient.executeQuery(createQuery, {
      sourceId: entityId,
      targetId: targetEntityId,
      repository,
      branch,
    });

    logger.info(`Successfully moved entity ${entityId} to depend on ${targetEntityId}`);
  }

  /**
   * Determine entity type from entity ID or action metadata
   */
  private determineEntityType(entityId: string, action: any): string {
    // Try to determine from action metadata first
    if (action.entityType) {
      return action.entityType;
    }

    // Try to determine from entity ID prefix
    if (entityId.startsWith('comp-')) return 'component';
    if (entityId.startsWith('dec-')) return 'decision';
    if (entityId.startsWith('rule-')) return 'rule';
    if (entityId.startsWith('file-')) return 'file';
    if (entityId.startsWith('ctx-')) return 'context';
    if (entityId.startsWith('tag-')) return 'tag';

    // Default to component if we can't determine
    this.agentLogger.warn(`Could not determine entity type for ${entityId}, defaulting to component`);
    return 'component';
  }
}
