// Main orchestrator for graph operations using specialized services
import { KuzuDBClient } from '../../db/kuzu';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { RepositoryRepository } from '../../repositories';

// Import specialized services
import { GraphAlgorithmService } from './services/graph-algorithm.service';
import { GraphContextService } from './services/graph-context.service';
import { GraphGovernanceService } from './services/graph-governance.service';
import { GraphProjectionManager } from './services/graph-projection-manager';
import { GraphRelationshipService } from './services/graph-relationship.service';

// Re-export types from base for backward compatibility
export type {
  ConnectedComponentsParams,
  ConnectedComponentsResult,
  ContextResult,
  GetGoverningItemsParams,
  GetItemContextualHistoryParams,
  GetRelatedItemsParams,
  GoverningItemsResult,
  GraphOperationParams,
  KCoreParams,
  KCoreResult,
  LouvainParams,
  LouvainResult,
  PageRankParams,
  PageRankResult,
  ProjectedGraphParams,
  RelatedItem,
  RelatedItemsResult,
  ShortestPathParams,
  ShortestPathResult,
} from './base/base-graph-operations';

/**
 * Main graph operations orchestrator
 * Delegates to specialized services for different types of graph operations
 */
class GraphOperationsOrchestrator {
  private contextService: GraphContextService;
  private governanceService: GraphGovernanceService;
  private relationshipService: GraphRelationshipService;
  private algorithmService: GraphAlgorithmService;
  private projectionManager: GraphProjectionManager;

  constructor(kuzuClient: KuzuDBClient, repositoryRepo?: RepositoryRepository) {
    this.contextService = new GraphContextService(kuzuClient, repositoryRepo);
    this.governanceService = new GraphGovernanceService(kuzuClient, repositoryRepo);
    this.relationshipService = new GraphRelationshipService(kuzuClient, repositoryRepo);
    this.algorithmService = new GraphAlgorithmService(kuzuClient, repositoryRepo);
    this.projectionManager = new GraphProjectionManager(kuzuClient, repositoryRepo);
  }

  // === Context Operations - Delegated to GraphContextService ===

  async getItemContextualHistory(mcpContext: ToolHandlerContext, params: any) {
    return this.contextService.getItemContextualHistory(mcpContext, params);
  }

  // === Governance Operations - Delegated to GraphGovernanceService ===

  async getGoverningItemsForComponent(mcpContext: ToolHandlerContext, params: any) {
    return this.governanceService.getGoverningItemsForComponent(mcpContext, params);
  }

  // === Relationship Operations - Delegated to GraphRelationshipService ===

  async getRelatedItems(mcpContext: ToolHandlerContext, params: any) {
    return this.relationshipService.getRelatedItems(mcpContext, params);
  }

  // === Algorithm Operations - Delegated to GraphAlgorithmService ===

  async executePageRank(mcpContext: ToolHandlerContext, params: any) {
    return this.algorithmService.executePageRank(mcpContext, params);
  }

  async executeKCoreDecomposition(mcpContext: ToolHandlerContext, params: any) {
    return this.algorithmService.executeKCoreDecomposition(mcpContext, params);
  }

  async executeLouvainCommunityDetection(mcpContext: ToolHandlerContext, params: any) {
    return this.algorithmService.executeLouvainCommunityDetection(mcpContext, params);
  }

  async executeStronglyConnectedComponents(mcpContext: ToolHandlerContext, params: any) {
    return this.algorithmService.executeStronglyConnectedComponents(mcpContext, params);
  }

  async executeWeaklyConnectedComponents(mcpContext: ToolHandlerContext, params: any) {
    return this.algorithmService.executeWeaklyConnectedComponents(mcpContext, params);
  }

  async executeShortestPath(mcpContext: ToolHandlerContext, params: any) {
    return this.algorithmService.executeShortestPath(mcpContext, params);
  }

  // === Projection Management - Delegated to GraphProjectionManager ===

  async withProjectedGraph<T>(
    mcpContext: ToolHandlerContext,
    projectionName: string,
    nodeTables: string[],
    relTables: string[],
    callback: () => Promise<T>,
  ) {
    return this.projectionManager.withProjectedGraph(
      mcpContext,
      projectionName,
      nodeTables,
      relTables,
      callback,
    );
  }
}

// Create a singleton orchestrator instance
let orchestrator: GraphOperationsOrchestrator | null = null;

function getOrchestrator(
  kuzuClient: KuzuDBClient,
  repositoryRepo?: RepositoryRepository,
): GraphOperationsOrchestrator {
  if (!orchestrator) {
    orchestrator = new GraphOperationsOrchestrator(kuzuClient, repositoryRepo);
  }
  return orchestrator;
}

// === Legacy Function Exports for Backward Compatibility ===

/**
 * Retrieves the contextual history for a given item.
 * @deprecated Use GraphContextService.getItemContextualHistory() instead
 */
export async function getItemContextualHistoryOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
  repositoryRepo?: RepositoryRepository,
): Promise<any[]> {
  const orchestrator = getOrchestrator(kuzuClient, repositoryRepo);
  return orchestrator.getItemContextualHistory(mcpContext, params);
}

/**
 * Retrieves governing items (decisions, rules) for a component.
 * @deprecated Use GraphGovernanceService.getGoverningItemsForComponent() instead
 */
export async function getGoverningItemsForComponentOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.getGoverningItemsForComponent(mcpContext, params);
}

/**
 * Retrieves related items within a certain number of hops in the graph.
 * @deprecated Use GraphRelationshipService.getRelatedItems() instead
 */
export async function getRelatedItemsOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.getRelatedItems(mcpContext, params);
}

/**
 * Executes K-Core Decomposition algorithm.
 * @deprecated Use GraphAlgorithmService.executeKCoreDecomposition() instead
 */
export async function kCoreDecompositionOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.executeKCoreDecomposition(mcpContext, params);
}

/**
 * Executes PageRank algorithm.
 * @deprecated Use GraphAlgorithmService.executePageRank() instead
 */
export async function pageRankOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.executePageRank(mcpContext, params);
}

/**
 * Executes Louvain Community Detection algorithm.
 * @deprecated Use GraphAlgorithmService.executeLouvainCommunityDetection() instead
 */
export async function louvainCommunityDetectionOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.executeLouvainCommunityDetection(mcpContext, params);
}

/**
 * Executes Strongly Connected Components algorithm.
 * @deprecated Use GraphAlgorithmService.executeStronglyConnectedComponents() instead
 */
export async function stronglyConnectedComponentsOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.executeStronglyConnectedComponents(mcpContext, params);
}

/**
 * Executes Weakly Connected Components algorithm.
 * @deprecated Use GraphAlgorithmService.executeWeaklyConnectedComponents() instead
 */
export async function weaklyConnectedComponentsOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.executeWeaklyConnectedComponents(mcpContext, params);
}

/**
 * Executes Shortest Path algorithm.
 * @deprecated Use GraphAlgorithmService.executeShortestPath() instead
 */
export async function shortestPathOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  params: any,
): Promise<any> {
  const orchestrator = getOrchestrator(kuzuClient);
  return orchestrator.executeShortestPath(mcpContext, params);
}
