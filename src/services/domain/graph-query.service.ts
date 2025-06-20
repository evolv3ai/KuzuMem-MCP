import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { Component, Decision, Rule } from '../../types';
import { CoreService } from '../core/core.service';
import * as componentOps from '../memory-operations/component.ops';
import * as decisionOps from '../memory-operations/decision.ops';
import * as graphOps from '../memory-operations/graph.ops';
import * as ruleOps from '../memory-operations/rule.ops';
import * as tagOps from '../memory-operations/tag.ops';
import { SnapshotService } from '../snapshot.service';

export class GraphQueryService extends CoreService {
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

  async getComponentDependencies(
    mcpContext: EnrichedRequestHandlerExtra,
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
    mcpContext: EnrichedRequestHandlerExtra,
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
    mcpContext: EnrichedRequestHandlerExtra,
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
    mcpContext: EnrichedRequestHandlerExtra,
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

  async getGoverningItemsForComponent(
    mcpContext: EnrichedRequestHandlerExtra,
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

      const graphOpsParams = {
        clientProjectRoot,
        repository: repositoryName,
        branch,
        componentId,
      };

      const result = await graphOps.getGoverningItemsForComponentOp(
        mcpContext,
        kuzuClient,
        graphOpsParams,
      );

      logger.info(
        `[GraphQueryService.getGoverningItemsForComponent] Retrieved governing items for ${componentId} in ${repositoryName}:${branch}`,
      );
      return {
        componentId,
        rules: result.rules || [],
        decisions: result.decisions || [],
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getGoverningItemsForComponent] Error for ${componentId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getRelatedItems(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    opParams: {
      projectedGraphName?: string;
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
      depth?: number;
      relationshipFilter?: string;
      targetNodeTypeFilter?: string;
    },
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
        startItemId: itemId,
        ...opParams,
      };

      const result = await graphOps.getRelatedItemsOp(mcpContext, kuzuClient, graphOpsParams);

      logger.info(
        `[GraphQueryService.getRelatedItems] Retrieved related items for ${itemId} in ${repositoryName}:${branch}`,
      );
      return {
        startItemId: itemId,
        relatedItems: result.relatedItems || [],
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getRelatedItems] Error for ${itemId} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async getDecisionsByDateRange(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
    startDate: string,
    endDate: string,
  ): Promise<Decision[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error(
        '[GraphQueryService.getDecisionsByDateRange] RepositoryProvider not initialized',
      );
      return [];
    }
    try {
      await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

      const allDecisions = await decisionOps.getActiveDecisionsOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        decisionRepo,
      );

      const decisions = allDecisions.filter((d) => {
        if (!d.date) {
          return false;
        }
        const decisionDate = new Date(d.date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return decisionDate >= start && decisionDate <= end;
      });

      logger.info(
        `[GraphQueryService.getDecisionsByDateRange] Retrieved ${decisions.length} decisions for ${repositoryName}:${branch}`,
      );
      return decisions.map((d: Decision) => ({ ...d, repository: repositoryName, branch }));
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getDecisionsByDateRange] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return [];
    }
  }

  async getActiveRules(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<Rule[]> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.getActiveRules] RepositoryProvider not initialized');
      return [];
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const ruleRepo = this.repositoryProvider.getRuleRepository(clientProjectRoot);

      const rules = await ruleOps.getActiveRulesOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
        ruleRepo,
      );

      logger.info(
        `[GraphQueryService.getActiveRules] Retrieved ${rules.length} active rules for ${repositoryName}:${branch}`,
      );
      return rules.map((r) => ({ ...r, repository: repositoryName, branch }));
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getActiveRules] Error for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }

  async countNodesByLabel(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.CountOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.countNodesByLabel] RepositoryProvider not initialized');
      return { label, count: 0, message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const query = `
        MATCH (n:${label})
        WHERE n.repository = $repositoryName AND n.branch = $branch
        RETURN COUNT(n) AS count
      `;

      const result = await kuzuClient.executeQuery(query, { repositoryName, branch });
      const count = result[0]?.count || 0;

      logger.info(
        `[GraphQueryService.countNodesByLabel] Counted ${count} nodes with label ${label} in ${repositoryName}:${branch}`,
      );
      return { label, count: Number(count), message: `Found ${count} ${label} nodes` };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.countNodesByLabel] Error counting ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return { label, count: 0, message: error.message || 'Failed to count nodes' };
    }
  }

  async listNodesByLabel(
    mcpContext: EnrichedRequestHandlerExtra,
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
      return {
        type: 'entities',
        label,
        entities: [],
        limit,
        offset,
      };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const query = `
        MATCH (n:${label})
        WHERE n.repository = $repositoryName AND n.branch = $branch
        RETURN n
        ORDER BY n.name, n.id
        SKIP $offset
        LIMIT $limit
      `;

      const results = await kuzuClient.executeQuery(query, {
        repositoryName,
        branch,
        limit,
        offset,
      });
      const entities = results.map((row: any) => {
        const node = row.n.properties || row.n;
        return { ...node, repository: repositoryName, branch };
      });

      logger.info(
        `[GraphQueryService.listNodesByLabel] Retrieved ${entities.length} ${label} nodes in ${repositoryName}:${branch}`,
      );
      return {
        type: 'entities',
        label,
        entities,
        limit,
        offset,
      };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.listNodesByLabel] Error listing ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return {
        type: 'entities',
        label,
        entities: [],
        limit,
        offset,
      };
    }
  }

  async getNodeProperties(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label: string,
  ): Promise<z.infer<typeof toolSchemas.PropertiesOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.getNodeProperties] RepositoryProvider not initialized');
      return { label, properties: [] };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const sampleQuery = `
        MATCH (n:${label})
        WHERE n.repository = $repositoryName AND n.branch = $branch
        RETURN n
        LIMIT 1
      `;

      const sampleResults = await kuzuClient.executeQuery(sampleQuery, { repositoryName, branch });
      if (sampleResults.length === 0) {
        return { label, properties: [] };
      }

      const sampleNode = sampleResults[0].n.properties || sampleResults[0].n;
      const properties = Object.keys(sampleNode).map((key) => ({
        name: key,
        type: typeof sampleNode[key],
      }));

      logger.info(
        `[GraphQueryService.getNodeProperties] Retrieved ${properties.length} properties for ${label} in ${repositoryName}:${branch}`,
      );
      return { label, properties };
    } catch (error: any) {
      logger.error(
        `[GraphQueryService.getNodeProperties] Error getting properties for ${label} in ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return { label, properties: [] };
    }
  }

  async listAllIndexes(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    label?: string,
  ): Promise<z.infer<typeof toolSchemas.IndexesOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.listAllIndexes] RepositoryProvider not initialized');
      return { indexes: [] };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      logger.info(
        `[GraphQueryService.listAllIndexes] Index introspection not fully implemented for Kuzu`,
      );
      return {
        indexes: [],
      };
    } catch (error: any) {
      logger.error(`[GraphQueryService.listAllIndexes] Error listing indexes: ${error.message}`, {
        error: error.toString(),
      });
      return { indexes: [] };
    }
  }

  async findItemsByTag(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    itemTypeFilter?: string,
  ): Promise<z.infer<typeof toolSchemas.TagsQueryOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.findItemsByTag] RepositoryProvider not initialized');
      return { type: 'tags', tagId, items: [] };
    }

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const tagRepo = this.repositoryProvider.getTagRepository(clientProjectRoot);

    const items = await tagOps.findItemsByTagOp(
      mcpContext,
      repositoryName,
      branch,
      tagId,
      repositoryRepo,
      tagRepo,
      itemTypeFilter as any,
    );

    logger.info(
      `[GraphQueryService.findItemsByTag] Found ${items.items?.length || 0} items with tag ${tagId}`,
    );
    return { type: 'tags', tagId, items: items.items || [] };
  }

  async listAllNodeLabels(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
  ): Promise<z.infer<typeof toolSchemas.LabelsOutputSchema>> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[GraphQueryService.listAllNodeLabels] RepositoryProvider not initialized');
      return { labels: [], status: 'error', message: 'RepositoryProvider not initialized' };
    }
    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);

      // Get node table names from Kuzu
      const result = await kuzuClient.executeQuery('CALL show_tables() RETURN *');
      const labels = result.filter((row: any) => row.type === 'NODE').map((row: any) => row.name);

      logger.info(`[GraphQueryService.listAllNodeLabels] Found ${labels.length} node labels`);
      return {
        labels,
        status: 'complete',
        message: `Found ${labels.length} node labels`,
      };
    } catch (error: any) {
      logger.error(`[GraphQueryService.listAllNodeLabels] Error: ${error.message}`, {
        error: error.toString(),
      });
      return {
        labels: [],
        status: 'error',
        message: error.message || 'Failed to list node labels',
      };
    }
  }
}
