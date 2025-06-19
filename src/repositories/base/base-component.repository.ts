import { KuzuDBClient } from '../../db/kuzu';
import { Component } from '../../types';
import { formatGraphUniqueId } from '../../utils/id.utils';
import { loggers } from '../../utils/logger';
import { RepositoryRepository } from '../repository.repository';

/**
 * Base repository class for Component operations
 * Provides common functionality and utilities for all component repositories
 */
export abstract class BaseComponentRepository {
  protected kuzuClient: KuzuDBClient;
  protected repositoryRepo: RepositoryRepository;
  protected logger = loggers.repository();

  constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    if (!kuzuClient) {
      throw new Error('BaseComponentRepository requires an initialized KuzuDBClient instance.');
    }
    if (!repositoryRepo) {
      throw new Error('BaseComponentRepository requires an initialized RepositoryRepository instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  /**
   * Helper to escape strings for Cypher queries to prevent injection
   */
  protected escapeStr(value: string): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/'/g, "\\'");
  }

  /**
   * Helper to format Kuzu component data to internal Component type
   */
  protected formatKuzuRowToComponent(
    kuzuRowData: any,
    repositoryName: string,
    branch: string,
  ): Component {
    const rawComponent = kuzuRowData.properties || kuzuRowData;
    const logicalId = rawComponent.id?.toString();
    return {
      id: logicalId,
      name: rawComponent.name,
      kind: rawComponent.kind,
      status: rawComponent.status,
      branch: rawComponent.branch,
      repository: `${repositoryName}:${branch}`,
      depends_on: Array.isArray(rawComponent.depends_on)
        ? rawComponent.depends_on.map(String)
        : rawComponent.depends_on
          ? [String(rawComponent.depends_on)]
          : [],
      created_at: rawComponent.created_at ? new Date(rawComponent.created_at) : new Date(),
      updated_at: rawComponent.updated_at ? new Date(rawComponent.updated_at) : new Date(),
    } as Component;
  }

  /**
   * Helper to create graph unique ID for components
   */
  protected createGraphUniqueId(repositoryName: string, branch: string, componentId: string): string {
    return formatGraphUniqueId(repositoryName, branch, componentId);
  }

  /**
   * Helper to ensure graph projection exists for algorithms
   */
  protected async ensureGraphProjection(projectionName: string): Promise<void> {
    try {
      // First check if the graph projection exists
      const checkQuery = `CALL show_graphs() RETURN name;`;
      const checkResult = await this.kuzuClient.executeQuery(checkQuery);
      const existingGraphs = checkResult.map((row: any) => row.name);

      if (!existingGraphs.includes(projectionName)) {
        // Create the graph projection if it doesn't exist
        await this.kuzuClient.executeQuery(
          `CALL create_graph('${projectionName}', ['Component'], ['DEPENDS_ON']);`,
        );
        this.logger.debug(`Created graph projection '${projectionName}'.`);
      } else {
        this.logger.debug(`Graph projection '${projectionName}' already exists.`);
      }
    } catch (projectionError: any) {
      this.logger.error(
        `Could not ensure graph projection '${projectionName}'. Error:`,
        projectionError,
      );
      throw projectionError;
    }
  }

  /**
   * Helper to handle query results that may be arrays or objects with getAll method
   */
  protected async normalizeQueryResult(result: any): Promise<any[]> {
    if (!result) {
      return [];
    }

    if (Array.isArray(result)) {
      return result;
    }

    if (typeof result.getAll === 'function') {
      return await result.getAll();
    }

    // Handle cases where a single object might be returned
    return [result];
  }

  /**
   * Helper to execute query with error handling and logging
   */
  protected async executeQueryWithLogging(
    query: string,
    params: any = {},
    operation: string,
  ): Promise<any[]> {
    try {
      this.logger.debug(`[${operation}] Executing query: ${query}`, { params });
      const result = await this.kuzuClient.executeQuery(query, params);
      return await this.normalizeQueryResult(result);
    } catch (error: any) {
      this.logger.error(`[${operation}] Query execution failed:`, {
        error: error.message,
        query,
        params,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Helper to validate repository node ID format
   */
  protected validateRepositoryNodeId(repositoryNodeId: string, operation: string): string {
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 2) {
      const error = `Invalid repositoryNodeId format: ${repositoryNodeId} in ${operation}`;
      this.logger.error(error);
      throw new Error(error);
    }
    return repoIdParts[0]; // Return logical repository name
  }
}
