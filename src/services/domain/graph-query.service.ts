import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Component, Decision, Rule } from '../../types';
import { CoreService } from '../core/core.service';
import * as componentOps from '../memory-operations/component.ops';
import * as decisionOps from '../memory-operations/decision.ops';
import * as graphOps from '../memory-operations/graph.ops';
import * as ruleOps from '../memory-operations/rule.ops';
import * as tagOps from '../memory-operations/tag.ops';
import { SnapshotService } from '../snapshot.service';

export class GraphQueryService extends CoreService {
  // Whitelist of allowed node labels to prevent injection attacks
  private static readonly ALLOWED_LABELS = new Set([
    'Component',
    'Decision',
    'Rule',
    'Tag',
    'File',
    'Context',
    'Repository'
  ]);

  constructor(
    repositoryProvider: RepositoryProvider,
    getKuzuClient: (
      mcpContext: ToolHandlerContext,
      clientProjectRoot: string,
    ) => Promise<KuzuDBClient>,
    getSnapshotService: (
      mcpContext: ToolHandlerContext,
      clientProjectRoot: string,
    ) => Promise<SnapshotService>,
  ) {
    super(repositoryProvider, getKuzuClient, getSnapshotService);
  }

  /**
   * Validates that a label is in the allowed whitelist to prevent injection attacks
   * @param label The label to validate
   * @throws Error if label is not allowed
   */
  private validateLabel(label: string): void {
    if (!GraphQueryService.ALLOWED_LABELS.has(label)) {
      throw new Error(`Invalid label: ${label}. Allowed labels: ${Array.from(GraphQueryService.ALLOWED_LABELS).join(', ')}`);
    }
  }
  async getComponentDependencies(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<{ componentId: string; dependencies: Component[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[GraphQueryService.getComponentDependencies] RepositoryProvider not initialized',
      );
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const dependencies = await componentOps.getComponentDependenciesOp(
        mcpContext,
        repositoryName,
        branch,
        componentId,
        repositoryRepo,
        componentRepo,
      );

      logger.info(
        `[GraphQueryService.getComponentDependencies] Retrieved ${dependencies.length} dependencies for ${componentId} in ${repositoryName}:${branch}`,
      );
      return {
        componentId,
        dependencies: dependencies,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getComponentDependencies] Error for ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getActiveComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Component[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.getActiveComponents] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    const repository = await repositoryRepo.findByName(repositoryName, branch);
    if (!repository || !repository.id) {
      logger.warn(
        `[GraphQueryService.getActiveComponents] Repository ${repositoryName}:${branch} not found.`,
      );
      return [];
    }
    return componentOps.getActiveComponentsOp(
      mcpContext,
      repository.id,
      branch,
      repositoryRepo,
      componentRepo,
    );
  }

  async getComponentDependents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<{ componentId: string; dependents: Component[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.getComponentDependents] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const dependents = await componentOps.getComponentDependentsOp(
        mcpContext,
        repositoryName,
        branch,
        componentId,
        repositoryRepo,
        componentRepo,
      );

      logger.info(
        `[GraphQueryService.getComponentDependents] Retrieved ${dependents.length} dependents for ${componentId} in ${repositoryName}:${branch}`,
      );
      return {
        componentId,
        dependents: dependents,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getComponentDependents] Error for ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getItemContextualHistory(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: 'Component' | 'Decision' | 'Rule',
  ): Promise<{ itemId: string; itemType: string; contextHistory: any[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[GraphQueryService.getItemContextualHistory] RepositoryProvider not initialized',
      );
      throw new Error('RepositoryProvider not initialized');
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot,
        repository: repositoryName,
        branch,
        itemId,
        itemType,
      };

      const result = await graphOps.getItemContextualHistoryOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        `[GraphQueryService.getItemContextualHistory] Retrieved history for ${itemType} ${itemId} in ${repositoryName}:${branch}`,
      );
      return {
        itemId,
        itemType,
        contextHistory: result || [],
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getItemContextualHistory] Error for ${itemType} ${itemId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  // Add missing methods with proper implementations
  async listNodesByLabel(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<z.infer<typeof toolSchemas.EntitiesQueryOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.listNodesByLabel] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    // Validate label to prevent injection attacks
    this.validateLabel(label);

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // KuzuDB doesn't support OFFSET/SKIP, so we'll implement basic pagination
      // by fetching more records and slicing in memory for now
      const totalLimit = limit + offset;
      const query = `
        MATCH (n:${label})
        WHERE n.repository = $repositoryName AND n.branch = $branch
        RETURN n
        ORDER BY n.created_at DESC
        LIMIT $totalLimit
      `;

      const allResults = await kuzuClient.executeQuery(query, {
        repositoryName,
        branch,
        totalLimit,
      });

      // Apply offset and limit in memory since KuzuDB doesn't support OFFSET/SKIP
      const result = allResults.slice(offset, offset + limit);

      logger.info(
        `[GraphQueryService.listNodesByLabel] Retrieved ${result.length} ${label} nodes in ${repositoryName}:${branch}`,
      );

      return {
        type: 'entities',
        label,
        entities: result,
        limit,
        offset,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.listNodesByLabel] Error for ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getRelatedItems(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    opParams: any,
  ): Promise<{ startItemId: string; relatedItems: any[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.getRelatedItems] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const graphOpsParams = {
        clientProjectRoot,
        repository: repositoryName,
        branch,
        itemId,
        ...opParams,
      };

      const result = await graphOps.getRelatedItemsOp(mcpContext, kuzuClient, graphOpsParams);

      logger.info(
        `[GraphQueryService.getRelatedItems] Retrieved related items for ${itemId} in ${repositoryName}:${branch}`,
      );
      return {
        startItemId: itemId,
        relatedItems: result || [],
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getRelatedItems] Error for ${itemId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async findItemsByTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    entityType?: string,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.findItemsByTag] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

      const result = await tagOps.findItemsByTagOp(
        mcpContext,
        repositoryName,
        branch,
        tagId,
        repositoryRepo,
        tagRepo,
        entityType as any,
      );

      logger.info(
        `[GraphQueryService.findItemsByTag] Found ${result.items.length} items tagged with ${tagId} in ${repositoryName}:${branch}`,
      );
      return {
        tagId,
        entityType,
        items: result.items,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.findItemsByTag] Error finding items by tag ${tagId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async listAllNodeLabels(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.listAllNodeLabels] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const query = `
        CALL show_tables() RETURN name
      `;

      const result = await kuzuClient.executeQuery(query, {});
      const labels = result
        .map((row: any) => row.name)
        .filter((name: string) =>
          ['Component', 'Decision', 'Rule', 'Tag', 'File', 'Context', 'Repository'].includes(name),
        );

      logger.info(
        `[GraphQueryService.listAllNodeLabels] Retrieved ${labels.length} node labels in ${repositoryName}:${branch}`,
      );
      return {
        labels,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.listAllNodeLabels] Error in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      // Return default labels on error
      return {
        labels: ['Component', 'Decision', 'Rule', 'Tag', 'File', 'Context'],
      };
    }
  }

  async countNodesByLabel(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.CountOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.countNodesByLabel] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    // Validate label to prevent injection attacks
    this.validateLabel(label);

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const query = `
        MATCH (n:${label})
        WHERE n.repository = $repositoryName AND n.branch = $branch
        RETURN count(n) as count
      `;

      const result = await kuzuClient.executeQuery(query, {
        repositoryName,
        branch,
      });

      const count = result.length > 0 ? result[0].count : 0;
      logger.info(
        `[GraphQueryService.countNodesByLabel] Counted ${count} ${label} nodes in ${repositoryName}:${branch}`,
      );

      return {
        label,
        count,
        message: `Found ${count} ${label} nodes`,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.countNodesByLabel] Error counting ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return {
        label,
        count: 0,
        message: `Error counting ${label} nodes: ${error.message}`,
      };
    }
  }

  async getNodeProperties(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.PropertiesOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.getNodeProperties] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    // Validate label to prevent injection attacks
    this.validateLabel(label);

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      const query = `
        CALL table_info('${label}') RETURN *
      `;

      const result = await kuzuClient.executeQuery(query, {});
      const properties = result.map((row: any) => ({
        name: row.property_name,
        type: row.property_type,
      }));

      logger.info(
        `[GraphQueryService.getNodeProperties] Retrieved ${properties.length} properties for ${label}`,
      );

      return {
        label,
        properties,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getNodeProperties] Error getting properties for ${label}: ${error.message}`,
        { error: error.toString() },
      );
      return {
        label,
        properties: [],
      };
    }
  }

  async listAllIndexes(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    target?: string,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.listAllIndexes] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // KuzuDB doesn't have a direct way to list indexes, so return empty for now
      logger.info(`[GraphQueryService.listAllIndexes] Index listing not supported in KuzuDB`);

      return {
        indexes: [],
        message: 'Index listing not supported in KuzuDB',
      };
    } catch (error: any) {
      logger.error(`[GraphQueryService.listAllIndexes] Error listing indexes: ${error.message}`, {
        error: error.toString(),
      });
      return {
        indexes: [],
        message: `Error listing indexes: ${error.message}`,
      };
    }
  }

  async getGoverningItemsForComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<{ componentId: string; rules: any[]; decisions: any[] }> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[GraphQueryService.getGoverningItemsForComponent] RepositoryProvider not initialized',
      );
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Query for rules and decisions that govern this component
      const rulesQuery = `
        MATCH (c:Component {graph_unique_id: $componentGraphId})
        MATCH (r:Rule)-[:GOVERNS]->(c)
        RETURN r
      `;

      const decisionsQuery = `
        MATCH (c:Component {graph_unique_id: $componentGraphId})
        MATCH (d:Decision)-[:AFFECTS]->(c)
        RETURN d
      `;

      const componentGraphId = `${repositoryName}:${branch}:${componentId}`;

      const [rulesResult, decisionsResult] = await Promise.all([
        kuzuClient.executeQuery(rulesQuery, { componentGraphId }),
        kuzuClient.executeQuery(decisionsQuery, { componentGraphId }),
      ]);

      logger.info(
        `[GraphQueryService.getGoverningItemsForComponent] Found ${rulesResult.length} rules and ${decisionsResult.length} decisions for component ${componentId}`,
      );

      return {
        componentId,
        rules: rulesResult,
        decisions: decisionsResult,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getGoverningItemsForComponent] Error for component ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }
}
