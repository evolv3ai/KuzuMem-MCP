import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Decision, DecisionInput } from '../../types';
import * as decisionOps from '../memory-operations/decision.ops';
import { SnapshotService } from '../snapshot.service';
import { BaseEntityService } from './base-entity.service';

/**
 * Service for Decision entity operations
 * Handles CRUD operations and business logic for decisions
 */
export class DecisionService extends BaseEntityService {
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
   * Create or update a decision
   */
  async upsertDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionData: {
      id: string;
      name: string;
      date: string;
      context?: string;
    },
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    this.validationService.validateRepositoryProvider('upsertDecision');

    const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
    const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
    const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

    // Construct the data object expected by decisionOps.upsertDecisionOp
    const decisionOpData: DecisionInput = {
      ...decisionData,
      repository: repositoryName,
      branch: branch,
    };

    return decisionOps.upsertDecisionOp(
      mcpContext,
      repositoryName,
      branch,
      decisionOpData,
      repositoryRepo,
      decisionRepo,
    );
  }

  /**
   * Get a decision by ID
   */
  async getDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<Decision | null> {
    return this.getEntityById<Decision>(
      mcpContext,
      clientProjectRoot,
      repositoryName,
      branch,
      decisionId,
      'decision',
      'getDecision',
    );
  }

  /**
   * Update an existing decision
   */
  async updateDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
    updates: Partial<Omit<Decision, 'id' | 'repository' | 'branch' | 'type'>>,
  ): Promise<Decision | null> {
    const logger = mcpContext.logger || console;
    this.validationService.validateRepositoryProvider('updateDecision');

    try {
      // First check if decision exists
      const existing = await this.getDecision(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        decisionId,
      );
      if (!existing) {
        logger.warn(`[DecisionService.updateDecision] Decision ${decisionId} not found`);
        return null;
      }

      // Merge updates with existing data
      const updatedData = {
        ...existing,
        ...updates,
        // Convert null to undefined
        context: updates.context === null ? undefined : updates.context,
      };

      // Use upsert method to update
      return await this.upsertDecision(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        updatedData,
      );
    } catch (error: any) {
      this.handleEntityError(error, 'updateDecision', 'decision', decisionId, logger);
      throw error;
    }
  }

  /**
   * Delete a decision
   */
  async deleteDecision(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    decisionId: string,
  ): Promise<boolean> {
    return this.deleteEntityById(
      mcpContext,
      clientProjectRoot,
      repositoryName,
      branch,
      decisionId,
      'decision',
      'deleteDecision',
    );
  }

  /**
   * Get all decisions for a repository and branch
   */
  async getAllDecisions(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
  ): Promise<Decision[]> {
    const logger = mcpContext.logger || console;
    this.validationService.validateRepositoryProvider('getAllDecisions');

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);
      const decisionRepo = this.repositoryProvider.getDecisionRepository(clientProjectRoot);

      // Get the repository to find its ID
      const repository = await repositoryRepo.findByName(repositoryName, branch);
      if (!repository || !repository.id) {
        logger.warn(
          `[DecisionService.getAllDecisions] Repository not found: ${repositoryName}/${branch}`,
        );
        return [];
      }

      // Use the repository's getAllDecisions method
      const decisions = await decisionRepo.getAllDecisions(repository.id, branch);
      logger.debug(
        `[DecisionService.getAllDecisions] Found ${decisions.length} decisions for ${repositoryName}:${branch}`,
      );

      return decisions;
    } catch (error: any) {
      this.handleEntityError(error, 'getAllDecisions', 'decision', 'all', logger);
      throw error;
    }
  }
}
