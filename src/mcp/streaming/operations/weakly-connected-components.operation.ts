import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for Weakly Connected Components (WCC) analysis with streaming support.
 */
export class WeaklyConnectedComponentsOperation {
  /**
   * Execute the WCC operation with streaming support.
   */
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    projectedGraphName: string,
    nodeTableNames: string[],
    relationshipTableNames: string[],
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    try {
      if (!repositoryName || !projectedGraphName || !nodeTableNames || !relationshipTableNames) {
        return { error: 'Missing required parameters for Weakly Connected Components' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting Weakly Connected Components analysis for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const wccResults = await memoryService.getWeaklyConnectedComponents(
        repositoryName,
        branch,
        undefined, // maxIterations
      );

      const resultPayload = {
        status: 'complete',
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: wccResults, // Contains the list of components in WCC groups
      };

      if (progressHandler) {
        const componentsInWCC = wccResults?.components || [];
        progressHandler.progress({
          status: 'in_progress',
          message: `Weakly Connected Components analysis processing for ${projectedGraphName}.`,
          wccCount: componentsInWCC.length, // Add wccCount based on results
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      // If no progressHandler, return the result directly
      return resultPayload;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (progressHandler) {
        const errorPayload = { error: `WCC analysis failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`WCC analysis failed: ${errorMessage}`);
    }
  }
}
