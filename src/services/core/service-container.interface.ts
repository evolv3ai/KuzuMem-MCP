import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { SnapshotService } from '../snapshot.service';

/**
 * Service container interface for dependency injection
 * Eliminates circular dependencies by providing service access through interfaces
 */
export interface IServiceContainer {
  // Core infrastructure services
  getRepositoryProvider(): RepositoryProvider;
  getKuzuClient(mcpContext: ToolHandlerContext, clientProjectRoot: string): Promise<KuzuDBClient>;
  getSnapshotService(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
  ): Promise<SnapshotService>;

  // Domain service access methods (lazy-loaded)
  getMetadataService(): Promise<IMetadataService>;
  getEntityService(): Promise<IEntityService>;
  getContextService(): Promise<IContextService>;
  getGraphQueryService(): Promise<IGraphQueryService>;
  getGraphAnalysisService(): Promise<IGraphAnalysisService>;

  // Lifecycle management
  shutdown(): Promise<void>;
}

/**
 * Service interfaces to break circular dependencies
 */
export interface IMetadataService {
  updateMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    metadataContent: any,
    branch?: string,
  ): Promise<{ success: boolean; message?: string } | null>;

  getMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch?: string,
  ): Promise<any>;
}

export interface IEntityService {
  // Component operations
  upsertComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentData: any,
  ): Promise<any>;
  getComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  updateComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    updates: any,
  ): Promise<any>;
  deleteComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<boolean>;

  // Decision operations
  upsertDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionData: any,
  ): Promise<any>;
  getDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<any>;
  updateDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
    updates: any,
  ): Promise<any>;
  deleteDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<boolean>;

  // Rule operations
  upsertRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    rule: any,
    branch?: string,
  ): Promise<any>;
  getRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<any>;
  updateRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
    updates: any,
  ): Promise<any>;
  deleteRule(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    ruleId: string,
  ): Promise<boolean>;

  // File operations
  addFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileData: any,
  ): Promise<any>;
  getFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<any>;
  deleteFile(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    fileId: string,
  ): Promise<boolean>;

  // Tag operations
  addTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagData: any,
  ): Promise<any>;
  getTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<any>;
  deleteTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
  ): Promise<boolean>;

  // Additional operations
  deleteContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    contextId: string,
  ): Promise<boolean>;
  associateFileWithComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    fileId: string,
  ): Promise<any>;
  tagItem(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: string,
    tagId: string,
  ): Promise<any>;

  // Bulk operations
  bulkDeleteByType(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityType: string,
    options?: any,
  ): Promise<any>;
  bulkDeleteByTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    options?: any,
  ): Promise<any>;
  bulkDeleteByBranch(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    targetBranch: string,
    options?: any,
  ): Promise<any>;
  bulkDeleteByRepository(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    options?: any,
  ): Promise<any>;
}

export interface IContextService {
  updateContext(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;

  getLatestContexts(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch?: string,
    limit?: number,
  ): Promise<any>;
}

export interface IGraphQueryService {
  // Active components query
  getActiveComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch?: string,
  ): Promise<any>;

  countNodesByLabel(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    nodeLabel: string,
  ): Promise<any>;
  listNodesByLabel(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    nodeLabel: string,
    limit?: number,
    offset?: number,
  ): Promise<any>;
  getRelatedItems(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    opParams: any,
  ): Promise<any>;
  getComponentDependencies(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  getComponentDependents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  getGoverningItemsForComponent(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<any>;
  getItemContextualHistory(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: string,
  ): Promise<any>;
  findItemsByTag(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    tagId: string,
    entityType?: string,
  ): Promise<any>;
  listAllNodeLabels(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
  ): Promise<any>;
  getNodeProperties(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    nodeLabel: string,
  ): Promise<any>;
  listAllIndexes(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    target?: string,
  ): Promise<any>;
}

export interface IGraphAnalysisService {
  pageRank(mcpContext: ToolHandlerContext, clientProjectRoot: string, params: any): Promise<any>;
  kCoreDecomposition(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  louvainCommunityDetection(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  shortestPath(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  getStronglyConnectedComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
  getWeaklyConnectedComponents(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    params: any,
  ): Promise<any>;
}
