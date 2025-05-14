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
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (!repositoryName) {
        return { error: 'Missing repository name parameter for Louvain Community Detection' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting Louvain Community Detection for ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      // Call the MemoryService's louvainCommunityDetection method with the correct signature
      const louvainResults = await memoryService.louvainCommunityDetection(repositoryName, branch);

      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: {
          communities: louvainResults?.communities || [],
          modularity: louvainResults?.modularity ?? null,
        },
      };

      if (progressHandler) {
        const communities = louvainResults?.communities || [];
        progressHandler.progress({
          status: 'in_progress',
          message: `Louvain Community Detection processing for ${repositoryName}/${branch}.`,
          communitiesCount: communities.length,
          modularity: louvainResults?.modularity ?? null,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      // If no progressHandler, return the result directly
      return resultPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `Louvain Community Detection failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`Louvain Community Detection failed: ${errorMessage}`);
    }
  }
}
