import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';
import { McpServerRequestContext } from '@modelcontextprotocol/sdk';

/**
 * Operation class for retrieving related items with streaming support.
 */
export class RelatedItemsOperation {
  /**
   * Execute the operation with streaming support.
   */
  public static async execute(
    mcpContext: McpServerRequestContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    startItemId: string,
    opParams: {
      projectedGraphName?: string;
      nodeTableNames?: string[];
      relationshipTableNames?: string[];
      depth?: number;
      relationshipFilter?: string;
      targetNodeTypeFilter?: string;
    } = {},
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    try {
      if (!repositoryName || !startItemId) {
        logger.warn(
          '[RelatedItemsOperation] Missing required parameters: repositoryName and startItemId',
        );
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

      const getRelatedItemsOutput = await memoryService.getRelatedItems(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        startItemId,
        opParams,
      );

      const relatedItems = getRelatedItemsOutput?.relatedItems || [];
      const resultStatus = getRelatedItemsOutput?.status || 'error';

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        startItemId,
        relatedItems: relatedItems,
        message: getRelatedItemsOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${relatedItems.length} related item(s) for ${startItemId}.`,
          count: relatedItems.length,
          items: relatedItems,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      if (resultStatus === 'error' && !progressHandler) {
        logger.error(
          `[RelatedItemsOperation] Failed to get related items: ${resultPayload.message || 'Unknown error'}`,
        );
        throw new Error(resultPayload.message || 'Failed to get related items in operation.');
      }

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
