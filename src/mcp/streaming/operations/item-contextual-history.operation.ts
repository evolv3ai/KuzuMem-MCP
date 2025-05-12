import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

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
    repository: string,
    branch: string,
    itemId: string,
    itemType: ItemType,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      // Validate required args
      if (!repository || !itemId || !itemType) {
        return {
          error: 'Missing required parameters: repository, itemId, and itemType are required',
        };
      }
      const validItemTypes: ItemType[] = ['Component', 'Decision', 'Rule'];
      if (!validItemTypes.includes(itemType)) {
        return {
          error: `Invalid itemType: ${itemType}. Must be one of ${validItemTypes.join(', ')}`,
        };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting contextual history retrieval for ${itemType} ${itemId} in ${repository}:${branch}`,
        });
      }

      // Assuming memoryService.getItemContextualHistory exists and retrieves the history.
      // This could be a candidate for internal streaming within MemoryService if histories are very long.
      const history = await (memoryService as any).getItemContextualHistory(
        repository,
        branch,
        itemId,
        itemType,
      );

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${history.length} history entries for ${itemType} ${itemId}`,
          count: history.length,
          history: history, // Or a chunk
        });
      }

      const result = {
        status: 'complete',
        repository,
        branch,
        itemId,
        itemType,
        historyCount: history.length,
        contextHistory: history,
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get item contextual history: ${errorMessage}`);
    }
  }
}
