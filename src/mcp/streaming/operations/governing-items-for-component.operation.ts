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
    repository: string,
    branch: string,
    componentId: string,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      // Validate required args
      if (!repository || !componentId) {
        return { error: 'Missing required parameters: repository and componentId are required' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting retrieval of governing items for component ${componentId} in ${repository}:${branch}`,
        });
      }

      // Step 1: Get Decisions (Placeholder for actual MemoryService call)
      // const decisions = await memoryService.getDecisionsForComponent(repository, branch, componentId);
      const decisions =
        (await (memoryService as any).getGoverningDecisionsForComponent?.(
          repository,
          branch,
          componentId,
        )) || [];
      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${decisions.length} decisions for component ${componentId}`,
          dataType: 'decisions',
          count: decisions.length,
          decisions: decisions,
        });
      }

      // Step 2: Get Rules (Placeholder for actual MemoryService call)
      // const rules = await memoryService.getRulesForComponent(repository, branch, componentId);
      const rules =
        (await (memoryService as any).getGoverningRulesForComponent?.(
          repository,
          branch,
          componentId,
        )) || [];
      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${rules.length} rules for component ${componentId}`,
          dataType: 'rules',
          count: rules.length,
          rules: rules,
        });
      }

      // Step 3: Get Context History (Re-using ItemContextualHistory logic or a dedicated method)
      // const contextHistory = await memoryService.getItemContextualHistory(repository, branch, componentId, 'Component');
      const contextHistory =
        (await (memoryService as any).getItemContextualHistory?.(
          repository,
          branch,
          componentId,
          'Component',
        )) || [];
      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${contextHistory.length} context history entries for component ${componentId}`,
          dataType: 'contextHistory',
          count: contextHistory.length,
          contextHistory: contextHistory,
        });
      }

      const result = {
        status: 'complete',
        repository,
        branch,
        componentId,
        decisions,
        rules,
        contextHistory,
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get governing items for component: ${errorMessage}`);
    }
  }
}
