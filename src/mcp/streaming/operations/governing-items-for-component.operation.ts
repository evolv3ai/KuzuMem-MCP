import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for retrieving governing items for a component with streaming support.
 * Governing items include related decisions, rules, and context history.
 */
export class GoverningItemsForComponentOperation {
  /**
   * Execute the operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (!repositoryName || !componentId) {
        return {
          error: 'Missing required parameters: repositoryName and componentId are required',
        };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting retrieval of governing items for component ${componentId} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const governingItemsResult = await memoryService.getGoverningItemsForComponent(
        clientProjectRoot,
        repositoryName,
        branch,
        componentId,
      );

      const decisions = governingItemsResult?.decisions || [];
      const rules = governingItemsResult?.rules || [];
      const contextHistory = governingItemsResult?.contextHistory || [];

      if (progressHandler) {
        // Send separate in_progress updates for each type of item
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${decisions.length} decision(s).`,
          dataType: 'decisions',
          decisionsCount: decisions.length,
          decisions: decisions, // Send the actual data if appropriate for progress
        });
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${rules.length} rule(s).`,
          dataType: 'rules',
          rulesCount: rules.length,
          rules: rules,
        });
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${contextHistory.length} context history entries.`,
          dataType: 'contextHistory',
          contextHistoryCount: contextHistory.length,
          contextHistory: contextHistory,
        });

        // Prepare final payload for final progress and response
        const resultPayload = {
          status: 'complete',
          clientProjectRoot,
          repository: repositoryName,
          branch,
          componentId,
          decisions,
          rules,
          contextHistory,
        };

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      // If no progressHandler, return the result directly (for non-SSE calls)
      // This part would be hit if progressHandler is undefined
      const resultPayloadDirect = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        componentId,
        decisions,
        rules,
        contextHistory,
      };
      return resultPayloadDirect;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get governing items for component: ${errorMessage}`);
    }
  }
}
