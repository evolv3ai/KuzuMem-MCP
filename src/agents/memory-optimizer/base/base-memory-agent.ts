// External dependencies
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

// Internal services and utilities
import { MemoryService } from '../../../services/memory.service';
import { logger } from '../../../utils/logger';

// Type imports
import type { OptimizationStrategy } from '../prompt-manager';

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
 * Base class for memory optimization agents
 * Provides common configuration, logging, and utility methods
 */
export abstract class BaseMemoryAgent {
  protected llmClient: any;
  protected agentLogger = logger.child({ component: 'MemoryOptimizationAgent' });
  protected config: MemoryOptimizationConfig;

  constructor(
    protected memoryService: MemoryService,
    config: Partial<MemoryOptimizationConfig> = {},
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

    this.agentLogger.info('Memory Optimization Agent initialized', {
      provider: this.config.llmProvider,
      model: this.config.model,
      mcpSampling: this.config.enableMCPSampling,
      samplingStrategy: this.config.samplingStrategy,
      snapshotFailurePolicy: this.config.snapshotFailurePolicy,
    });
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
        return anthropic(this.config.model || 'claude-sonnet-4-20250514');
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
    }
  }

  /**
   * Get reasoning configuration based on provider
   */
  protected getReasoningConfig(): any {
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
  protected getStaleDaysThreshold(strategy: OptimizationStrategy): number {
    switch (strategy) {
      case 'conservative':
        return 180; // 6 months
      case 'balanced':
        return 90; // 3 months
      case 'aggressive':
        return 30; // 1 month
      default:
        return 90;
    }
  }

  /**
   * Determine entity type from entity ID or action metadata
   */
  protected determineEntityType(entityId: string, action?: any): string {
    // Try to determine from action metadata first
    if (action?.entityType) {
      return action.entityType;
    }

    // Try to determine from entity ID prefix
    if (entityId.startsWith('comp-')) {
      return 'component';
    }
    if (entityId.startsWith('dec-')) {
      return 'decision';
    }
    if (entityId.startsWith('rule-')) {
      return 'rule';
    }
    if (entityId.startsWith('file-')) {
      return 'file';
    }
    if (entityId.startsWith('ctx-')) {
      return 'context';
    }
    if (entityId.startsWith('tag-')) {
      return 'tag';
    }

    // Default to component if we can't determine
    this.agentLogger.warn(
      `Could not determine entity type for ${entityId}, defaulting to component`,
    );
    return 'component';
  }

  /**
   * Create a child logger with operation context
   */
  protected createOperationLogger(operation: string, context: Record<string, any> = {}) {
    return this.agentLogger.child({
      operation,
      ...context,
    });
  }
}
