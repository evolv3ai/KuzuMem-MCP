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
    memoryService?: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    if (!memoryService) {
      return { error: 'MemoryService instance is required for SCC Operation' };
    }
    if (!repositoryName || !projectedGraphName || !nodeTableNames || !relationshipTableNames) {
      return { error: 'Missing required parameters for Strongly Connected Components' };
    }

    try {
      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting Strongly Connected Components analysis for graph ${projectedGraphName} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const params = {
        repository: repositoryName,
        branch: branch,
        projectedGraphName: projectedGraphName,
        nodeTableNames: nodeTableNames,
        relationshipTableNames: relationshipTableNames,
      };

      const sccOutput = await memoryService.getStronglyConnectedComponents(
        clientProjectRoot,
        params,
      );

      const components = sccOutput?.results?.components || [];
      const resultStatus = sccOutput?.status || 'error';

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        projectedGraphName,
        results: {
          components: components,
        },
        message: sccOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Strongly Connected Components analysis processing for ${projectedGraphName}. Components found: ${components.length}.`,
          sccCount: components.length,
        });

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      if (resultStatus === 'error' && !progressHandler) {
        throw new Error(resultPayload.message || 'SCC analysis failed in operation.');
      }

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
