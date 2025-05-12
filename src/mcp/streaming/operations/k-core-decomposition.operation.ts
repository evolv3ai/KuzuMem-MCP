import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

/**
 * Operation class for K-Core Decomposition with streaming support.
 */
export class KCoreDecompositionOperation {
  /**
   * Execute the K-Core Decomposition operation with streaming support.
   */
  public static async execute(
    repository: string,
    branch: string,
    k?: number,
    memoryService?: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    if (!repository) {
      return { error: 'Missing required parameter: repository', status: 'error' };
    }

    if (progressHandler) {
      progressHandler.progress({
        status: 'initializing',
        message:
          `Starting K-Core Decomposition for ${repository}:${branch}` +
          (k !== undefined ? ` with k=${k}` : ''),
        kValueProvided: k,
      });
    }

    let operationStatus = 'complete';
    let components: any[] = [];
    let errorMessage: string | null = null;
    let actualKUsed = k; // Will be determined by service or default if k is undefined

    try {
      // Assume memoryService.kCoreDecomposition returns an array of { component: object, k_degree: number }
      // or an object containing such an array, e.g. { k: usedK, components: [...] }
      const serviceResult = await (memoryService as any)?.kCoreDecomposition?.(
        repository,
        branch,
        k,
      );

      if (serviceResult && Array.isArray(serviceResult)) {
        components = serviceResult;
        // If k was not provided, the service might have used a default or determined it.
        // For now, we assume actualKUsed remains as provided or undefined.
        // A more sophisticated result from service could include the actual k used.
      } else if (serviceResult && serviceResult.error) {
        errorMessage = serviceResult.error;
        operationStatus = 'error';
      } else if (
        serviceResult &&
        serviceResult.components &&
        Array.isArray(serviceResult.components)
      ) {
        // Alternative structure from service: { k: number, components: [] }
        components = serviceResult.components;
        actualKUsed = serviceResult.k !== undefined ? serviceResult.k : k;
      } else {
        // Unexpected result or no components found
        // components array remains empty
        // Optionally, if serviceResult is not null/undefined but not as expected, treat as error or log warning
      }
    } catch (err: any) {
      errorMessage = err.message || 'Error during K-Core Decomposition service call';
      operationStatus = 'error';
    }

    if (progressHandler) {
      progressHandler.progress({
        status: operationStatus === 'error' ? 'error' : 'in_progress',
        message: errorMessage
          ? `Error: ${errorMessage}`
          : `K-Core decomposition computed. Found ${components.length} component(s).`,
        componentsCount: components.length,
        kValueUsed: actualKUsed,
        ...(errorMessage && { errorDetail: errorMessage }),
      });
    }

    return {
      status: operationStatus,
      repository,
      branch,
      kValueProvided: k, // The k initially requested
      decomposition: {
        kValueApplied: actualKUsed, // The k value effectively applied by the service/algorithm
        components: components, // The list of components in the k-core
      },
      ...(errorMessage && { error: errorMessage }),
    };
  }
}
