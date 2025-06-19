// External dependencies
import { generateObject } from 'ai';

// Internal services and utilities
import { BaseMemoryAgent } from '../base/base-memory-agent';
import { MemoryContextBuilder } from '../context-builder';
import { PromptManager } from '../prompt-manager';

// Type imports
import type { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import type { AnalysisResult } from '../../../schemas/optimization/types';
import type { OptimizationStrategy } from '../prompt-manager';

// Schema imports
import { AnalysisResultSchema } from '../../../schemas/optimization/types';

/**
 * Service responsible for memory graph analysis using LLM intelligence
 * Analyzes memory graphs to identify optimization opportunities
 */
export class MemoryAnalysisService extends BaseMemoryAgent {
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
   * Analyze memory graph and identify optimization opportunities
   */
  async analyzeMemory(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string = 'main',
    strategy: OptimizationStrategy = 'conservative',
  ): Promise<AnalysisResult> {
    const analysisLogger = this.createOperationLogger('analyzeMemory', {
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
        branch,
      );

      // Get additional context for analysis
      const staleEntityCandidates = await this.contextBuilder.getStaleEntityCandidates(
        mcpContext,
        clientProjectRoot,
        repository,
        branch,
        this.getStaleDaysThreshold(strategy),
      );

      const relationshipSummary = await this.contextBuilder.getRelationshipSummary(
        mcpContext,
        clientProjectRoot,
        repository,
        branch,
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
            this.config.samplingStrategy || 'representative',
          )
        : await this.promptManager.buildSystemPrompt('analyzer', strategy);

      const userPrompt = await this.promptManager.buildUserPrompt(
        'analysis',
        memoryContext,
        strategy,
        JSON.stringify({ staleEntityCandidates, relationshipSummary }),
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
}
