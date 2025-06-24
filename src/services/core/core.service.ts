import { KuzuDBClient } from '../../db/kuzu';
import { RepositoryProvider } from '../../db/repository-provider';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { SnapshotService } from '../snapshot.service';
import { IServiceContainer } from './service-container.interface';

export abstract class CoreService {
  protected serviceContainer: IServiceContainer;

  constructor(serviceContainer: IServiceContainer) {
    this.serviceContainer = serviceContainer;
  }

  // Convenience methods for accessing infrastructure services
  protected get repositoryProvider(): RepositoryProvider {
    return this.serviceContainer.getRepositoryProvider();
  }

  protected async getKuzuClient(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
  ): Promise<KuzuDBClient> {
    return this.serviceContainer.getKuzuClient(mcpContext, clientProjectRoot);
  }

  protected async getSnapshotService(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
  ): Promise<SnapshotService> {
    return this.serviceContainer.getSnapshotService(mcpContext, clientProjectRoot);
  }
}
