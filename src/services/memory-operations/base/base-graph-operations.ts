import { KuzuDBClient } from '../../../db/kuzu';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';
import { RepositoryRepository } from '../../../repositories';
import { Decision, Rule } from '../../../types';

// Common types
export interface GraphOperationParams {
  clientProjectRoot: string;
  repository: string;
  branch: string;
}

// Contextual History
export interface GetItemContextualHistoryParams extends GraphOperationParams {
  itemId: string;
  itemType: 'Component' | 'Decision' | 'Rule';
}

export interface ContextResult {
  id: string;
  name: string | null;
  summary: string | null;
  iso_date: string;
  created_at: string | null;
  updated_at: string | null;
  agent: string | null;
  issue: string | null;
  decision_ids: string[];
  observation_ids: string[];
  repository: string;
  branch: string;
}

// Governing Items
export interface GetGoverningItemsParams extends GraphOperationParams {
  componentId: string;
}

export interface GoverningItemsResult {
  status: 'complete' | 'error';
  decisions: Decision[];
  rules: Rule[];
  message: string;
}

// Related Items
export interface GetRelatedItemsParams extends GraphOperationParams {
  startItemId: string;
  depth?: number;
  relationshipFilter?: string;
  targetNodeTypeFilter?: string;
}

export interface RelatedItem {
  id: string;
  name: string;
  type: string;
  distance: number;
  repository: string;
  branch: string;
}

export interface RelatedItemsResult {
  status: 'complete' | 'error';
  relatedItems: RelatedItem[];
  message: string;
}

// Algorithm common types
export interface ProjectedGraphParams extends GraphOperationParams {
  projectedGraphName: string;
  nodeTableNames: string[];
  relationshipTableNames: string[];
}

// PageRank
export interface PageRankParams extends ProjectedGraphParams {
  dampingFactor?: number;
  maxIterations?: number;
}

export interface PageRankResult {
  ranks: Array<{
    nodeId: string;
    score: number;
  }>;
  error?: string;
}

// K-Core Decomposition
export interface KCoreParams extends ProjectedGraphParams {
  k: number;
}

export interface KCoreResult {
  k: number;
  components: Array<{
    nodeId: string;
    coreness: number;
  }>;
  error?: string;
}

// Community Detection
export interface LouvainParams extends ProjectedGraphParams {}

export interface LouvainResult {
  communities: Array<{
    nodeId: string;
    communityId: number;
  }>;
  error?: string;
}

// Connected Components
export interface ConnectedComponentsParams extends ProjectedGraphParams {}

export interface ConnectedComponentsResult {
  components: Array<{
    nodeId: string;
    componentId: number;
  }>;
}

// Shortest Path
export interface ShortestPathParams extends ProjectedGraphParams {
  startNodeId: string;
  endNodeId: string;
}

export interface ShortestPathResult {
  type: string;
  pathFound: boolean;
  path: any[];
  pathLength: number;
  startNodeId: string;
  endNodeId: string;
  projectedGraphName: string;
  error?: string;
}

/**
 * Base class for graph operations
 * Provides common utilities and type definitions for graph-based services
 */
export abstract class BaseGraphOperations {
  protected kuzuClient: KuzuDBClient;
  protected repositoryRepo?: RepositoryRepository;

  constructor(kuzuClient: KuzuDBClient, repositoryRepo?: RepositoryRepository) {
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  /**
   * Shared helper for timestamp parsing
   */
  protected parseTimestamp(value: any): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'number') {
      // Kuzu often returns microseconds
      return new Date(value / 1000).toISOString();
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    return null;
  }

  /**
   * Create repository ID from repository and branch
   */
  protected createRepoId(repository: string, branch: string): string {
    return `${repository}:${branch}`;
  }

  /**
   * Create component graph ID from repository, branch, and component ID
   */
  protected createComponentGraphId(repository: string, branch: string, componentId: string): string {
    return `${repository}:${branch}:${componentId}`;
  }

  /**
   * Validate repository exists if repository repo is available
   */
  protected async validateRepository(
    mcpContext: EnrichedRequestHandlerExtra,
    repository: string,
    branch: string,
  ): Promise<boolean> {
    if (!this.repositoryRepo) {
      return true; // Skip validation if no repository repo available
    }

    const repoNode = await this.repositoryRepo.findByName(repository, branch);
    if (!repoNode) {
      mcpContext.logger.warn(
        `[graph.ops] Repository ${repository}:${branch} not found for operation.`,
      );
      return false;
    }
    return true;
  }

  /**
   * Create operation logger with context
   */
  protected createOperationLogger(
    mcpContext: EnrichedRequestHandlerExtra,
    operation: string,
    params: any,
  ) {
    // Create a simple logger object since mcpContext.logger might not have child method
    return {
      info: (message: string, meta?: any) => mcpContext.logger.info(`[graph.ops.${operation}] ${message}`, meta),
      debug: (message: string, meta?: any) => mcpContext.logger.debug(`[graph.ops.${operation}] ${message}`, meta),
      warn: (message: string, meta?: any) => mcpContext.logger.warn(`[graph.ops.${operation}] ${message}`, meta),
      error: (message: string, meta?: any) => mcpContext.logger.error(`[graph.ops.${operation}] ${message}`, meta),
    };
  }
}
