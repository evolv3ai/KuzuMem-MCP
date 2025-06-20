// External dependencies
import { generateObject } from 'ai';

// Internal services and utilities
import { BaseMemoryAgent } from '../base/base-memory-agent';
import { MemoryContextBuilder } from '../context-builder';
import { PromptManager } from '../prompt-manager';

// Type imports
import type { ToolHandlerContext } from '../../../mcp/types/sdk-custom';
import type { AnalysisResult, OptimizationPlan } from '../../../schemas/optimization/types';
import type { OptimizationStrategy } from '../prompt-manager';

// Schema imports
import { OptimizationPlanSchema } from '../../../schemas/optimization/types';

/**
 * Service responsible for generating optimization plans based on analysis results
 * Uses LLM intelligence to create safe, validated optimization plans
 */
export class OptimizationPlanService extends BaseMemoryAgent {
  private contextBuilder: MemoryContextBuilder;
  private promptManager: PromptManager;

  constructor(
    memoryService: any,
    config: any,
    contextBuilder: MemoryContextBuilder,
    promptManager: PromptManager,
  ) {
    super(memoryService, config);
    this.contextBuilder = contextBuilder;
    this.promptManager = promptManager;
  }

  /**
   * Generate optimization plan based on analysis results
   */
  async generateOptimizationPlan(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    analysisResult: AnalysisResult,
    strategy: OptimizationStrategy = 'conservative',
  ): Promise<OptimizationPlan> {
    const planLogger = this.createOperationLogger('generateOptimizationPlan', {
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
        branch,
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
            this.config.samplingStrategy || 'representative',
          )
        : await this.promptManager.buildSystemPrompt('optimizer', strategy);

      const userPrompt = await this.promptManager.buildUserPrompt(
        'optimization',
        memoryContext,
        strategy,
        JSON.stringify(analysisResult),
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
   * Validate optimization plan against strategy constraints
   */
  private async validateOptimizationPlan(
    plan: OptimizationPlan,
    strategy: OptimizationStrategy,
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
}
