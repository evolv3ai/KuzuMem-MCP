import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import {
  Component,
  ComponentStatus,
  Decision,
  DecisionInput,
  FileInput,
  File as FileRecord,
  Rule,
  RuleInput,
  Tag,
  TagInput,
} from '../../types';
import { CoreService } from '../core/core.service';
import * as componentOps from '../memory-operations/component.ops';
import * as contextOps from '../memory-operations/context.ops';
import * as decisionOps from '../memory-operations/decision.ops';
import * as fileOps from '../memory-operations/file.ops';
import * as ruleOps from '../memory-operations/rule.ops';
import * as tagOps from '../memory-operations/tag.ops';

// Type definitions are now properly imported

export class EntityService extends CoreService {
  /**
   * Create or update a rule for a repository
   */
  async upsertRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    rule: Omit<Rule, 'repository' | 'branch' | 'id'> & { id: string },
    branch: string = 'main',
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.upsertRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

    // Ensure content is not null for RuleInput
    const ruleForOps = {
      ...rule,
      content: rule.content === null ? undefined : rule.content,
      triggers: rule.triggers === null ? undefined : rule.triggers,
    };

    return ruleOps.upsertRuleOp(
      mcpContext,
      repositoryName,
      branch,
      ruleForOps as RuleInput,
      repositoryRepo,
      ruleRepo,
    ) as Promise<Rule | null>;
  }

  // Add new methods for tools, delegating to Ops
  async upsertComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentData: {
      id: string;
      name: string;
      kind?: string;
      status?: ComponentStatus;
      depends_on?: string[];
    },
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.upsertComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    // Construct the data object expected by componentOps.upsertComponentOp
    const componentOpData = {
      ...componentData,
      repository: repositoryName,
      branch: branch,
    };

    return componentOps.upsertComponentOp(
      mcpContext,
      repositoryName,
      branch,
      componentOpData,
      repositoryRepo,
      componentRepo,
    ) as Promise<Component | null>;
  }

  async upsertDecision(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionData: {
      id: string;
      name: string;
      date: string;
      context?: string;
    },
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.upsertDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

    // Construct the data object expected by decisionOps.upsertDecisionOp
    const decisionOpData = {
      ...decisionData,
      repository: repositoryName,
      branch: branch,
    };

    return decisionOps.upsertDecisionOp(
      mcpContext,
      repositoryName,
      branch,
      decisionOpData as DecisionInput,
      repositoryRepo,
      decisionRepo,
    ) as Promise<Decision | null>;
  }

  // Get methods for individual entities
  async getComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const component = await componentRepo.findByIdAndBranch(repositoryName, componentId, branch);
      return component;
    } catch (error: any) {
      logger.error(`[EntityService.getComponent] Error getting component ${componentId}:`, error);
      throw error;
    }
  }

  async getDecision(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);
      const decision = await decisionRepo.findByIdAndBranch(repositoryName, decisionId, branch);
      return decision;
    } catch (error: any) {
      logger.error(`[EntityService.getDecision] Error getting decision ${decisionId}:`, error);
      throw error;
    }
  }

  async getRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);
      const rule = await ruleRepo.findByIdAndBranch(repositoryName, ruleId, branch);
      return rule;
    } catch (error: any) {
      logger.error(`[EntityService.getRule] Error getting rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Resolves the final value for a field being updated.
   * If an `updateValue` is provided, it takes precedence. Otherwise, `existingValue` is used.
   * Explicit `null` values are converted to `undefined`.
   * @param updateValue The new value from the update payload.
   * @param existingValue The current value of the entity's field.
   * @returns The resolved value for the update, or `undefined`.
   */
  private _resolveUpdateField<T>(
    updateValue: T | undefined | null,
    existingValue: T | undefined | null,
  ): T | undefined {
    const value = updateValue !== undefined ? updateValue : existingValue;
    return value === null ? undefined : value;
  }

  // Update methods for entities (distinct from upsert - only update existing)
  async updateComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    updates: Partial<Omit<Component, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.updateComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      // First check if component exists
      const existing = await this.getComponent(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        componentId,
      );
      if (!existing) {
        logger.warn(`[EntityService.updateComponent] Component ${componentId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        id: componentId,
        name: existing.name,
        kind: this._resolveUpdateField(updates.kind, existing.kind),
        depends_on: this._resolveUpdateField(updates.depends_on, existing.depends_on),
        status: this._resolveUpdateField(updates.status, existing.status),
      };

      return await this.upsertComponent(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData,
      );
    } catch (error: any) {
      logger.error(
        `[EntityService.updateComponent] Error updating component ${componentId}:`,
        error,
      );
      throw error;
    }
  }

  async updateDecision(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
    updates: Partial<Omit<Decision, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.updateDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      // First check if decision exists
      const existing = await this.getDecision(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        decisionId,
      );
      if (!existing) {
        logger.warn(`[EntityService.updateDecision] Decision ${decisionId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        ...existing,
        ...updates,
        // Use helper to consistently handle null/undefined
        context: this._resolveUpdateField(updates.context, existing.context),
      };

      // Use upsert method to update
      return await this.upsertDecision(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData,
      );
    } catch (error: any) {
      logger.error(`[EntityService.updateDecision] Error updating decision ${decisionId}:`, error);
      throw error;
    }
  }

  async updateRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
    updates: Partial<Omit<Rule, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Rule | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.updateRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      // First check if rule exists
      const existing = await this.getRule(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        ruleId,
      );
      if (!existing) {
        logger.warn(`[EntityService.updateRule] Rule ${ruleId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        ...existing,
        ...updates,
        // Use helper to consistently handle null/undefined
        content: this._resolveUpdateField(updates.content, existing.content),
        triggers: this._resolveUpdateField(updates.triggers, existing.triggers),
      };

      // Use upsert method to update
      return await this.upsertRule(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        updatedData,
        branch,
      );
    } catch (error: any) {
      logger.error(`[EntityService.updateRule] Error updating rule ${ruleId}:`, error);
      throw error;
    }
  }

  // Delete methods for entities
  async deleteComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      return await componentOps.deleteComponentOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        componentId,
      );
    } catch (error: any) {
      logger.error(
        `[EntityService.deleteComponent] Error deleting component ${componentId}:`,
        error,
      );
      throw error;
    }
  }

  async deleteDecision(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteDecision] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      return await decisionOps.deleteDecisionOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        decisionId,
      );
    } catch (error: any) {
      logger.error(`[EntityService.deleteDecision] Error deleting decision ${decisionId}:`, error);
      throw error;
    }
  }

  async deleteRule(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteRule] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      return await ruleOps.deleteRuleOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        ruleId,
      );
    } catch (error: any) {
      logger.error(`[EntityService.deleteRule] Error deleting rule ${ruleId}:`, error);
      throw error;
    }
  }

  async deleteFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      return await fileOps.deleteFileOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        fileId,
      );
    } catch (error: any) {
      logger.error(`[EntityService.deleteFile] Error deleting file ${fileId}:`, error);
      throw error;
    }
  }

  async deleteTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    tagId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      return await tagOps.deleteTagOp(mcpContext, kuzuClient, tagId);
    } catch (error: any) {
      logger.error(`[EntityService.deleteTag] Error deleting tag ${tagId}:`, error);
      throw error;
    }
  }
  async getFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<FileRecord | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository node ID
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(`[EntityService.getFile] Repository ${repositoryName}:${branch} not found.`);
        return null;
      }

      const file = await fileRepo.findFileById(repository.id, branch, fileId);
      return file as FileRecord | null;
    } catch (error: any) {
      logger.error(`[EntityService.getFile] Error getting file ${fileId}:`, error);
      throw error;
    }
  }

  async getTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<Tag | null> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.getTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);
      const tag = await tagRepo.findTagById(tagId);
      return tag;
    } catch (error: any) {
      logger.error(`[EntityService.getTag] Error getting tag ${tagId}:`, error);
      throw error;
    }
  }

  async addFile(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileData: FileInput,
  ): Promise<z.infer<typeof toolSchemas.EntityCreateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.addFile] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);

    const fileOpData = {
      ...fileData,
      repository: repositoryName,
      branch: branch,
    };

    const createdFile = await fileOps.addFileOp(
      mcpContext,
      repositoryName,
      branch,
      fileOpData,
      repositoryRepo,
      fileRepo,
    );

    if (!createdFile || !createdFile.success || !createdFile.file) {
      logger.warn(`[EntityService.addFile] Failed to add file ${fileData.id}`);
      return {
        success: false,
        message: createdFile?.message || 'Failed to add file',
        entity: {},
      };
    }

    logger.info(`[EntityService.addFile] File ${createdFile.file.id} added successfully`);
    return {
      success: true,
      message: 'File added successfully',
      entity: createdFile.file,
    };
  }

  async associateFileWithComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    fileId: string,
  ): Promise<z.infer<typeof toolSchemas.AssociateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.associateFileWithComponent] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const fileRepo = this.repositoryProvider.getFileRepository(clientProjectRoot);

    const success = await fileOps.associateFileWithComponentOp(
      mcpContext,
      repositoryName,
      branch,
      componentId,
      fileId,
      repositoryRepo,
      fileRepo,
    );

    if (!success || !success.success) {
      logger.warn(
        `[EntityService.associateFileWithComponent] Failed to associate ${fileId} with ${componentId}`,
      );
      return {
        type: 'file-component',
        success: false,
        message: success?.message || 'Failed to associate file with component',
        association: {
          from: fileId,
          to: componentId,
          relationship: 'IMPLEMENTS',
        },
      };
    }

    logger.info(
      `[EntityService.associateFileWithComponent] Associated ${fileId} with ${componentId}`,
    );
    return {
      type: 'file-component',
      success: true,
      message: 'File associated with component successfully',
      association: {
        from: fileId,
        to: componentId,
        relationship: 'IMPLEMENTS',
      },
    };
  }

  async addTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagData: TagInput,
  ): Promise<z.infer<typeof toolSchemas.EntityCreateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.addTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

    const tagOpData = {
      ...tagData,
      repository: repositoryName,
      branch: branch,
    };

    const createdTag = await tagOps.addTagOp(
      mcpContext,
      repositoryName,
      branch,
      tagOpData,
      repositoryRepo,
      tagRepo,
    );

    if (!createdTag || !createdTag.success || !createdTag.tag) {
      logger.warn(`[EntityService.addTag] Failed to add tag ${tagData.id}`);
      return {
        success: false,
        message: createdTag?.message || 'Failed to add tag',
        entity: {},
      };
    }

    logger.info(`[EntityService.addTag] Tag ${createdTag.tag.id} added successfully`);
    return {
      success: true,
      message: 'Tag added successfully',
      entity: createdTag.tag,
    };
  }

  async tagItem(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context',
    tagId: string,
  ): Promise<z.infer<typeof toolSchemas.AssociateOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.tagItem] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

    const success = await tagOps.tagItemOp(
      mcpContext,
      repositoryName,
      branch,
      itemId,
      itemType,
      tagId,
      repositoryRepo,
      tagRepo,
    );

    if (!success || !success.success) {
      logger.warn(`[EntityService.tagItem] Failed to tag ${itemType} ${itemId} with ${tagId}`);
      return {
        type: 'tag-item',
        success: false,
        message: success?.message || 'Failed to tag item',
        association: {
          from: tagId,
          to: itemId,
          relationship: 'TAGS',
        },
      };
    }

    logger.info(`[EntityService.tagItem] Tagged ${itemType} ${itemId} with ${tagId}`);
    return {
      type: 'tag-item',
      success: true,
      message: `${itemType} tagged successfully`,
      association: {
        from: tagId,
        to: itemId,
        relationship: 'TAGS',
      },
    };
  }

  async deleteContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    contextId: string,
  ): Promise<boolean> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.deleteContext] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      return await contextOps.deleteContextOp(
        mcpContext,
        kuzuClient,
        repositoryRepo,
        repositoryName,
        branch,
        contextId,
      );
    } catch (error: any) {
      logger.error(`[EntityService.deleteContext] Error deleting context ${contextId}:`, error);
      throw error;
    }
  }

  // Helper methods for bulk deletion
  private async executeBulkDeletion(
    kuzuClient: KuzuDBClient,
    entityType: string,
    whereClause: string,
    params: Record<string, any>,
    dryRun: boolean,
  ): Promise<{
    entities: Array<{ type: string; id: string; name?: string }>;
    count: number;
  }> {
    const query = `
      MATCH (n:${entityType})
      WHERE ${whereClause}
      ${dryRun ? '' : 'DETACH DELETE n'}
      RETURN n.id as id, n.name as name, labels(n) as labels
    `;
    const results = await kuzuClient.executeQuery(query, params);

    const entities = results.map((row: any) => ({
      type:
        (row.labels as string[])
          .find((l) => l.toLowerCase() === entityType.toLowerCase())
          ?.toLowerCase() || entityType.toLowerCase(),
      id: row.id,
      name: row.name,
    }));

    return { entities, count: entities.length };
  }

  private async handleTagDeletion(
    kuzuClient: KuzuDBClient,
    dryRun: boolean,
  ): Promise<{
    entities: Array<{ type: string; id: string; name?: string }>;
    count: number;
  }> {
    const query = `
      MATCH (t:Tag)
      ${dryRun ? '' : 'DETACH DELETE t'}
      RETURN t.id as id, t.name as name
    `;
    const results = await kuzuClient.executeQuery(query, {});

    const entities = results.map((row: any) => ({
      type: 'tag',
      id: row.id,
      name: row.name,
    }));

    return { entities, count: entities.length };
  }

  private async processRepositoryScopedEntities(
    kuzuClient: KuzuDBClient,
    entityTypes: string[],
    repositoryName: string,
    branch: string,
    dryRun: boolean,
  ): Promise<{
    entities: Array<{ type: string; id: string; name?: string }>;
    count: number;
  }> {
    let totalCount = 0;
    const allEntities: Array<{ type: string; id: string; name?: string }> = [];

    for (const type of entityTypes) {
      if (type === 'Tag') {
        continue; // Tags are handled separately
      }

      const whereClause = 'n.repository = $repositoryName AND n.branch = $branch';
      const params = { repositoryName, branch };

      const result = await this.executeBulkDeletion(kuzuClient, type, whereClause, params, dryRun);

      allEntities.push(...result.entities);
      totalCount += result.count;
    }

    return { entities: allEntities, count: totalCount };
  }

  // Bulk delete methods
  async bulkDeleteByType(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityType: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context' | 'all',
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByType] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Get repository to ensure it exists
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[EntityService.bulkDeleteByType] Repository ${repositoryName}:${branch} not found.`,
        );
        return {
          count: 0,
          entities: [],
          warnings: [`Repository ${repositoryName}:${branch} not found`],
        };
      }

      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Define entity types to process
      const entityTypes =
        entityType === 'all'
          ? ['Component', 'Decision', 'Rule', 'File', 'Context']
          : [entityType.charAt(0).toUpperCase() + entityType.slice(1)];

      // Handle tags (they're not scoped to repository/branch)
      if (entityType === 'tag' || entityType === 'all') {
        const tagResult = await this.handleTagDeletion(kuzuClient, options.dryRun || false);
        deletedEntities.push(...tagResult.entities);
        totalCount += tagResult.count;
      }

      // Process repository-scoped entities
      if (entityType !== 'tag') {
        const scopedResult = await this.processRepositoryScopedEntities(
          kuzuClient,
          entityTypes,
          repositoryName,
          branch,
          options.dryRun || false,
        );
        deletedEntities.push(...scopedResult.entities);
        totalCount += scopedResult.count;
      }

      logger.info(
        `[EntityService.bulkDeleteByType] ${options.dryRun ? 'Would delete' : 'Deleted'} ${totalCount} ${entityType} entities in ${repositoryName}:${branch}`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(`[EntityService.bulkDeleteByType] Error bulk deleting ${entityType}:`, error);
      throw error;
    }
  }

  async bulkDeleteByTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Verify tag exists
      const tagExistsQuery = `MATCH (t:Tag {id: $tagId}) RETURN count(t) as tagCount`;
      const tagExistsResult = await kuzuClient.executeQuery(tagExistsQuery, { tagId });
      if (!tagExistsResult[0]?.tagCount) {
        warnings.push(`Tag with ID ${tagId} not found`);
        return { count: 0, entities: [], warnings };
      }

      const whereClause = 't.id = $tagId AND n.repository = $repositoryName AND n.branch = $branch';
      const params = { tagId, repositoryName, branch };

      const query = `
        MATCH (t:Tag)-[:TAGGED_WITH]-(n)
        WHERE ${whereClause}
        ${options.dryRun ? '' : 'DETACH DELETE n'}
        RETURN n.id as id, n.name as name, labels(n) as labels
      `;

      const results = await kuzuClient.executeQuery(query, params);

      const entities = results.map((row: any) => ({
        type: (row.labels as string[]).find((l) => l !== 'Tag')?.toLowerCase() || 'unknown',
        id: row.id,
        name: row.name,
      }));

      totalCount = entities.length;
      deletedEntities.push(...entities);

      logger.info(
        `[EntityService.bulkDeleteByTag] ${
          options.dryRun ? 'Would delete' : 'Deleted'
        } ${totalCount} entities tagged with ${tagId} in ${repositoryName}:${branch}`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(`[EntityService.bulkDeleteByTag] Error bulk deleting by tag ${tagId}:`, error);
      throw error;
    }
  }

  async bulkDeleteByBranch(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    targetBranch: string,
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByBranch] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Entity types that are scoped to repository/branch
      const entityTypes = ['Component', 'Decision', 'Rule', 'File', 'Context'];

      // Process repository-scoped entities using helper method
      const scopedResult = await this.processRepositoryScopedEntities(
        kuzuClient,
        entityTypes,
        repositoryName,
        targetBranch,
        options.dryRun || false,
      );
      deletedEntities.push(...scopedResult.entities);
      totalCount += scopedResult.count;

      // Also delete the repository record for this branch if not dry run
      if (!options.dryRun) {
        const repoDeleteQuery = `
          MATCH (r:Repository {name: $repositoryName, branch: $targetBranch})
          DELETE r
          RETURN count(r) as deletedCount
        `;

        const repoResult = await kuzuClient.executeQuery(repoDeleteQuery, {
          repositoryName,
          targetBranch,
        });
        const repoDeletedCount = repoResult[0]?.deletedCount || 0;
        if (repoDeletedCount > 0) {
          deletedEntities.push({
            type: 'repository',
            id: `${repositoryName}:${targetBranch}`,
            name: repositoryName,
          });
          totalCount += repoDeletedCount;
        }
      }

      logger.info(
        `[EntityService.bulkDeleteByBranch] ${
          options.dryRun ? 'Would delete' : 'Deleted'
        } ${totalCount} entities from branch ${targetBranch} in repository ${repositoryName}`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.bulkDeleteByBranch] Error bulk deleting branch ${targetBranch}:`,
        error,
      );
      throw error;
    }
  }

  async bulkDeleteByRepository(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    options: {
      dryRun?: boolean;
      force?: boolean;
    } = {},
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[EntityService.bulkDeleteByRepository] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      // Entity types that are scoped to repository
      const entityTypes = ['Component', 'Decision', 'Rule', 'File', 'Context'];

      // Process repository-scoped entities across all branches
      for (const entityType of entityTypes) {
        const whereClause = 'n.repository = $repositoryName';
        const params = { repositoryName };

        const result = await this.executeBulkDeletion(
          kuzuClient,
          entityType,
          whereClause,
          params,
          options.dryRun || false,
        );

        // For repository deletion, include branch info in entity names
        const entitiesWithBranch = result.entities.map((entity: any) => ({
          ...entity,
          name: entity.name ? `${entity.name} (multi-branch)` : `${entity.id} (multi-branch)`,
        }));

        deletedEntities.push(...entitiesWithBranch);
        totalCount += result.count;
      }

      // Delete all repository records for this repository (all branches)
      if (!options.dryRun) {
        const repoDeleteQuery = `
          MATCH (r:Repository {name: $repositoryName})
          DELETE r
          RETURN count(r) as deletedCount, collect(r.branch) as branches
        `;

        const repoResult = await kuzuClient.executeQuery(repoDeleteQuery, {
          repositoryName,
        });
        const repoDeletedCount = repoResult[0]?.deletedCount || 0;
        const branches = repoResult[0]?.branches || [];

        if (repoDeletedCount > 0) {
          for (const branch of branches) {
            deletedEntities.push({
              type: 'repository',
              id: `${repositoryName}:${branch}`,
              name: `${repositoryName} (${branch})`,
            });
          }
          totalCount += repoDeletedCount;
        }
      }

      logger.info(
        `[EntityService.bulkDeleteByRepository] ${
          options.dryRun ? 'Would delete' : 'Deleted'
        } ${totalCount} entities from repository ${repositoryName} (all branches)`,
      );

      return {
        count: totalCount,
        entities: deletedEntities,
        warnings,
      };
    } catch (error: any) {
      logger.error(
        `[EntityService.bulkDeleteByRepository] Error bulk deleting repository ${repositoryName}:`,
        error,
      );
      throw error;
    }
  }
}
