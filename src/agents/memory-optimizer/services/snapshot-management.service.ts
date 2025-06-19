// Internal services and utilities
import { BaseMemoryAgent } from '../base/base-memory-agent';

// Type imports
import type { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

/**
 * Service responsible for snapshot management operations
 * Handles snapshot creation, validation, rollback, and listing
 */
export class SnapshotManagementService extends BaseMemoryAgent {
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
    const rollbackLogger = this.createOperationLogger('rollbackToSnapshot', {
      snapshotId,
      repository,
      branch,
    });

    try {
      rollbackLogger.info('Starting rollback to snapshot');

      // Get snapshot service
      const snapshotService = await this.memoryService.getSnapshotService(
        mcpContext,
        clientProjectRoot,
      );

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
        message:
          `Successfully rolled back to snapshot ${snapshotId}. ` +
          `Restored ${rollbackResult.restoredEntities} entities and ` +
          `${rollbackResult.restoredRelationships} relationships.`,
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
    branch?: string,
  ): Promise<any[]> {
    try {
      const snapshotService = await this.memoryService.getSnapshotService(
        mcpContext,
        clientProjectRoot,
      );
      return await snapshotService.listSnapshots(repository, branch);
    } catch (error) {
      this.agentLogger.error('Failed to list snapshots:', error);
      throw new Error(`Failed to list snapshots: ${error}`);
    }
  }

  /**
   * Create a snapshot with optional description
   */
  async createSnapshot(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    description?: string,
  ): Promise<{
    snapshotId: string;
    entitiesCount: number;
    relationshipsCount: number;
    created: string;
    description: string;
  }> {
    const snapshotLogger = this.createOperationLogger('createSnapshot', {
      repository,
      branch,
    });

    try {
      snapshotLogger.info('Creating snapshot', { description });

      const snapshotService = await this.memoryService.getSnapshotService(
        mcpContext,
        clientProjectRoot,
      );

      const result = await snapshotService.createSnapshot(
        repository,
        branch,
        description || `Manual snapshot created at ${new Date().toISOString()}`,
      );

      snapshotLogger.info('Snapshot created successfully', {
        snapshotId: result.snapshotId,
        entitiesCount: result.entitiesCount,
        relationshipsCount: result.relationshipsCount,
      });

      return result;
    } catch (error) {
      snapshotLogger.error('Failed to create snapshot:', error);
      throw new Error(`Failed to create snapshot: ${error}`);
    }
  }

  /**
   * Validate a snapshot
   */
  async validateSnapshot(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    snapshotId: string,
  ): Promise<{
    valid: boolean;
    issues: string[];
    entityCount?: number;
    relationshipCount?: number;
  }> {
    const validationLogger = this.createOperationLogger('validateSnapshot', {
      snapshotId,
    });

    try {
      validationLogger.info('Validating snapshot');

      const snapshotService = await this.memoryService.getSnapshotService(
        mcpContext,
        clientProjectRoot,
      );

      const validation = await snapshotService.validateSnapshot(snapshotId);

      validationLogger.info('Snapshot validation completed', {
        valid: validation.valid,
        issueCount: validation.issues.length,
      });

      return validation;
    } catch (error) {
      validationLogger.error('Failed to validate snapshot:', error);
      throw new Error(`Failed to validate snapshot: ${error}`);
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    snapshotId: string,
  ): Promise<{ success: boolean; message: string }> {
    const deleteLogger = this.createOperationLogger('deleteSnapshot', {
      snapshotId,
    });

    try {
      deleteLogger.info('Deleting snapshot');

      const snapshotService = await this.memoryService.getSnapshotService(
        mcpContext,
        clientProjectRoot,
      );

      await snapshotService.deleteSnapshot(snapshotId);

      deleteLogger.info('Snapshot deleted successfully');

      return {
        success: true,
        message: `Snapshot ${snapshotId} deleted successfully`,
      };
    } catch (error) {
      deleteLogger.error('Failed to delete snapshot:', error);
      throw new Error(`Failed to delete snapshot: ${error}`);
    }
  }
}
