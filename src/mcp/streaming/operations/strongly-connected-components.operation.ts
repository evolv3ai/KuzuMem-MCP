import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for Strongly Connected Components (SCC) analysis with streaming support.
 */
export class StronglyConnectedComponentsOperation {
  /**
   * Execute the SCC operation with streaming support.
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
        return { error: 'Missing required parameters for Strongly Connected Components' };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting Strongly Connected Components analysis for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const sccResults = await memoryService.getStronglyConnectedComponents(
        clientProjectRoot,
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
        results: sccResults, // Contains the list of components in SCC groups
        // sccCount can be derived: (sccResults?.components || []).length
        // Or if sccResults has a direct count property, use that.
      };

      if (progressHandler) {
        const componentsInSCC = sccResults?.components || [];
        progressHandler.progress({
          status: 'in_progress',
          message: `Strongly Connected Components analysis processing for ${projectedGraphName}.`,
          sccCount: componentsInSCC.length, // Add sccCount based on results
          // Optionally include a sample of components if the list is very large
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
        const errorPayload = { error: `SCC analysis failed: ${errorMessage}` };
        progressHandler.progress({
          ...errorPayload,
          status: 'error',
          message: errorPayload.error,
          isFinal: true,
        });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Indicate error was handled via progress mechanism
      }
      throw new Error(`SCC analysis failed: ${errorMessage}`);
    }
  }
}
