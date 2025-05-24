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
    memoryService?: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    if (!memoryService) {
      return { error: 'MemoryService instance is required for WCC Operation' };
    }
    if (!repositoryName || !projectedGraphName || !nodeTableNames || !relationshipTableNames) {
      return { error: 'Missing required parameters for Weakly Connected Components' };
    }

    try {
      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting Weakly Connected Components analysis for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const params = {
        repository: repositoryName,
        branch: branch,
        projectedGraphName: projectedGraphName,
        nodeTableNames: nodeTableNames,
        relationshipTableNames: relationshipTableNames,
      };

      const wccOutput = await memoryService.getWeaklyConnectedComponents(clientProjectRoot, params);

      const components = wccOutput?.results?.components || [];
      const resultStatus = wccOutput?.status || 'error';

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: {
          components: components,
        },
        message: wccOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Weakly Connected Components analysis processing for ${projectedGraphName}. Components found: ${components.length}.`,
          wccCount: components.length,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      if (resultStatus === 'error' && !progressHandler) {
        throw new Error(resultPayload.message || 'WCC analysis failed in operation.');
      }

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
