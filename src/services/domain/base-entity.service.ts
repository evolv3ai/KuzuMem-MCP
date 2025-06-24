import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { CoreService } from '../core/core.service';
import { IServiceContainer } from '../core/service-container.interface';
import { ValidationService } from '../core/validation.service';

/**
 * Base service class for entity operations
 * Provides common functionality for all entity types
 */
export abstract class BaseEntityService extends CoreService {
  protected validationService: ValidationService;

  constructor(serviceContainer: IServiceContainer) {
    super(serviceContainer);
    this.validationService = new ValidationService(serviceContainer.getRepositoryProvider());
  }

  /**
   * Common validation for entity operations
   */
  protected validateEntityParams(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityId: string,
    methodName: string,
  ): void {
    this.validationService.validateRepositoryProvider(methodName);
    this.validationService.validateRequiredParams(
      { clientProjectRoot, repositoryName, branch, entityId },
      ['clientProjectRoot', 'repositoryName', 'branch', 'entityId'],
      methodName,
    );
  }

  /**
   * Common error handling for entity operations
   */
  protected handleEntityError(
    error: any,
    methodName: string,
    entityType: string,
    entityId: string,
    logger: any = console,
  ): void {
    const context = { entityType, entityId };
    this.validationService.handleServiceError(error, methodName, context, logger);
  }

  /**
   * Get repository instance for entity operations
   */
  protected async getEntityRepository<T>(
    clientProjectRoot: string,
    repositoryType: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context',
  ): Promise<T> {
    switch (repositoryType) {
      case 'component':
        return this.repositoryProvider.getComponentRepository(clientProjectRoot) as T;
      case 'decision':
        return this.repositoryProvider.getDecisionRepository(clientProjectRoot) as T;
      case 'rule':
        return this.repositoryProvider.getRuleRepository(clientProjectRoot) as T;
      case 'file':
        return this.repositoryProvider.getFileRepository(clientProjectRoot) as T;
      case 'tag':
        return this.repositoryProvider.getTagRepository(clientProjectRoot) as T;
      case 'context':
        return this.repositoryProvider.getContextRepository(clientProjectRoot) as T;
      default:
        throw new Error(`Unknown repository type: ${repositoryType}`);
    }
  }

  /**
   * Common pattern for entity retrieval
   */
  protected async getEntityById<T>(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityId: string,
    repositoryType: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context',
    methodName: string,
  ): Promise<T | null> {
    this.validateEntityParams(
      mcpContext,
      clientProjectRoot,
      repositoryName,
      branch,
      entityId,
      methodName,
    );

    try {
      const repository = await this.getEntityRepository<any>(clientProjectRoot, repositoryType);
      return await repository.findByIdAndBranch(repositoryName, entityId, branch);
    } catch (error: any) {
      this.handleEntityError(error, methodName, repositoryType, entityId, mcpContext.logger);
      throw error;
    }
  }

  /**
   * Common pattern for entity deletion
   */
  protected async deleteEntityById(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    entityId: string,
    repositoryType: 'component' | 'decision' | 'rule' | 'file' | 'tag' | 'context',
    methodName: string,
  ): Promise<boolean> {
    this.validateEntityParams(
      mcpContext,
      clientProjectRoot,
      repositoryName,
      branch,
      entityId,
      methodName,
    );

    try {
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      // Import the appropriate delete operation
      switch (repositoryType) {
        case 'component': {
          const { deleteComponentOp } = await import('../memory-operations/component.ops');
          return await deleteComponentOp(
            mcpContext,
            kuzuClient,
            repositoryRepo,
            repositoryName,
            branch,
            entityId,
          );
        }
        case 'decision': {
          const { deleteDecisionOp } = await import('../memory-operations/decision.ops');
          return await deleteDecisionOp(
            mcpContext,
            kuzuClient,
            repositoryRepo,
            repositoryName,
            branch,
            entityId,
          );
        }
        case 'rule': {
          const { deleteRuleOp } = await import('../memory-operations/rule.ops');
          return await deleteRuleOp(
            mcpContext,
            kuzuClient,
            repositoryRepo,
            repositoryName,
            branch,
            entityId,
          );
        }
        case 'file': {
          const { deleteFileOp } = await import('../memory-operations/file.ops');
          return await deleteFileOp(
            mcpContext,
            kuzuClient,
            repositoryRepo,
            repositoryName,
            branch,
            entityId,
          );
        }
        case 'tag': {
          const { deleteTagOp } = await import('../memory-operations/tag.ops');
          return await deleteTagOp(mcpContext, kuzuClient, entityId);
        }
        case 'context': {
          const { deleteContextOp } = await import('../memory-operations/context.ops');
          return await deleteContextOp(
            mcpContext,
            kuzuClient,
            repositoryRepo,
            repositoryName,
            branch,
            entityId,
          );
        }
        default:
          throw new Error(`Delete operation not implemented for ${repositoryType}`);
      }
    } catch (error: any) {
      this.handleEntityError(error, methodName, repositoryType, entityId, mcpContext.logger);
      throw error;
    }
  }
}
