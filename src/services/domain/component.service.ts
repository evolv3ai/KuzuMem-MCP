import { z } from 'zod';
import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import { Component, ComponentStatus } from '../../types';
import * as componentOps from '../memory-operations/component.ops';
import { SnapshotService } from '../snapshot.service';
import { BaseEntityService } from './base-entity.service';

/**
 * Service for Component entity operations
 * Handles CRUD operations and business logic for components
 */
export class ComponentService extends BaseEntityService {
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
   * Create or update a component
   */
  async upsertComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentData: {
      id: string;
      name: string;
      kind?: string;
      status?: ComponentStatus;
      depends_on?: string[];
    },
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    this.validateRepositoryProvider('upsertComponent');

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);

    // Construct the data object expected by componentOps.upsertComponentOp
    const componentOpData = {
      ...componentData,
      repository: repositoryName,
      branch: branch,
    };

    return componentOps.upsertComponentOp(
      mcpContext,
      repositoryName,
      branch,
      componentOpData,
      repositoryRepo,
      componentRepo,
    ) as Promise<Component | null>;
  }

  /**
   * Get a component by ID
   */
  async getComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<Component | null> {
    return this.getEntityById<Component>(
      mcpContext,
      clientProjectRoot,
      repositoryName,
      branch,
      componentId,
      'component',
      'getComponent',
    );
  }

  /**
   * Update an existing component
   */
  async updateComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    updates: Partial<Omit<Component, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Component | null> {
    const logger = mcpContext.logger || console;
    this.validateRepositoryProvider('updateComponent');

    try {
      // First check if component exists
      const existing = await this.getComponent(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        componentId,
      );
      if (!existing) {
        logger.warn(`[ComponentService.updateComponent] Component ${componentId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        id: componentId,
        name: existing.name,
        kind:
          updates.kind !== undefined
            ? updates.kind === null
              ? undefined
              : updates.kind
            : existing.kind === null
              ? undefined
              : existing.kind,
        depends_on:
          updates.depends_on !== undefined
            ? updates.depends_on === null
              ? undefined
              : updates.depends_on
            : existing.depends_on === null
              ? undefined
              : existing.depends_on,
        status:
          updates.status !== undefined
            ? updates.status === null
              ? undefined
              : updates.status
            : existing.status === null
              ? undefined
              : existing.status,
      };

      return await this.upsertComponent(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData,
      );
    } catch (error: any) {
      this.handleEntityError(error, 'updateComponent', 'component', componentId, logger);
      throw error;
    }
  }

  /**
   * Delete a component
   */
  async deleteComponent(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
  ): Promise<boolean> {
    return this.deleteEntityById(
      mcpContext,
      clientProjectRoot,
      repositoryName,
      branch,
      componentId,
      'component',
      'deleteComponent',
    );
  }

  /**
   * Get all components for a repository and branch
   */
  async getAllComponents(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
  ): Promise<Component[]> {
    const logger = mcpContext.logger || console;
    this.validateRepositoryProvider('getAllComponents');

    try {
      const componentRepo = this.repositoryProvider.getComponentRepository(clientProjectRoot);
      const repositoryNodeId = `${repositoryName}:${branch}`;
      return await componentRepo.getActiveComponents(repositoryNodeId, branch);
    } catch (error: any) {
      this.handleEntityError(error, 'getAllComponents', 'component', 'all', logger);
      throw error;
    }
  }
}
