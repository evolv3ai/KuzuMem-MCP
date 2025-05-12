import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for Louvain Community Detection with streaming support.
 */
export class LouvainCommunityDetectionOperation {
  /**
   * Execute the Louvain Community Detection operation with streaming support.
   */
  public static async execute(
    repository: string,
    branch: string,
    memoryService?: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    if (!repository) {
      return { error: 'Missing required parameter: repository', status: 'error' };
    }

    if (progressHandler) {
      progressHandler.progress({
        status: 'initializing',
        message: `Starting Louvain Community Detection for ${repository}:${branch}`,
      });
    }

    let operationStatus = 'complete';
    let communities: any[] = [];
    let modularity: number | null = null; // Initialize to null
    let errorMessage: string | null = null;

    try {
      const serviceResult = await (memoryService as any)?.louvainCommunityDetection?.(
        repository,
        branch,
      );

      if (serviceResult && Array.isArray(serviceResult.communities)) {
        communities = serviceResult.communities;
        modularity = typeof serviceResult.modularity === 'number' ? serviceResult.modularity : null;
        if (serviceResult.error) {
          // If service itself indicates an error
          errorMessage = serviceResult.error;
          operationStatus = 'error';
        }
      } else if (serviceResult && serviceResult.error) {
        errorMessage = serviceResult.error;
        operationStatus = 'error';
      } else {
        // Unexpected result or no communities found
        // communities array remains empty, modularity remains null
        // If serviceResult was truthy but malformed, could set error or log warning
        // For now, assume it means no communities or error implicitly handled by empty data.
      }
    } catch (err: any) {
      errorMessage = err.message || 'Error during Louvain Community Detection service call';
      operationStatus = 'error';
    }

    if (progressHandler) {
      progressHandler.progress({
        status: operationStatus === 'error' ? 'error' : 'in_progress',
        message: errorMessage
          ? `Error: ${errorMessage}`
          : `Louvain Community Detection computed. Found ${communities.length} communities. Modularity: ${modularity === null ? 'N/A' : modularity}.`,
        communitiesCount: communities.length,
        modularity: modularity,
        ...(errorMessage && { errorDetail: errorMessage }),
      });
    }

    return {
      status: operationStatus,
      repository,
      branch,
      communities,
      modularity,
      ...(errorMessage && { error: errorMessage }),
    };
  }
}
