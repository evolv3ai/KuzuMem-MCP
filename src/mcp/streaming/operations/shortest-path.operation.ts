import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

interface ShortestPathParams {
  relationshipTypes?: string[];
  direction?: 'outgoing' | 'incoming' | 'both';
  algorithm?: string;
  projectedGraphName?: string;
  nodeTableNames?: string[];
  relationshipTableNames?: string[];
}

/**
 * Operation class for finding the shortest path between two nodes with streaming support.
 */
export class ShortestPathOperation {
  /**
   * Execute the shortest path operation with streaming support.
   */
  public static async execute(
    repository: string,
    branch: string,
    startNodeId: string,
    endNodeId: string,
    params: ShortestPathParams = {},
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    const {
      relationshipTypes,
      direction = 'outgoing',
      algorithm,
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
    } = params;

    // Initial validation, returning an error object for the handler to process
    if (!repository || !startNodeId || !endNodeId) {
      return {
        error: 'Missing required parameters: repository, startNodeId, and endNodeId are required',
        status: 'error',
      };
    }

    if (progressHandler) {
      progressHandler.progress({
        status: 'initializing',
        message: `Initializing shortest path search from ${startNodeId} to ${endNodeId} in ${repository}:${branch}`,
        startNodeId,
        endNodeId,
        direction,
        relationshipTypes,
        algorithm,
        projectedGraphName,
        nodeTableNames,
        relationshipTableNames,
      });
    }

    let operationStatus = 'complete';
    let path: any[] = [];
    let pathLength = 0;
    let pathFound = false;
    let errorMessage: string | null = null;

    try {
      const servicePathResult = await (memoryService as any).shortestPath?.(
        repository,
        branch,
        startNodeId,
        endNodeId,
        {
          relationshipTypes,
          direction,
          algorithm,
          projectedGraphName,
          nodeTableNames,
          relationshipTableNames,
        },
      );

      // Ensure servicePathResult and its path property are valid
      if (servicePathResult && Array.isArray(servicePathResult.path)) {
        path = servicePathResult.path;
        pathLength =
          typeof servicePathResult.length === 'number' ? servicePathResult.length : path.length;
        pathFound = path.length > 0;
        if (servicePathResult.error) {
          // If service itself indicates an error in its valid structure
          errorMessage = servicePathResult.error;
          operationStatus = 'error';
          pathFound = false; // Ensure pathFound is false if service reports error
        }
      } else if (servicePathResult && servicePathResult.error) {
        errorMessage = servicePathResult.error;
        operationStatus = 'error';
      } else {
        // Path not found or unexpected result from service, treat as no path found
        // (path, pathLength, pathFound already defaulted to no path)
        // Optionally log a warning if servicePathResult was truthy but malformed
      }
    } catch (err: any) {
      errorMessage = err.message || 'Error during shortest path service call';
      operationStatus = 'error';
      // path, pathLength, pathFound already defaulted to no path state
    }

    if (progressHandler) {
      progressHandler.progress({
        status: operationStatus === 'error' ? 'error' : 'in_progress', // or 'complete' if only one progress update
        message: errorMessage
          ? `Error: ${errorMessage}`
          : pathFound
            ? `Path found with length ${pathLength}`
            : 'No path found',
        pathFound,
        pathLength,
        path: operationStatus === 'error' ? [] : path, // Send empty path on error
        ...(errorMessage && { errorDetail: errorMessage }),
      });
    }

    // This is the wrapper object returned to the tool handler
    return {
      status: operationStatus,
      repository,
      branch,
      startNodeId,
      endNodeId,
      paramsUsed: {
        direction,
        relationshipTypes,
        algorithm,
        projectedGraphName,
        nodeTableNames,
        relationshipTableNames,
      },
      pathFound,
      pathLength,
      path,
      ...(errorMessage && { error: errorMessage }),
    };
  }
}
