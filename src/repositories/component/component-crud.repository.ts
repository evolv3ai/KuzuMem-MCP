import { Component, ComponentInput, ComponentStatus } from '../../types';
import { BaseComponentRepository } from '../base/base-component.repository';

/**
 * Repository for basic Component CRUD operations
 * Handles create, read, update, delete operations for components
 */
export class ComponentCrudRepository extends BaseComponentRepository {
  /**
   * Get all active components for a specific repository and branch
   */
  async getActiveComponents(
    repositoryNodeId: string,
    componentBranch: string,
  ): Promise<Component[]> {
    const query = `
      MATCH (r:Repository {id: $repositoryNodeId})<-[:PART_OF]-(c:Component)
      WHERE c.status = $status AND c.branch = $componentBranch 
      RETURN c ORDER BY c.name ASC
    `;
    const params = { repositoryNodeId, status: 'active', componentBranch };

    try {
      const result = await this.executeQueryWithLogging(query, params, 'getActiveComponents');
      if (result.length === 0) {
        return [];
      }
      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      return result.map((row: any) =>
        this.formatKuzuRowToComponent(row.c, repoNameFromNodeId, componentBranch),
      );
    } catch (error: any) {
      this.logger.error(
        `Error in getActiveComponents for ${repositoryNodeId}, branch ${componentBranch}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Find a component by its logical ID and branch, within a given repository context
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Component | null> {
    const graphUniqueId = this.createGraphUniqueId(repositoryName, itemBranch, itemId);

    try {
      // Step 1: Get the basic component info
      const query = `MATCH (c:Component {graph_unique_id: $graphUniqueId}) RETURN c LIMIT 1`;
      const result = await this.executeQueryWithLogging(
        query,
        { graphUniqueId },
        'findByIdAndBranch',
      );

      if (result.length === 0) {
        this.logger.debug(`Component not found for GID: ${graphUniqueId}`);
        return null;
      }

      const componentNode = result[0]?.c;
      if (!componentNode) {
        this.logger.debug(`Component result format invalid for GID: ${graphUniqueId}`);
        return null;
      }

      // Get component data from the basic result
      const componentData = this.formatKuzuRowToComponent(
        componentNode,
        repositoryName,
        itemBranch,
      );

      // Step 2: Get the component's dependencies
      const depsQuery = `
        MATCH (c:Component {graph_unique_id: $graphUniqueId})-[:DEPENDS_ON]->(dep:Component)
        RETURN dep.id as depId
      `;

      const depsResult = await this.executeQueryWithLogging(
        depsQuery,
        { graphUniqueId },
        'findByIdAndBranch-dependencies',
      );

      // Update the dependencies
      componentData.depends_on =
        depsResult.length > 0 ? depsResult.map((dep: any) => dep.depId) : [];

      this.logger.debug(`Found ${depsResult.length} dependencies for ${graphUniqueId}`);

      return componentData;
    } catch (error: any) {
      this.logger.error(`Error in findByIdAndBranch for GID ${graphUniqueId}:`, error);
      return null;
    }
  }

  /**
   * Update component status
   */
  async updateComponentStatus(
    repositoryName: string,
    itemId: string,
    branch: string,
    status: ComponentStatus,
  ): Promise<Component | null> {
    const graphUniqueId = this.createGraphUniqueId(repositoryName, branch, itemId);
    const now = new Date();

    const query = `
      MATCH (c:Component {graph_unique_id: $graphUniqueId})
      SET c.status = $status, c.updated_at = $updatedAt
      RETURN c
    `;

    const params = {
      graphUniqueId,
      status,
      updatedAt: now,
    };

    try {
      const result = await this.executeQueryWithLogging(query, params, 'updateComponentStatus');

      if (result.length > 0 && result[0].c) {
        this.logger.info(`Status updated for component ${graphUniqueId} to ${status}`);
        return this.formatKuzuRowToComponent(result[0].c, repositoryName, branch);
      } else {
        this.logger.warn(
          `Component ${graphUniqueId} not found or status update failed to return node.`,
        );
        return this.findByIdAndBranch(repositoryName, itemId, branch);
      }
    } catch (error: any) {
      this.logger.error(
        `Error executing updateComponentStatus for ${graphUniqueId} to status ${status}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Upsert a component with basic information
   */
  async upsertComponent(
    repositoryNodeId: string,
    component: ComponentInput,
  ): Promise<Component | null> {
    const logicalRepositoryName = this.validateRepositoryNodeId(
      repositoryNodeId,
      'upsertComponent',
    );
    const componentId = String(component.id);
    const componentBranch = String(component.branch || 'main');
    const graphUniqueId = this.createGraphUniqueId(
      logicalRepositoryName,
      componentBranch,
      componentId,
    );
    const now = new Date();

    try {
      const result = await this.kuzuClient.transaction(async (tx) => {
        // Atomic MERGE query that includes PART_OF relationship creation
        const upsertNodeQuery = `
          MERGE (repo:Repository {id: $repository})
          ON CREATE SET repo.name = $repository, repo.created_at = $now
          MERGE (c:Component {id: $componentId, graph_unique_id: $graphUniqueId})
          ON CREATE SET
            c.name = $name,
            c.kind = $kind,
            c.status = $status,
            c.branch = $branch,
            c.repository = $repository,
            c.created_at = $createdAt,
            c.updated_at = $now
          ON MATCH SET
            c.name = $name,
            c.kind = $kind,
            c.status = $status,
            c.branch = $branch,
            c.repository = $repository,
            c.created_at = $createdAt,
            c.updated_at = $now
          MERGE (c)-[:PART_OF]->(repo)
        `;
        await tx.executeQuery(upsertNodeQuery, {
          graphUniqueId,
          componentId,
          name: component.name,
          kind: component.kind || 'Unknown',
          status: component.status || 'active',
          branch: componentBranch,
          repository: repositoryNodeId,
          now: now,
          createdAt: component.created_at ? new Date(component.created_at) : now,
        });

        // Handle dependencies
        if (component.depends_on && component.depends_on.length > 0) {
          // First, delete existing dependencies for this component
          await tx.executeQuery(
            'MATCH (c:Component {graph_unique_id: $graphUniqueId})-[r:DEPENDS_ON]->() DELETE r',
            { graphUniqueId },
          );

          for (const depId of component.depends_on) {
            const depGraphUniqueId = this.createGraphUniqueId(
              logicalRepositoryName,
              componentBranch,
              depId,
            );
            // Ensure dependency node exists (as a placeholder if needed)
            await tx.executeQuery(
              `MERGE (dep:Component {graph_unique_id: $depGraphUniqueId}) ON CREATE SET dep.id = $depId, dep.name = $depName, dep.status = 'planned', dep.branch = $branch`,
              {
                depGraphUniqueId,
                depId,
                depName: `Placeholder for ${depId}`,
                branch: componentBranch,
              },
            );

            // Create the new dependency relationship
            await tx.executeQuery(
              'MATCH (c:Component {graph_unique_id: $cId}), (d:Component {graph_unique_id: $dId}) MERGE (c)-[:DEPENDS_ON]->(d)',
              { cId: graphUniqueId, dId: depGraphUniqueId },
            );
          }
        }

        return true;
      });

      if (result) {
        return this.findByIdAndBranch(logicalRepositoryName, componentId, componentBranch);
      }
      return null;
    } catch (error: any) {
      this.logger.error(`ERROR in upsertComponent for ${graphUniqueId}:`, error);
      throw error;
    }
  }
}
