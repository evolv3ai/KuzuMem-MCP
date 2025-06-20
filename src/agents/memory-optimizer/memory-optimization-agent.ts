// Internal services and utilities
import { MemoryService } from '../../services/memory.service';

// Memory optimizer components
import { MCPSamplingManager } from './mcp-sampling-manager';
import { MemoryContextBuilder } from './context-builder';
import { PromptManager } from './prompt-manager';

// Specialized services
import { BaseMemoryAgent, type MemoryOptimizationConfig } from './base/base-memory-agent';
import { MemoryAnalysisService } from './services/memory-analysis.service';
import { OptimizationPlanService } from './services/optimization-plan.service';
import { OptimizationExecutionService } from './services/optimization-execution.service';
import { SnapshotManagementService } from './services/snapshot-management.service';
import { ActionExecutorService } from './services/action-executor.service';

// Type imports
import type { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import type {
  AnalysisResult,
  OptimizationPlan,
  OptimizationResult,
} from '../../schemas/optimization/types';
import type { OptimizationStrategy } from './prompt-manager';

/**
 * Dynamic Memory Optimization Agent
 *
 * Uses LLM intelligence to analyze memory graphs and generate safe optimization plans.
 * Leverages existing KuzuMem-MCP infrastructure for data access and execution.
 *
 * This is the main orchestrator that delegates to specialized services:
 * - MemoryAnalysisService: Analyzes memory graphs
 * - OptimizationPlanService: Generates optimization plans
 * - OptimizationExecutionService: Executes plans safely
 * - SnapshotManagementService: Manages snapshots
 * - ActionExecutorService: Executes individual actions
 */
export class MemoryOptimizationAgent extends BaseMemoryAgent {
  private contextBuilder: MemoryContextBuilder;
  private promptManager: PromptManager;
  private samplingManager: MCPSamplingManager;

  // Specialized services
  private analysisService: MemoryAnalysisService;
  private planService: OptimizationPlanService;
  private executionService: OptimizationExecutionService;
  private snapshotService: SnapshotManagementService;
  private actionExecutor: ActionExecutorService;

  constructor(
    memoryService: MemoryService,
    config: Partial<MemoryOptimizationConfig> = {},
  ) {
    super(memoryService, config);

    // Initialize supporting services
    this.contextBuilder = new MemoryContextBuilder(memoryService);
    this.samplingManager = new MCPSamplingManager(memoryService);
    this.promptManager = new PromptManager('./src/prompts', this.samplingManager);

    // Configure sampling manager in prompt manager
    this.promptManager.setSamplingManager(this.samplingManager);

    // Initialize specialized services
    this.actionExecutor = new ActionExecutorService(memoryService, this.config);
    this.analysisService = new MemoryAnalysisService(
      memoryService,
      this.config,
      this.contextBuilder,
      this.promptManager,
    );
    this.planService = new OptimizationPlanService(
      memoryService,
      this.config,
      this.contextBuilder,
      this.promptManager,
    );
    this.executionService = new OptimizationExecutionService(
      memoryService,
      this.config,
      this.actionExecutor,
    );
    this.snapshotService = new SnapshotManagementService(memoryService, this.config);
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
    return this.analysisService.analyzeMemory(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      strategy,
    );
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
    strategy: OptimizationStrategy = 'conservative',
  ): Promise<OptimizationPlan> {
    return this.planService.generateOptimizationPlan(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      analysisResult,
      strategy,
    );
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
    } = {},
  ): Promise<OptimizationResult> {
    return this.executionService.executeOptimizationPlan(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      plan,
      options,
    );
  }

  /**
   * Rollback to a previous snapshot
   */
  async rollbackToSnapshot(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    snapshotId: string,
  ): Promise<{
    success: boolean;
    snapshotId: string;
    restoredEntities: number;
    restoredRelationships: number;
    rollbackTime: string;
    message: string;
  }> {
    return this.snapshotService.rollbackToSnapshot(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      snapshotId,
    );
  }

  /**
   * List available snapshots for a repository
   */
  async listSnapshots(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch?: string,
  ): Promise<any[]> {
    return this.snapshotService.listSnapshots(mcpContext, clientProjectRoot, repository, branch);
  }
}
