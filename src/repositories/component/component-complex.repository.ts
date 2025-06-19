import { KuzuDBClient } from '../../db/kuzu';
import { Component, ComponentStatus } from '../../types';
import { BaseComponentRepository } from '../base/base-component.repository';
import { RepositoryRepository } from '../repository.repository';

/**
 * Repository for complex Component operations
 * Handles advanced upsert operations with relationships and complex business logic
 */
export class ComponentComplexRepository extends BaseComponentRepository {

  /**
   * Upsert component with relationships using direct Cypher queries
   * This is a more complex version that handles all relationship management
   */
  async upsertComponentWithRelationships(component: {
    repository: string;
    branch?: string;
    id: string;
    name: string;
    kind: string;
    status: ComponentStatus;
    depends_on?: string[] | null;
  }): Promise<Component | null> {
    const repositoryNodeId = String(component.repository);
    const logicalRepositoryName = this.validateRepositoryNodeId(
      repositoryNodeId,
      'upsertComponentWithRelationships',
    );

    const componentBranch = component.branch || 'main';
    const componentId = component.id;
    // Step 1: Ensure repository and component node
    await this.ensureRepositoryAndComponentNode(
      repositoryNodeId,
      logicalRepositoryName,
      componentBranch,
      componentId,
      {
        name: component.name,
        kind: component.kind,
        status: component.status,
      },
    );

    // Step 2: Manage dependencies
    await this.manageDependencies(
      repositoryNodeId,
      logicalRepositoryName,
      componentBranch,
      componentId,
      component.depends_on,
    );

    // Step 3: Fetch and return the updated component
    return this.fetchUpdatedComponent(logicalRepositoryName, componentBranch, componentId);
  }

  /**
   * Ensure repository node exists and upsert component node
   */
  private async ensureRepositoryAndComponentNode(
    repositoryNodeId: string,
    logicalRepositoryName: string,
    componentBranch: string,
    componentId: string,
    component: {
      name: string;
      kind: string;
      status: ComponentStatus;
    },
  ): Promise<void> {
    const graphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, componentId);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const upsertNodeQuery = `
        MERGE (repo:Repository {id: $repositoryNodeId})
        ON CREATE SET repo.name = $repositoryNodeId, repo.created_at = timestamp($kuzuTimestamp)
        MERGE (c:Component {graph_unique_id: $graphUniqueId})
        ON CREATE SET
            c.id = $logicalId,
            c.branch = $componentBranch,
            c.name = $name,
            c.kind = $kind,
            c.status = $status,
            c.created_at = timestamp($kuzuTimestamp),
            c.updated_at = timestamp($kuzuTimestamp)
        ON MATCH SET
            c.name = $name,
            c.kind = $kind,
            c.status = $status,
            c.id = $logicalId,
            c.branch = $componentBranch,
            c.updated_at = timestamp($kuzuTimestamp)
        MERGE (c)-[:PART_OF]->(repo)
        RETURN c`;

    try {
      await this.executeQueryWithLogging(
        upsertNodeQuery,
        {
          repositoryNodeId,
          graphUniqueId,
          logicalId: componentId,
          componentBranch,
          name: component.name,
          kind: component.kind,
          status: component.status,
          kuzuTimestamp,
        },
        'upsertComponentWithRelationships-node',
      );
    } catch (error: any) {
      this.logger.error(
        `Error upserting component node ${componentId} in repo ${logicalRepositoryName} (branch: ${componentBranch}):`,
        error,
      );
      throw error;
    }
  }

  /**
   * Manage component dependencies
   */
  private async manageDependencies(
    repositoryNodeId: string,
    logicalRepositoryName: string,
    componentBranch: string,
    componentId: string,
    dependencies: string[] | null | undefined,
  ): Promise<void> {
    const graphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, componentId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    // Delete existing dependencies
    const deleteDepsQuery = `
        MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})-[r:DEPENDS_ON]->()
        DELETE r`;
    await this.executeQueryWithLogging(
      deleteDepsQuery,
      {},
      'upsertComponentWithRelationships-deleteDeps',
    );

    // Add new dependencies if provided
    if (dependencies && dependencies.length > 0) {
      for (const depId of dependencies) {
        await this.ensureDependencyNode(repositoryNodeId, logicalRepositoryName, componentBranch, depId);
        await this.createDependencyRelationship(
          logicalRepositoryName,
          componentBranch,
          componentId,
          depId,
        );
      }
    }
  }

  /**
   * Ensure dependency node exists
   */
  private async ensureDependencyNode(
    repositoryNodeId: string,
    logicalRepositoryName: string,
    componentBranch: string,
    depId: string,
  ): Promise<void> {
    const depGraphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, depId);
    const nowIso = new Date().toISOString();

    const ensureDepNodeQuery = `
            MERGE (repoDep:Repository {id: $repositoryNodeId})
            ON CREATE SET repoDep.name = $repositoryNodeId, repoDep.created_at = $depCreatedAt
            MERGE (dep:Component {graph_unique_id: $depGraphUniqueId})
            ON CREATE SET dep.id = $depId, dep.branch = $depBranch, dep.name = $depName, dep.kind = $depKind, dep.status = $depStatus, dep.repository = $repositoryNodeId, dep.created_at = $depCreatedAt, dep.updated_at = $depUpdatedAt
            MERGE (dep)-[:PART_OF]->(repoDep)`;

    await this.executeQueryWithLogging(
      ensureDepNodeQuery,
      {
        repositoryNodeId,
        depGraphUniqueId,
        depId,
        depBranch: componentBranch,
        depName: `Placeholder for ${depId}`,
        depKind: 'Unknown',
        depStatus: 'planned',
        depCreatedAt: nowIso,
        depUpdatedAt: nowIso,
      },
      'upsertComponentWithRelationships-ensureDep',
    );

    this.logger.debug(`Ensured/Created dependency node: ${depGraphUniqueId}`);
  }

  /**
   * Create dependency relationship between components
   */
  private async createDependencyRelationship(
    logicalRepositoryName: string,
    componentBranch: string,
    componentId: string,
    depId: string,
  ): Promise<void> {
    const graphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, componentId);
    const depGraphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, depId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);
    const escapedDepGraphUniqueId = this.escapeStr(depGraphUniqueId);

    // Verify both nodes exist before creating relationship
    const checkCQuery = `MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN c.id AS componentId`;
    const checkDQuery = `MATCH (d:Component {graph_unique_id: '${escapedDepGraphUniqueId}'}) RETURN d.id AS depId`;

    const cResult = await this.executeQueryWithLogging(
      checkCQuery,
      {},
      'upsertComponentWithRelationships-checkC',
    );
    const dResult = await this.executeQueryWithLogging(
      checkDQuery,
      {},
      'upsertComponentWithRelationships-checkD',
    );

    this.logger.debug(
      `Pre-CREATE check: Found parent c (${escapedGraphUniqueId})? ${cResult.length > 0}. Found dep d (${escapedDepGraphUniqueId})? ${dResult.length > 0}`,
    );

    // Create the dependency relationship
    const addDepRelQuery = `
            MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})
            MATCH (dep:Component {graph_unique_id: '${escapedDepGraphUniqueId}'})
            CREATE (c)-[r:DEPENDS_ON]->(dep) RETURN count(r)`;

    this.logger.debug(`Attempting DEPENDS_ON: ${escapedGraphUniqueId} -> ${escapedDepGraphUniqueId}`);

    const relCreateResult = await this.executeQueryWithLogging(
      addDepRelQuery,
      {},
      'upsertComponentWithRelationships-createRel',
    );

    this.logger.debug(
      `Executed CREATE for DEPENDS_ON, rows returned: ${relCreateResult.length}, content: ${JSON.stringify(relCreateResult)}`,
    );
  }

  /**
   * Fetch the updated component with dependencies
   */
  private async fetchUpdatedComponent(
    logicalRepositoryName: string,
    componentBranch: string,
    componentId: string,
  ): Promise<Component | null> {
    const graphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, componentId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    // Return the updated component by finding it again
    const findQuery = `MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN c LIMIT 1`;
    const findResult = await this.executeQueryWithLogging(
      findQuery,
      {},
      'upsertComponentWithRelationships-find',
    );

    if (findResult.length === 0) {
      return null;
    }

    const componentNode = findResult[0]?.c;
    if (!componentNode) {
      return null;
    }

    // Get component data and dependencies
    const componentData = this.formatKuzuRowToComponent(
      componentNode,
      logicalRepositoryName,
      componentBranch,
    );

    // Get dependencies
    const depsQuery = `
      MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})-[:DEPENDS_ON]->(dep:Component)
      RETURN dep.id as depId
    `;

    const depsResult = await this.executeQueryWithLogging(
      depsQuery,
      {},
      'upsertComponentWithRelationships-getDeps',
    );

    componentData.depends_on = depsResult.length > 0 ? depsResult.map((dep: any) => dep.depId) : [];

    return componentData;
  }
}
