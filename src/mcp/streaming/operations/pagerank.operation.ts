import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for PageRank calculation with streaming support.
 */
export class PageRankOperation {
  /**
   * Execute the PageRank operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    dampingFactor?: number,
    maxIterations?: number,
    memoryService?: MemoryService, // Make optional for flexibility, but check inside
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    if (!memoryService) {
      return { error: 'MemoryService instance is required for PageRankOperation' };
    }
    if (!repositoryName || !projectedGraphName || !nodeTableNames || !relationshipTableNames) {
      return { error: 'Missing required parameters for PageRank' };
    }

    try {
      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting PageRank for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const pageRankResults = await memoryService.pageRank(
        repositoryName,
        branch,
        dampingFactor,
        maxIterations,
        /* tolerance */ undefined,
        /* normalizeInitial */ undefined,
      );

      // console.log(
      //   'PageRankOperation: pageRankResults from service:',
      //   JSON.stringify(pageRankResults, null, 2),
      // );

      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: pageRankResults, // This will contain the final ranks and any iteration info
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `PageRank calculation processing for ${projectedGraphName}...`,
          // Include summary from pageRankResults if available, e.g., iterations completed
          iterationsCompleted: pageRankResults?.iterations || maxIterations || 'unknown',
          // Ranks here would be the final ranks, consider if a sample is useful for in-progress
        });

        // const ranksForProgress = pageRankResults?.ranks || [];
        // console.log(
        //   'PageRankOperation: ranks being sent in final progress:',
        //   JSON.stringify(ranksForProgress, null, 2),
        // );

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      // If no progressHandler, return the result directly
      return resultPayload;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `PageRank failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`PageRank failed: ${errorMessage}`);
    }
  }
}
