import { McpTool } from '../../types';

/**
 * Core Memory Optimization Tool
 *
 * Provides AI-powered memory graph optimization with advanced reasoning capabilities:
 * - Deep reasoning analysis using OpenAI o1/o3 models (HIGH reasoning) or Claude with extended thinking
 * - Intelligent analysis of memory patterns and relationships
 * - Safe, context-aware pruning and cleanup operations
 * - Stale entity detection and redundancy removal
 * - Autonomous optimization with safety guarantees
 */
export const memoryOptimizerTool: McpTool = {
  name: 'memory-optimizer',
  description: `AI-powered core memory optimization for KuzuMem-MCP graph databases with advanced reasoning.

REASONING MODELS:
- OpenAI: o3, o1-mini with HIGH reasoning settings for deep analysis
- Anthropic: Claude-3.5-Sonnet, Claude-3.5-Haiku with extended thinking (2048 token budget)

MCP SAMPLING:
- Context-aware prompts that adapt to actual memory state and project characteristics
- Sampling strategies: representative, problematic, recent, diverse
- Automatic project analysis: maturity, activity level, complexity assessment
- Adaptive optimization strategies based on real memory patterns

OPERATIONS:
- analyze: Deep reasoning analysis of memory graph patterns and optimization opportunities
- optimize: Generate and execute safe optimization plans with reasoning validation
- rollback: Rollback to previous state using snapshots
- list-snapshots: List available snapshots for a repository

CAPABILITIES:
- Advanced reasoning for stale entity detection based on complex usage patterns
- Intelligent redundancy identification with contextual understanding
- Dependency chain optimization with safety reasoning
- Context-aware pruning that preserves critical knowledge through deep analysis
- Safety-first approach with reasoning-validated decisions

STRATEGIES:
- conservative: Minimal risk, obvious optimizations only (max 5 deletions)
- balanced: Moderate optimization balancing safety and efficiency (max 20 deletions)
- aggressive: Maximum optimization for significant gains (max 50 deletions)

SAFETY FEATURES:
- Reasoning-validated optimization decisions
- Dry-run mode for preview without changes
- Automatic snapshots before optimization
- Confirmation requirements for bulk operations
- Rollback capabilities for error recovery
- Preservation of critical and recent entities

The agent uses advanced reasoning to analyze entity relationships, usage patterns, and temporal data to make highly intelligent decisions about what can be safely optimized while preserving important knowledge and maintaining system integrity.`,

  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['analyze', 'optimize', 'rollback', 'list-snapshots'],
        description:
          'Operation to perform: analyze (identify opportunities), optimize (execute plan), rollback (restore snapshot), list-snapshots (show available snapshots)',
      },
      clientProjectRoot: {
        type: 'string',
        description: 'Absolute path to the client project root directory',
      },
      repository: {
        type: 'string',
        description: 'Repository name to optimize',
      },
      branch: {
        type: 'string',
        description: 'Git branch name to optimize (default: main)',
      },
      strategy: {
        type: 'string',
        enum: ['conservative', 'balanced', 'aggressive'],
        description:
          'Optimization strategy determining risk tolerance and scope (default: conservative)',
      },
      llmProvider: {
        type: 'string',
        enum: ['openai', 'anthropic'],
        description: 'LLM provider for analysis and optimization (default: openai)',
      },
      model: {
        type: 'string',
        description:
          'Specific model to use. OpenAI: o3, o1-mini (with HIGH reasoning). Anthropic: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022 (with extended thinking, 2048 token budget)',
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview optimization without making changes (default: true)',
      },
      confirm: {
        type: 'boolean',
        description:
          'Confirm execution of optimization plan (required for non-dry-run, default: false)',
      },
      maxDeletions: {
        type: 'number',
        description:
          'Maximum number of entities to delete (overrides strategy default, range: 1-100)',
      },
      focusAreas: {
        type: 'array',
        description:
          'Specific areas to focus optimization on (stale-detection, redundancy-removal, relationship-cleanup, dependency-optimization, tag-consolidation, orphan-removal)',
      },
      preserveCategories: {
        type: 'array',
        description: 'Entity categories to preserve (e.g., critical-decisions, active-components)',
      },
      snapshotId: {
        type: 'string',
        description: 'Snapshot ID for rollback operation',
      },
      analysisId: {
        type: 'string',
        description: 'Analysis ID to use for optimization (from previous analyze operation)',
      },
      enableMCPSampling: {
        type: 'boolean',
        description: 'Enable MCP sampling for context-aware prompts (default: true)',
      },
      samplingStrategy: {
        type: 'string',
        enum: ['representative', 'problematic', 'recent', 'diverse'],
        description:
          'MCP sampling strategy: representative (balanced sample), problematic (stale/disconnected), recent (new entities), diverse (all types)',
      },
      snapshotFailurePolicy: {
        type: 'string',
        enum: ['abort', 'continue', 'warn'],
        description:
          'Snapshot failure policy: abort (stop on snapshot failure), continue (proceed silently), warn (proceed with warning)',
      },
    },
    required: ['operation', 'clientProjectRoot', 'repository'],
  },

  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation succeeded',
      },
      operation: {
        type: 'string',
        description: 'Operation that was performed',
      },
      data: {
        type: 'object',
        description: 'Operation-specific result data',
      },
      message: {
        type: 'string',
        description: 'Human-readable result message',
      },
      warnings: {
        type: 'array',
        description: 'Warning messages about the operation',
      },
      errors: {
        type: 'array',
        description: 'Error messages if operation failed',
      },
    },
  },

  annotations: {
    title: 'AI Memory Optimization',
    readOnlyHint: false,
    destructiveHint: true, // Can delete entities
    idempotentHint: false, // Results may vary based on current state
    openWorldHint: false,
  },
};
