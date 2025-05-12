import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

interface RelatedItemsParams {
  relationshipTypes?: string[];
  depth?: number;
  direction?: 'outgoing' | 'incoming' | 'both'; // Assuming MemoryService supports this
  // targetNodeTypeFilter?: string[]; // This was in the getRelatedItemsTool description, could be added
}

/**
 * Operation class for retrieving related items with streaming support.
 */
export class RelatedItemsOperation {
  /**
   * Execute the operation with streaming support.
   */
  public static async execute(
    repository: string,
    branch: string,
    startItemId: string,
    params: RelatedItemsParams = {},
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    const { relationshipTypes, depth = 1, direction = 'outgoing' } = params;

    try {
      // Validate required args
      if (!repository || !startItemId) {
        return { error: 'Missing required parameters: repository and startItemId are required' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting related items traversal for ${startItemId} in ${repository}:${branch}, depth: ${depth}`,
          startItemId,
          depth,
          direction,
          relationshipTypes,
        });
      }

      // Placeholder for actual MemoryService.getRelatedItems call.
      // This service method would ideally be stream-aware itself or allow for paginated/cursor-based fetching
      // to enable true streaming from the operation class.
      // For now, we assume it returns all related items at once after its own traversal.
      const relatedItems =
        (await (memoryService as any).getRelatedItems?.(repository, branch, startItemId, {
          relationshipTypes,
          depth,
          direction,
          // targetNodeTypeFilter could be passed here if implemented
        })) || [];

      // Example of how progress could be reported if the above call was iterative
      // or if we processed results in chunks.
      // For instance, if memoryService.getRelatedItems used a generator or callback:
      // for await (const itemBatch of memoryService.streamRelatedItems(...)) {
      // if (progressHandler) {
      // progressHandler.progress({ status: 'in_progress', items: itemBatch });
      // }
      // allRelatedItems.push(...itemBatch);
      // }

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${relatedItems.length} related items for ${startItemId}`,
          count: relatedItems.length,
          items: relatedItems, // Could be a chunk
        });
      }

      const result = {
        status: 'complete',
        repository,
        branch,
        startItemId,
        paramsUsed: { depth, direction, relationshipTypes },
        totalRelatedItems: relatedItems.length,
        relatedItems: relatedItems,
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get related items: ${errorMessage}`);
    }
  }
}
