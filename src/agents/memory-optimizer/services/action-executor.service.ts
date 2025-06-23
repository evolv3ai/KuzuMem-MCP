// Internal services and utilities
import { BaseMemoryAgent } from '../base/base-memory-agent';

// Type imports
import type { ToolHandlerContext } from '../../../mcp/types/sdk-custom';

/**
 * Service responsible for executing individual optimization actions
 * Handles delete, merge, update, and move operations on entities
 */
export class ActionExecutorService extends BaseMemoryAgent {
  /**
   * Execute individual optimization action
   */
  async executeAction(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
  ): Promise<void> {
    const actionLogger = this.createOperationLogger('executeAction', {
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
          await this.executeDeleteAction(
            mcpContext,
            clientProjectRoot,
            repository,
            branch,
            action,
            actionLogger,
          );
          break;

        case 'merge':
          await this.executeMergeAction(
            mcpContext,
            clientProjectRoot,
            repository,
            branch,
            action,
            actionLogger,
          );
          break;

        case 'update':
          await this.executeUpdateAction(
            mcpContext,
            clientProjectRoot,
            repository,
            branch,
            action,
            actionLogger,
          );
          break;

        case 'move':
          await this.executeMoveAction(
            mcpContext,
            clientProjectRoot,
            repository,
            branch,
            action,
            actionLogger,
          );
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
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any,
  ): Promise<void> {
    // Extract entity information
    const entityId = action.entityId;
    const entityType = this.determineEntityType(entityId, action);

    logger.info(`Deleting ${entityType} entity: ${entityId}`, {
      entityId,
      entityType,
      actionType: action.type,
    });

    // Execute deletion based on entity type
    if (!this.memoryService.entity) {
      throw new Error('EntityService not initialized in MemoryService');
    }
    switch (entityType) {
      case 'component':
        await this.memoryService.entity.deleteComponent(
          mcpContext,
          clientProjectRoot,
          repository,
          branch,
          entityId,
        );
        break;

      case 'decision':
        await this.memoryService.entity.deleteDecision(
          mcpContext,
          clientProjectRoot,
          repository,
          branch,
          entityId,
        );
        break;

      case 'rule':
        await this.memoryService.entity.deleteRule(
          mcpContext,
          clientProjectRoot,
          repository,
          branch,
          entityId,
        );
        break;

      case 'file':
        await this.memoryService.entity.deleteFile(
          mcpContext,
          clientProjectRoot,
          repository,
          branch,
          entityId,
        );
        break;

      case 'context':
        await this.memoryService.entity.deleteContext(
          mcpContext,
          clientProjectRoot,
          repository,
          branch,
          entityId,
        );
        break;

      case 'tag':
        await this.memoryService.entity.deleteTag(mcpContext, clientProjectRoot, repository, branch, entityId);
        break;

      default:
        throw new Error(`Unsupported entity type for deletion: ${entityType}`);
    }

    logger.info(`Successfully deleted ${entityType} entity: ${entityId}`, {
      entityId,
      entityType,
    });
  }

  /**
   * Execute merge action (merge source entity into target entity)
   */
  private async executeMergeAction(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any,
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
    const relationshipType = sourceLabels[0] === 'Component' ? 'DEPENDS_ON' : 'RELATED_TO';

    const updateRelationshipsQuery = `
      MATCH (source {id: $sourceId, repository: $repository, branch: $branch})-[r]-(other)
      MATCH (target {id: $targetId, repository: $repository, branch: $branch})
      WHERE NOT (target)-[r]-(other)
      CREATE (target)-[newR:${relationshipType}]->(other)
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

    await this.executeDeleteAction(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      { ...action, type: 'delete', entityId: sourceEntityId },
      logger,
    );

    logger.info(`Successfully merged entity ${sourceEntityId} into ${targetEntityId}`);
  }

  /**
   * Execute update action (update entity properties)
   */
  private async executeUpdateAction(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any,
  ): Promise<void> {
    const entityId = action.entityId;
    const updates = action.updates || {};

    logger.info(`Updating entity ${entityId}`, { updates });

    const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

    // Define allowed fields for updates
    const allowedFields = [
      'name',
      'description',
      'status',
      'metadata',
      'updated_at',
      'kind',
      'depends_on',
      'content',
      'triggers',
      'date',
      'context',
    ];

    // Filter and validate fields
    const validUpdates = Object.keys(updates)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => ({ ...obj, [key]: updates[key] }), {});

    if (Object.keys(validUpdates).length === 0) {
      logger.warn(`No valid updates specified for entity ${entityId}`);
      return;
    }

    // Build update query
    const updateFields = Object.keys(validUpdates)
      .map((key) => `n.${key} = $${key}`)
      .join(', ');

    const updateQuery = `
      MATCH (n {id: $entityId, repository: $repository, branch: $branch})
      SET ${updateFields}
      RETURN n
    `;

    const params = {
      entityId,
      repository,
      branch,
      ...validUpdates,
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
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    action: any,
    logger: any,
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
}
