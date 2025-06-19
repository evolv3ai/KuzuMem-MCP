import { KuzuDBClient } from '../../db/kuzu';
import { Component, ComponentStatus } from '../../types';
import { BaseComponentRepository } from '../base/base-component.repository';
import { RepositoryRepository } from '../repository.repository';

/**
 * Repository for complex Component operations
 * Handles advanced upsert operations with relationships and complex business logic
 */
export class ComponentComplexRepository extends BaseComponentRepository {
  constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    super(kuzuClient, repositoryRepo);
  }

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
    const logicalRepositoryName = this.validateRepositoryNodeId(repositoryNodeId, 'upsertComponentWithRelationships');

    const componentBranch = component.branch || 'main';
    const componentId = component.id;
    const graphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, componentId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const escapedName = this.escapeStr(component.name);
    const escapedKind = this.escapeStr(component.kind);
    const escapedStatus = this.escapeStr(component.status);
    const escapedLogicalId = this.escapeStr(componentId);
    const escapedComponentBranch = this.escapeStr(componentBranch);

    const upsertNodeQuery = `
        MERGE (repo:Repository {id: '${this.escapeStr(repositoryNodeId)}'})
        ON CREATE SET repo.name = '${this.escapeStr(repositoryNodeId)}', repo.created_at = timestamp('${kuzuTimestamp}')
        MERGE (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})
        ON CREATE SET 
            c.id = '${escapedLogicalId}',
            c.branch = '${escapedComponentBranch}',
            c.name = '${escapedName}',
            c.kind = '${escapedKind}',
            c.status = '${escapedStatus}',
            c.created_at = timestamp('${kuzuTimestamp}'),
            c.updated_at = timestamp('${kuzuTimestamp}')
        ON MATCH SET 
            c.name = '${escapedName}',
            c.kind = '${escapedKind}',
            c.status = '${escapedStatus}',
            c.id = '${escapedLogicalId}',        
            c.branch = '${escapedComponentBranch}',
            c.updated_at = timestamp('${kuzuTimestamp}')
        MERGE (c)-[:PART_OF]->(repo)
        RETURN c`;

    try {
      await this.executeQueryWithLogging(upsertNodeQuery, {}, 'upsertComponentWithRelationships-node');
    } catch (error: any) {
      this.logger.error(
        `Error upserting component node ${componentId} in repo ${logicalRepositoryName} (branch: ${componentBranch}):`,
        error,
      );
      throw error;
    }

    // Delete existing dependencies
    const deleteDepsQuery = `
        MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'})-[r:DEPENDS_ON]->()
        DELETE r`;
    await this.executeQueryWithLogging(deleteDepsQuery, {}, 'upsertComponentWithRelationships-deleteDeps');

    // Add new dependencies if provided
    if (component.depends_on && component.depends_on.length > 0) {
      for (const depId of component.depends_on) {
        const depGraphUniqueId = this.createGraphUniqueId(logicalRepositoryName, componentBranch, depId);
        const escapedDepGraphUniqueId = this.escapeStr(depGraphUniqueId);

        // Ensure dependency node exists
        const ensureDepNodeQuery = `
            MERGE (repoDep:Repository {id: $repositoryNodeId})
            ON CREATE SET repoDep.name = $repositoryNodeId, repoDep.created_at = $depCreatedAt
            MERGE (dep:Component {graph_unique_id: $depGraphUniqueId})
            ON CREATE SET dep.id = $depId, dep.branch = $depBranch, dep.name = $depName, dep.kind = $depKind, dep.status = $depStatus, dep.repository = $repositoryNodeId, dep.created_at = $depCreatedAt, dep.updated_at = $depUpdatedAt
            MERGE (dep)-[:PART_OF]->(repoDep)`;

        await this.executeQueryWithLogging(ensureDepNodeQuery, {
          repositoryNodeId,
          depGraphUniqueId,
          depId,
          depBranch: componentBranch,
          depName: `Placeholder for ${depId}`,
          depKind: 'Unknown',
          depStatus: 'planned',
          depCreatedAt: nowIso,
          depUpdatedAt: nowIso,
        }, 'upsertComponentWithRelationships-ensureDep');

        this.logger.debug(
          `Ensured/Created dependency node: ${escapedDepGraphUniqueId}`,
        );

        // Verify both nodes exist before creating relationship
        const checkCQuery = `MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN c.id AS componentId`;
        const checkDQuery = `MATCH (d:Component {graph_unique_id: '${escapedDepGraphUniqueId}'}) RETURN d.id AS depId`;
        
        const cResult = await this.executeQueryWithLogging(checkCQuery, {}, 'upsertComponentWithRelationships-checkC');
        const dResult = await this.executeQueryWithLogging(checkDQuery, {}, 'upsertComponentWithRelationships-checkD');
        
        this.logger.debug(
          `Pre-CREATE check: Found parent c (${escapedGraphUniqueId})? ${cResult.length > 0}. Found dep d (${escapedDepGraphUniqueId})? ${dResult.length > 0}`,
        );

        // Create the dependency relationship
        const addDepRelQuery = `
            MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) 
            MATCH (dep:Component {graph_unique_id: '${escapedDepGraphUniqueId}'})
            CREATE (c)-[r:DEPENDS_ON]->(dep) RETURN count(r)`;

        this.logger.debug(
          `Attempting DEPENDS_ON: ${escapedGraphUniqueId} -> ${escapedDepGraphUniqueId}`,
        );
        
        const relCreateResult = await this.executeQueryWithLogging(
          addDepRelQuery, 
          {}, 
          'upsertComponentWithRelationships-createRel'
        );
        
        this.logger.debug(
          `Executed CREATE for DEPENDS_ON, rows returned: ${relCreateResult.length}, content: ${JSON.stringify(relCreateResult)}`,
        );
      }
    }

    // Return the updated component by finding it again
    // We need to import the CRUD repository method here or duplicate the logic
    // For now, let's duplicate the basic find logic
    const findQuery = `MATCH (c:Component {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN c LIMIT 1`;
    const findResult = await this.executeQueryWithLogging(findQuery, {}, 'upsertComponentWithRelationships-find');

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

    componentData.depends_on = depsResult.length > 0
      ? depsResult.map((dep: any) => dep.depId)
      : [];

    return componentData;
  }
}
