import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for component dependents retrieval with streaming support
 */
export class ComponentDependentsOperation {
  /**
   * Execute the component dependents operation with streaming support
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
          message: `Starting dependent analysis for ${componentId} in ${repository}:${branch}`,
        });
      }

      // Assume memoryService.getComponentDependents might be an expensive operation
      // or could be refactored to internally stream/yield results.
      // For now, we'll call it and then can simulate progress if needed,
      // or directly return if the operation is quick.
      // The example in README2 shows paths, suggesting a traversal.

      // Placeholder for actual logic that might involve complex graph traversal and path reconstruction
      // which would be the source of multiple progressHandler.progress() calls.
      const allDependents = await memoryService.getComponentDependents(
        repository,
        branch,
        componentId,
      );

      if (progressHandler) {
        // Example: if allDependents is a large array, one could send them in chunks
        // For now, sending a single progress update before completion.
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${allDependents.length} dependent(s) for ${componentId}`,
          count: allDependents.length,
          dependents: allDependents, // Or a chunk of it
        });
      }

      const result = {
        status: 'complete',
        repository,
        branch,
        componentId,
        totalDependents: allDependents.length,
        dependents: allDependents,
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get component dependents: ${errorMessage}`);
    }
  }
}
