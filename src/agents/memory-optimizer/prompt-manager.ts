import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import type { MemoryContext } from '../../schemas/optimization/types';
import { logger } from '../../utils/logger';
import type { MCPSamplingManager } from './mcp-sampling-manager';

export interface SystemPromptConfig {
  version: string;
  description: string;
  basePrompt: string;
  roles: {
    analyzer: string;
    optimizer: string;
    safety: string;
  };
  safetyRules: string[];
  contextTemplates: {
    repository: string;
    entitySummary: string;
    analysisContext: string;
    optimizationContext: string;
  };
  strategies: {
    conservative: StrategyConfig;
    balanced: StrategyConfig;
    aggressive: StrategyConfig;
  };
  outputFormats: {
    analysis: string;
    optimization: string;
    safety: string;
  };
}

export interface StrategyConfig {
  description: string;
  maxDeletions: number;
  requiresConfirmation: boolean;
  preserveRecentEntities: number;
  focusAreas: string[];
}

export type AgentRole = 'analyzer' | 'optimizer' | 'safety';
export type OptimizationStrategy = 'conservative' | 'balanced' | 'aggressive';

export class PromptManager {
  private prompts: Map<string, SystemPromptConfig> = new Map();
  private currentVersion: string = 'v1.0';

  constructor(
    private promptsDir: string = './src/prompts',
    private samplingManager?: MCPSamplingManager,
  ) {}

  /**
   * Load prompt configuration from file
   */
  async loadPromptConfig(version: string = this.currentVersion): Promise<SystemPromptConfig> {
    try {
      const configPath = path.join(this.promptsDir, version, 'system-prompts.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData) as SystemPromptConfig;

      // Validate configuration
      this.validatePromptConfig(config);

      // Cache the configuration
      this.prompts.set(version, config);

      logger.info(`[PromptManager] Loaded prompt configuration version ${version}`);
      return config;
    } catch (error) {
      logger.error(`[PromptManager] Failed to load prompt configuration ${version}:`, error);
      throw new Error(`Failed to load prompt configuration: ${error}`);
    }
  }

  /**
   * Get current prompt configuration
   */
  async getCurrentConfig(): Promise<SystemPromptConfig> {
    if (!this.prompts.has(this.currentVersion)) {
      await this.loadPromptConfig(this.currentVersion);
    }
    return this.prompts.get(this.currentVersion)!;
  }

  /**
   * Build system prompt for specific role
   */
  async buildSystemPrompt(
    role: AgentRole,
    strategy: OptimizationStrategy = 'conservative',
  ): Promise<string> {
    const config = await this.getCurrentConfig();
    const strategyConfig = config.strategies[strategy];

    const systemPrompt = [
      config.basePrompt,
      '',
      `ROLE: ${role.toUpperCase()}`,
      config.roles[role],
      '',
      'SAFETY RULES:',
      ...config.safetyRules.map((rule) => `- ${rule}`),
      '',
      `STRATEGY: ${strategy.toUpperCase()} (${strategyConfig.description})`,
      `- Max Deletions: ${strategyConfig.maxDeletions}`,
      `- Preserve Recent Entities: ${strategyConfig.preserveRecentEntities} days`,
      `- Focus Areas: ${strategyConfig.focusAreas.join(', ')}`,
      '',
      'OUTPUT FORMAT:',
      role === 'analyzer'
        ? config.outputFormats.analysis
        : role === 'optimizer'
          ? config.outputFormats.optimization
          : config.outputFormats.safety,
    ].join('\n');

    return systemPrompt;
  }

  /**
   * Build context-aware system prompt using MCP sampling
   */
  async buildContextAwareSystemPrompt(
    role: AgentRole,
    strategy: OptimizationStrategy,
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    enableSampling: boolean = true,
    samplingStrategy: 'representative' | 'problematic' | 'recent' | 'diverse' = 'representative',
  ): Promise<string> {
    try {
      // Get base prompt
      const basePrompt = await this.buildSystemPrompt(role, strategy);

      // If sampling is disabled or not available, return base prompt
      if (!enableSampling || !this.samplingManager) {
        logger.debug('[PromptManager] MCP sampling disabled or unavailable, using base prompt');
        return basePrompt;
      }

      logger.info('[PromptManager] Building context-aware prompt with MCP sampling', {
        role,
        strategy,
        repository,
        branch,
        samplingStrategy,
      });

      // Sample memory context
      const memorySample = await this.samplingManager.sampleMemoryContext(
        mcpContext,
        clientProjectRoot,
        repository,
        branch,
        samplingStrategy,
        20, // Sample size
      );

      // Build context-aware prompt
      const contextAwarePrompt = await this.samplingManager.buildContextAwarePrompt(
        role,
        strategy,
        memorySample,
        basePrompt,
      );

      logger.info('[PromptManager] Context-aware prompt built successfully', {
        sampledEntities: memorySample.entities.length,
        sampledRelationships: memorySample.relationships.length,
        samplingRatio: memorySample.metadata.samplingRatio,
      });

      return contextAwarePrompt;
    } catch (error) {
      logger.error(
        '[PromptManager] Failed to build context-aware prompt, falling back to base prompt:',
        error,
      );
      // Fallback to base prompt if sampling fails
      return await this.buildSystemPrompt(role, strategy);
    }
  }

  /**
   * Set sampling manager for context-aware prompts
   */
  setSamplingManager(samplingManager: MCPSamplingManager): void {
    this.samplingManager = samplingManager;
    logger.info('[PromptManager] MCP Sampling Manager configured');
  }

  /**
   * Build user prompt with context interpolation
   */
  async buildUserPrompt(
    type: 'analysis' | 'optimization',
    context: MemoryContext,
    strategy: OptimizationStrategy = 'conservative',
    additionalContext?: string,
  ): Promise<string> {
    const config = await this.getCurrentConfig();

    // Interpolate context templates
    const repositoryContext = this.interpolateTemplate(config.contextTemplates.repository, {
      repository: context.repository,
      branch: context.branch,
      totalEntities: context.totalEntities.toString(),
      lastOptimization: context.lastOptimization || 'Never',
    });

    const entitySummary = this.interpolateTemplate(config.contextTemplates.entitySummary, {
      components: context.entityCounts.components.toString(),
      decisions: context.entityCounts.decisions.toString(),
      rules: context.entityCounts.rules.toString(),
      files: context.entityCounts.files.toString(),
      contexts: context.entityCounts.contexts.toString(),
      tags: context.entityCounts.tags.toString(),
      relationshipCount: context.relationshipCount.toString(),
      averageEntityAge: context.averageEntityAge?.toString() || 'Unknown',
    });

    let userPrompt: string;

    if (type === 'analysis') {
      userPrompt = this.interpolateTemplate(config.contextTemplates.analysisContext, {
        repository: repositoryContext,
        entitySummary,
        focusAreas: config.strategies[strategy].focusAreas.join(', '),
        strategy: strategy,
      });
    } else {
      userPrompt = this.interpolateTemplate(config.contextTemplates.optimizationContext, {
        repository: repositoryContext,
        entitySummary,
        analysisResults: additionalContext || 'No analysis provided',
        strategy: strategy,
      });
    }

    return userPrompt;
  }

  /**
   * Get strategy configuration
   */
  async getStrategyConfig(strategy: OptimizationStrategy): Promise<StrategyConfig> {
    const config = await this.getCurrentConfig();
    return config.strategies[strategy];
  }

  /**
   * Switch to different prompt version
   */
  async switchVersion(version: string): Promise<void> {
    await this.loadPromptConfig(version);
    this.currentVersion = version;
    logger.info(`[PromptManager] Switched to prompt version ${version}`);
  }

  /**
   * List available prompt versions
   */
  async listAvailableVersions(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.promptsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('v'))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      logger.error('[PromptManager] Failed to list prompt versions:', error);
      return [];
    }
  }

  /**
   * Interpolate template variables with security validation and sanitization
   */
  private interpolateTemplate(template: string, variables: Record<string, string>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      // Validate variable key format
      if (!this.isValidVariableKey(key)) {
        logger.warn(`[PromptManager] Invalid variable key detected: ${key}`);
        continue; // Skip invalid keys
      }

      // Sanitize variable value
      const sanitizedValue = this.sanitizeVariableValue(value);

      // Validate sanitized value length
      if (sanitizedValue.length > 10000) {
        // Reasonable limit for prompt variables
        logger.warn(`[PromptManager] Variable value too long, truncating: ${key}`);
        const truncatedValue = sanitizedValue.substring(0, 10000) + '... [truncated]';
        const regex = new RegExp(`{{${this.escapeRegex(key)}}}`, 'g');
        result = result.replace(regex, truncatedValue);
      } else {
        const regex = new RegExp(`{{${this.escapeRegex(key)}}}`, 'g');
        result = result.replace(regex, sanitizedValue);
      }
    }

    return result;
  }

  /**
   * Validate variable key format (alphanumeric, underscore, hyphen only)
   */
  private isValidVariableKey(key: string): boolean {
    const validKeyPattern = /^[a-zA-Z0-9_-]+$/;
    return validKeyPattern.test(key) && key.length <= 100;
  }

  /**
   * Sanitize variable value to prevent injection attacks
   */
  private sanitizeVariableValue(value: string): string {
    if (typeof value !== 'string') {
      logger.warn(`[PromptManager] Non-string variable value detected, converting to string`);
      value = String(value);
    }

    // Remove or escape potentially dangerous patterns
    let sanitized = value
      // Remove null bytes and control characters (except newlines and tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove potential script injection patterns BEFORE HTML escaping
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT_REMOVED]')
      .replace(/javascript:/gi, 'javascript_removed:')
      .replace(/data:/gi, 'data_removed:')
      // Escape HTML/XML special characters to prevent injection
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      // Remove potential prompt injection patterns
      .replace(/\{\{.*?\}\}/g, '[TEMPLATE_VAR_REMOVED]')
      // Limit consecutive newlines to prevent prompt structure manipulation
      .replace(/\n{4,}/g, '\n\n\n');

    // Additional validation for common injection patterns
    const suspiciousPatterns = [
      /system\s*:/i,
      /assistant\s*:/i,
      /user\s*:/i,
      /human\s*:/i,
      /ai\s*:/i,
      /ignore\s+previous\s+instructions/i,
      /forget\s+everything/i,
      /new\s+instructions/i,
      /override\s+instructions/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(sanitized)) {
        logger.warn(`[PromptManager] Suspicious pattern detected in variable value, sanitizing`);
        sanitized = sanitized.replace(pattern, '[SUSPICIOUS_CONTENT_REMOVED]');
      }
    }

    return sanitized;
  }

  /**
   * Escape special regex characters in variable keys
   */
  private escapeRegex(key: string): string {
    return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validate prompt configuration
   */
  private validatePromptConfig(config: SystemPromptConfig): void {
    const requiredFields = [
      'version',
      'basePrompt',
      'roles',
      'safetyRules',
      'contextTemplates',
      'strategies',
    ];

    for (const field of requiredFields) {
      if (!(field in config)) {
        throw new Error(`Missing required field in prompt configuration: ${field}`);
      }
    }

    const requiredRoles = ['analyzer', 'optimizer', 'safety'];
    for (const role of requiredRoles) {
      if (!(role in config.roles)) {
        throw new Error(`Missing role in prompt configuration: ${role}`);
      }
    }

    const requiredStrategies = ['conservative', 'balanced', 'aggressive'];
    for (const strategy of requiredStrategies) {
      if (!(strategy in config.strategies)) {
        throw new Error(`Missing strategy in prompt configuration: ${strategy}`);
      }
    }

    logger.debug('[PromptManager] Prompt configuration validation passed');
  }
}
