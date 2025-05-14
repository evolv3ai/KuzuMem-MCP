import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for K-Core Decomposition with streaming support.
 */
export class KCoreDecompositionOperation {
  /**
   * Execute the K-Core Decomposition operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    k: number,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (!repositoryName) {
        return { error: 'Missing repository name parameter for K-Core Decomposition' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting K-Core Decomposition (k=${k}) for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      // Call the MemoryService's kCoreDecomposition method with the correct signature
      const kCoreResults = await memoryService.kCoreDecomposition(
        clientProjectRoot,
        repositoryName,
        branch,
        k,
      );

      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: {
          k: k,
          components: kCoreResults?.cores || [],
        },
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `K-Core Decomposition processing for ${repositoryName}/${branch}.`,
          componentsCount: kCoreResults?.cores?.length || 0,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null;
      }

      return resultPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `K-Core Decomposition failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null;
      }
      throw new Error(`K-Core Decomposition failed: ${errorMessage}`);
    }
  }
}
