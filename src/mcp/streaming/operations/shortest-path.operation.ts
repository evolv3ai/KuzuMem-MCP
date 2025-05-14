import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for finding the shortest path between two nodes with streaming support.
 */
export class ShortestPathOperation {
  /**
   * Execute the shortest path operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    startNodeId: string,
    endNodeId: string,
    params: any, // Keep generic params for potential future Kuzu options
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (
        !repositoryName ||
        !projectedGraphName ||
        !nodeTableNames ||
        !relationshipTableNames ||
        !startNodeId ||
        !endNodeId
      ) {
        return { error: 'Missing required parameters for Shortest Path' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting shortest path search from ${startNodeId} to ${endNodeId} in graph ${projectedGraphName} (${repositoryName}:${branch}, Project: ${clientProjectRoot})`,
        });
      }

      const enrichedParams = {
        ...params,
        projectedGraphName,
        nodeTableNames,
        relationshipTableNames,
      };

      const shortestPathResult = await memoryService.shortestPath(
        repositoryName,
        branch,
        startNodeId,
        endNodeId,
        enrichedParams,
      );

      // Determine pathFound based on the result
      const pathFound = !!(shortestPathResult?.path && shortestPathResult.path.length > 0);
      const path = shortestPathResult?.path || [];
      const length = shortestPathResult?.length || 0;

      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        startNodeId,
        endNodeId,
        results: {
          pathFound,
          path,
          length,
          error: shortestPathResult?.error || null, // Include error if present in Kuzu result
        },
      };

      if (progressHandler) {
        // Send in_progress with available path information
        progressHandler.progress({
          status: 'in_progress',
          message: `Shortest path search processing for ${projectedGraphName}...`,
          pathFound: pathFound,
          path: path,
          length: length,
        });

        // Send final progress event (which is effectively the same data now)
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
        const errorPayload = { error: `Shortest path search failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`Shortest path search failed: ${errorMessage}`);
    }
  }
}
