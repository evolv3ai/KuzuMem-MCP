import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for component dependency retrieval with streaming support
 */
export class ComponentDependenciesOperation {
  /**
   * Execute the component dependencies operation with streaming support
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    depth: number = 1,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      // Validate required args
      if (!repositoryName || !componentId) {
        return {
          error: 'Missing required parameters: repositoryName and componentId are required',
        };
      }

      // Report initialization progress
      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting dependency analysis for ${componentId} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
          depth,
        });
      }

      // First level of dependencies
      const firstLevelDeps = await memoryService.getComponentDependencies(
        clientProjectRoot,
        repositoryName,
        branch,
        componentId,
      );

      // Send progressive result
      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: 'Retrieved first level dependencies',
          level: 1,
          count: firstLevelDeps.length,
          dependencies: firstLevelDeps,
        });
      }

      // If depth > 1, get next level dependencies
      let allDependencies = [...firstLevelDeps];
      let processedCount = 0;

      if (depth > 1 && firstLevelDeps.length > 0) {
        for (const dep of firstLevelDeps) {
          // Report progress before processing each component
          if (progressHandler) {
            progressHandler.progress({
              status: 'in_progress',
              message: `Processing dependencies for ${dep.id}`,
              processedCount,
              totalCount: firstLevelDeps.length,
              currentComponent: dep.id,
            });
          }

          // Get next level
          const nextLevelDeps = await memoryService.getComponentDependencies(
            clientProjectRoot,
            repositoryName,
            branch,
            dep.id,
          );

          // Add to all dependencies, avoiding duplicates
          const newDeps = nextLevelDeps.filter(
            (newDep: any) => !allDependencies.some((existing: any) => existing.id === newDep.id),
          );
          allDependencies = [...allDependencies, ...newDeps];

          // Update counter
          processedCount++;

          // Report progress after processing each component
          if (progressHandler) {
            progressHandler.progress({
              status: 'in_progress',
              message: `Processed dependencies for ${dep.id}`,
              processedCount,
              totalCount: firstLevelDeps.length,
              newDependenciesFound: newDeps.length,
            });
          }
        }
      }

      // Final result payload
      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        componentId,
        depth,
        totalDependencies: allDependencies.length,
        dependencies: allDependencies,
      };

      if (progressHandler) {
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
        const errorPayload = { error: `Failed to get component dependencies: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`Failed to get component dependencies: ${errorMessage}`);
    }
  }
}
