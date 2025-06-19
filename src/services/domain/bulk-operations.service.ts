import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { SnapshotService } from '../snapshot.service';
import { BaseEntityService } from './base-entity.service';

/**
 * Service for bulk operations across multiple entity types
 * Handles complex operations that span multiple entities
 */
export class BulkOperationsService extends BaseEntityService {
  constructor(
    repositoryProvider: RepositoryProvider,
    getKuzuClient: (
      mcpContext: EnrichedRequestHandlerExtra,
      clientProjectRoot: string,
    ) => Promise<KuzuDBClient>,
    getSnapshotService: (
      mcpContext: EnrichedRequestHandlerExtra,
      clientProjectRoot: string,
    ) => Promise<SnapshotService>,
  ) {
    super(repositoryProvider, getKuzuClient, getSnapshotService);
  }

  /**
   * Bulk delete entities by type
   */
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
    this.validateRepositoryProvider('bulkDeleteByType');

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const warnings: string[] = [];
      let totalCount = 0;
      const deletedEntities: Array<{ type: string; id: string; name?: string }> = [];

      if (entityType === 'all') {
        // Handle deletion of all entity types
        const entityTypes = ['Component', 'Decision', 'Rule', 'File', 'Context'];
        
        for (const type of entityTypes) {
          const result = await this.processEntityTypeDeletion(
            kuzuClient,
            type,
            repositoryName,
            branch,
            options.dryRun || false,
          );
          totalCount += result.count;
          deletedEntities.push(...result.entities);
          warnings.push(...result.warnings);
        }
      } else {
        // Handle single entity type deletion
        const capitalizedType = entityType.charAt(0).toUpperCase() + entityType.slice(1);
        const result = await this.processEntityTypeDeletion(
          kuzuClient,
          capitalizedType,
          repositoryName,
          branch,
          options.dryRun || false,
        );
        totalCount = result.count;
        deletedEntities.push(...result.entities);
        warnings.push(...result.warnings);
      }

      return { count: totalCount, entities: deletedEntities, warnings };
    } catch (error: any) {
      this.handleEntityError(error, 'bulkDeleteByType', entityType, 'bulk', logger);
      throw error;
    }
  }

  /**
   * Process deletion for a specific entity type
   */
  private async processEntityTypeDeletion(
    kuzuClient: KuzuDBClient,
    entityType: string,
    repositoryName: string,
    branch: string,
    dryRun: boolean,
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const entities: Array<{ type: string; id: string; name?: string }> = [];

    // First, get all entities of this type
    const findQuery = `
      MATCH (n:${entityType})
      WHERE n.repository = $repository AND n.branch = $branch
      RETURN n.id as id, n.name as name
    `;

    const findResult = await kuzuClient.executeQuery(findQuery, {
      repository: repositoryName,
      branch: branch,
    });

    if (!findResult || findResult.length === 0) {
      return { count: 0, entities: [], warnings: [] };
    }

    // Collect entity information
    for (const row of findResult) {
      entities.push({
        type: entityType,
        id: row.id,
        name: row.name || undefined,
      });
    }

    if (!dryRun) {
      // Perform actual deletion
      const deleteQuery = `
        MATCH (n:${entityType})
        WHERE n.repository = $repository AND n.branch = $branch
        DETACH DELETE n
      `;

      await kuzuClient.executeQuery(deleteQuery, {
        repository: repositoryName,
        branch: branch,
      });
    }

    return { count: entities.length, entities, warnings };
  }

  /**
   * Bulk delete entities by branch
   */
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
    this.validateRepositoryProvider('bulkDeleteByBranch');

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

      totalCount += scopedResult.count;
      deletedEntities.push(...scopedResult.entities);
      warnings.push(...scopedResult.warnings);

      return { count: totalCount, entities: deletedEntities, warnings };
    } catch (error: any) {
      this.handleEntityError(error, 'bulkDeleteByBranch', 'branch', targetBranch, logger);
      throw error;
    }
  }

  /**
   * Helper method to process repository-scoped entities
   */
  private async processRepositoryScopedEntities(
    kuzuClient: KuzuDBClient,
    entityTypes: string[],
    repositoryName: string,
    targetBranch: string,
    dryRun: boolean,
  ): Promise<{
    count: number;
    entities: Array<{ type: string; id: string; name?: string }>;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const entities: Array<{ type: string; id: string; name?: string }> = [];
    let totalCount = 0;

    for (const entityType of entityTypes) {
      const result = await this.processEntityTypeDeletion(
        kuzuClient,
        entityType,
        repositoryName,
        targetBranch,
        dryRun,
      );
      totalCount += result.count;
      entities.push(...result.entities);
      warnings.push(...result.warnings);
    }

    return { count: totalCount, entities, warnings };
  }
}
