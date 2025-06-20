// Internal services and utilities
import { BaseMemoryAgent } from '../base/base-memory-agent';
import { ActionExecutorService } from './action-executor.service';

// Type imports
import type { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import type {
  OptimizationPlan,
  OptimizationResult,
} from '../../../schemas/optimization/types';

/**
 * Service responsible for executing optimization plans safely
 * Coordinates action execution, snapshot management, and result tracking
 */
export class OptimizationExecutionService extends BaseMemoryAgent {
  private actionExecutor: ActionExecutorService;

  constructor(
    memoryService: any,
    config: any,
    actionExecutor: ActionExecutorService,
  ) {
    super(memoryService, config);
    this.actionExecutor = actionExecutor;
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
    const executeLogger = this.createOperationLogger('executeOptimizationPlan', {
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
        snapshotId = await this.createPreOptimizationSnapshot(
          mcpContext,
          clientProjectRoot,
          repository,
          branch,
          plan.id,
          options.snapshotFailurePolicy,
          executeLogger,
        );
      }

      const executedActions: OptimizationResult['executedActions'] = [];
      let entitiesDeleted = 0;
      let entitiesMerged = 0;
      let entitiesUpdated = 0;

      // Execute actions in the specified order
      for (const actionId of plan.executionOrder) {
        const action = plan.actions.find((a) => a.entityId === actionId);

        if (!action) {
          executeLogger.warn(`Action not found in plan: ${actionId}`);
          continue;
        }

        const actionContext = {
          actionId: action.entityId,
          actionType: action.type,
          targetEntityId: action.targetEntityId,
          reason: action.reason,
        };

        try {
          if (options.dryRun) {
            // Dry run execution path
            executeLogger.info(
              `DRY RUN: Would execute ${action.type} on ${action.entityId}`,
              actionContext,
            );

            this.recordSuccessfulAction(executedActions, action.entityId);
          } else {
            // Actual execution path
            executeLogger.debug(
              `Executing ${action.type} action on ${action.entityId}`,
              actionContext,
            );

            await this.actionExecutor.executeAction(
              mcpContext,
              clientProjectRoot,
              repository,
              branch,
              action,
            );

            this.recordSuccessfulAction(executedActions, action.entityId);

            const counters = { entitiesDeleted, entitiesMerged, entitiesUpdated };
            this.updateActionCounters(action.type, counters);
            entitiesDeleted = counters.entitiesDeleted;
            entitiesMerged = counters.entitiesMerged;
            entitiesUpdated = counters.entitiesUpdated;

            executeLogger.info(
              `Successfully executed ${action.type} action on ${action.entityId}`,
              actionContext,
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          executeLogger.error(`Failed to execute ${action.type} action on ${action.entityId}`, {
            ...actionContext,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
          });

          this.recordFailedAction(executedActions, action.entityId, errorMessage);
        }
      }

      const result: OptimizationResult = {
        planId: plan.id,
        status: executedActions.every((a) => a.status === 'success') ? 'success' : 'partial',
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
      executeLogger.error('Optimization plan execution failed', error);
      throw new Error(`Optimization plan execution failed: ${error}`);
    }
  }

  /**
   * Create pre-optimization snapshot
   */
  private async createPreOptimizationSnapshot(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    planId: string,
    snapshotFailurePolicy: string | undefined,
    logger: any,
  ): Promise<string | undefined> {
    try {
      const snapshotService = await this.memoryService.getSnapshotService(
        mcpContext,
        clientProjectRoot,
      );

      const snapshotResult = await snapshotService.createSnapshot(
        repository,
        branch,
        `Pre-optimization snapshot for plan ${planId}`,
      );

      const snapshotId = snapshotResult.snapshotId;

      logger.info('Created pre-optimization snapshot', {
        snapshotId,
        entitiesCount: snapshotResult.entitiesCount,
        relationshipsCount: snapshotResult.relationshipsCount,
      });

      return snapshotId;
    } catch (snapshotError) {
      logger.error('Failed to create snapshot:', snapshotError);

      // Determine snapshot failure policy (options override config)
      const failurePolicy = snapshotFailurePolicy || this.config.snapshotFailurePolicy || 'warn';

      switch (failurePolicy) {
        case 'abort':
          logger.error('Aborting optimization due to snapshot failure (policy: abort)');

          throw new Error(
            `Optimization aborted: Failed to create snapshot - ${snapshotError}. ` +
              'Rollback will not be available.',
          );

        case 'continue':
          logger.info('Continuing optimization without snapshot (policy: continue)');
          break;

        case 'warn':
        default:
          logger.warn(
            'Proceeding with optimization without snapshot - ' +
              'rollback will not be available (policy: warn)',
          );

          logger.warn(
            'Consider using snapshotFailurePolicy: "abort" for production ' +
              'environments requiring guaranteed rollback',
          );
          break;
      }

      return undefined;
    }
  }

  /**
   * Record a successful action execution
   */
  private recordSuccessfulAction(
    executedActions: OptimizationResult['executedActions'],
    actionId: string,
  ): void {
    executedActions.push({
      actionId,
      status: 'success',
    });
  }

  /**
   * Record a failed action execution
   */
  private recordFailedAction(
    executedActions: OptimizationResult['executedActions'],
    actionId: string,
    errorMessage: string,
  ): void {
    executedActions.push({
      actionId,
      status: 'failed',
      error: errorMessage,
    });
  }

  /**
   * Update action counters based on action type
   */
  private updateActionCounters(
    actionType: string,
    counters: {
      entitiesDeleted: number;
      entitiesMerged: number;
      entitiesUpdated: number;
    },
  ): void {
    switch (actionType) {
      case 'delete':
        counters.entitiesDeleted++;
        break;
      case 'merge':
        counters.entitiesMerged++;
        break;
      case 'update':
        counters.entitiesUpdated++;
        break;
      default:
        // No counter update for unknown action types
        break;
    }
  }
}
