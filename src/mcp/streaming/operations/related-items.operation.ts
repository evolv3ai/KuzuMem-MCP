import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for retrieving related items with streaming support.
 */
export class RelatedItemsOperation {
  /**
   * Execute the operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    startItemId: string,
    params: {
      // Kuzu Algo/query params are passed via this object
      relationshipFilter?: string; // Comma-separated list of relationship types
      targetNodeTypeFilter?: string; // Comma-separated list of target node types
      depth?: number; // Max hops
    } = {},
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (!repositoryName || !startItemId) {
        return {
          error: 'Missing required parameters: repositoryName and startItemId are required',
        };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting retrieval of related items for ${startItemId} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      // Convert comma-separated strings to arrays if needed by memoryService
      const formattedParams = {
        relationshipTypes: params.relationshipFilter
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        targetNodeTypes: params.targetNodeTypeFilter
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        depth: params.depth || 1, // Default depth
      };

      const relatedItems = await memoryService.getRelatedItems(
        repositoryName,
        branch,
        startItemId,
        formattedParams, // Pass the structured params
      );

      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        startItemId,
        relatedItems: relatedItems || [], // Ensure it's an array
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${relatedItems?.length || 0} related item(s) for ${startItemId}.`,
          count: relatedItems?.length || 0,
          items: relatedItems || [], // Use 'items' to match potential test expectation or relatedItems
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
        const errorPayload = { error: `Failed to get related items: ${errorMessage}` };
        progressHandler.progress({ ...errorPayload, status: 'error', isFinal: true });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      // Re-throw or return error structure for non-SSE path
      throw new Error(`Failed to get related items: ${errorMessage}`);
    }
  }
}
