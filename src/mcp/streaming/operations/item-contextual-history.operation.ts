import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';
import { McpServerRequestContext } from '@modelcontextprotocol/sdk';

// Define an enum or type for itemType for better type safety, if not already globally defined
type ItemType = 'Component' | 'Decision' | 'Rule';

/**
 * Operation class for retrieving item contextual history with streaming support
 */
export class ItemContextualHistoryOperation {
  /**
   * Execute the item contextual history operation with streaming support
   */
  public static async execute(
    mcpContext: McpServerRequestContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    itemId: string,
    itemType: ItemType,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    try {
      // Validate required args
      if (!repositoryName || !itemId || !itemType) {
        logger.warn('[ItemContextualHistoryOperation] Missing required parameters');
        return {
          error: 'Missing required parameters: repositoryName, itemId, and itemType are required',
        };
      }
      const validItemTypes: ItemType[] = ['Component', 'Decision', 'Rule'];
      if (!validItemTypes.includes(itemType)) {
        logger.warn(`[ItemContextualHistoryOperation] Invalid itemType: ${itemType}`);
        return {
          error: `Invalid itemType: ${itemType}. Must be one of ${validItemTypes.join(', ')}`,
        };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting contextual history retrieval for ${itemType} ${itemId} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const historyOutput = await memoryService.getItemContextualHistory(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        itemId,
        itemType,
      );

      const contextHistory = historyOutput?.contextHistory || [];
      const resultStatus = historyOutput?.status || 'error';

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        itemId,
        itemType,
        historyCount: contextHistory.length,
        contextHistory: contextHistory,
        message: historyOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${contextHistory.length} history entries for ${itemType} ${itemId}`,
          count: contextHistory.length,
          history: contextHistory,
        });

        // Send final progress event with the full payload
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      if (resultStatus === 'error' && !progressHandler) {
        logger.error(
          `[ItemContextualHistoryOperation] Failed to get history: ${resultPayload.message || 'Unknown error'}`,
        );
        throw new Error(
          resultPayload.message || 'Failed to get item contextual history in operation.',
        );
      }

      return resultPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get item contextual history: ${errorMessage}`);
    }
  }
}
