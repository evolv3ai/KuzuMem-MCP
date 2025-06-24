import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for detect input parameters
interface DetectParams {
  type: 'cycles' | 'islands' | 'path' | 'strongly-connected' | 'weakly-connected';
  clientProjectRoot?: string;
  repository: string;
  branch?: string;
  projectedGraphName: string;
  nodeTableNames: string[];
  relationshipTableNames: string[];
  // For path detection
  startNodeId?: string;
  endNodeId?: string;
}

/**
 * Interface for graph component structure used in detection algorithms
 */
interface GraphComponent {
  componentId: number;
  nodes: string[];
}

/**
 * Type guard to check if an object is a valid GraphComponent
 */
function isValidGraphComponent(obj: unknown): obj is GraphComponent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as any).componentId === 'number' &&
    Array.isArray((obj as any).nodes) &&
    (obj as any).nodes.every((node: unknown) => typeof node === 'string')
  );
}

/**
 * Detect Handler
 * Handles pattern detection in graphs (cycles, islands, paths, connectivity)
 */
export const detectHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as unknown as DetectParams;

  // Basic validation
  if (!validatedParams.type) {
    throw new Error('type parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }
  if (!validatedParams.projectedGraphName) {
    throw new Error('projectedGraphName parameter is required');
  }
  if (!validatedParams.nodeTableNames || !Array.isArray(validatedParams.nodeTableNames)) {
    throw new Error('nodeTableNames parameter is required and must be an array');
  }
  if (
    !validatedParams.relationshipTableNames ||
    !Array.isArray(validatedParams.relationshipTableNames)
  ) {
    throw new Error('relationshipTableNames parameter is required and must be an array');
  }

  const {
    type,
    repository,
    branch = 'main',
    projectedGraphName,
    nodeTableNames,
    relationshipTableNames,
    startNodeId,
    endNodeId,
  } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'detect');

  // 3. Log the operation
  logToolExecution(context, `detect operation: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    type,
    projectedGraphName,
  });

  try {
    switch (type) {
      case 'strongly-connected': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding strongly connected components...`,
          percent: 50,
        });

        const graphAnalysisService = await memoryService.graphAnalysis;
        const result = await graphAnalysisService.getStronglyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'strongly-connected',
            repository,
            branch,
            projectedGraphName,
            nodeTableNames,
            relationshipTableNames,
          },
        );

        const componentCount = result.components?.length || 0;
        await context.sendProgress({
          status: 'complete',
          message: `Strongly connected components detection complete. Found ${componentCount} components`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'strongly-connected',
          status: 'complete',
          projectedGraphName,
          components: result.components || [],
          totalComponents: componentCount,
          message: `Found ${componentCount} strongly connected components`,
        };
      }

      case 'weakly-connected': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding weakly connected components...`,
          percent: 50,
        });

        const graphAnalysisService = await memoryService.graphAnalysis;
        const result = await graphAnalysisService.getWeaklyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'weakly-connected',
            repository,
            branch,
            projectedGraphName,
            nodeTableNames,
            relationshipTableNames,
          },
        );

        const componentCount = result.components?.length || 0;
        await context.sendProgress({
          status: 'complete',
          message: `Weakly connected components detection complete. Found ${componentCount} components`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'weakly-connected',
          status: 'complete',
          projectedGraphName,
          components: result.components || [],
          totalComponents: componentCount,
          message: `Found ${componentCount} weakly connected components`,
        };
      }

      case 'path': {
        if (!startNodeId || !endNodeId) {
          throw new Error('startNodeId and endNodeId parameters are required for path detection');
        }

        await context.sendProgress({
          status: 'in_progress',
          message: `Finding path from ${startNodeId} to ${endNodeId}`,
          percent: 50,
        });

        const graphAnalysisService = await memoryService.graphAnalysis;
        const result = await graphAnalysisService.shortestPath(context, clientProjectRoot, {
          repository,
          branch,
          projectedGraphName,
          nodeTableNames,
          relationshipTableNames,
          startNodeId,
          endNodeId,
        });

        await context.sendProgress({
          status: 'complete',
          message: `Path detection completed`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'path',
          status: 'complete',
          startNodeId,
          endNodeId,
          path: result.path || [],
          pathFound: (result.path?.length || 0) > 0,
          message: `Path detection completed successfully`,
        };
      }

      case 'cycles': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Detecting cycles in graph: ${projectedGraphName}`,
          percent: 50,
        });

        const graphAnalysisService = await memoryService.graphAnalysis;
        const result = await graphAnalysisService.getStronglyConnectedComponents(
          context,
          clientProjectRoot,
          {
            repository,
            branch,
            projectedGraphName,
            nodeTableNames,
            relationshipTableNames,
          },
        );

        // Filter for cycles (strongly connected components with more than 1 node)
        // Enhanced with runtime type validation for extra safety
        const cycles = (result.components || []).filter(
          (component: unknown): component is GraphComponent => {
            if (!isValidGraphComponent(component)) {
              console.warn(`Invalid component structure detected in cycles detection:`, component);
              return false;
            }
            return component.nodes.length > 1;
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Cycle detection completed`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'cycles',
          status: 'complete',
          projectedGraphName,
          components: cycles,
          message: `Found ${cycles.length} cycles`,
        };
      }

      case 'islands': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Detecting isolated components in graph: ${projectedGraphName}`,
          percent: 50,
        });

        const graphAnalysisService = await memoryService.graphAnalysis;
        const result = await graphAnalysisService.getWeaklyConnectedComponents(
          context,
          clientProjectRoot,
          {
            repository,
            branch,
            projectedGraphName,
            nodeTableNames,
            relationshipTableNames,
          },
        );

        // Islands are weakly connected components with only 1 node
        // Enhanced with runtime type validation for extra safety
        const islands = (result.components || []).filter(
          (component: unknown): component is GraphComponent => {
            if (!isValidGraphComponent(component)) {
              console.warn(`Invalid component structure detected in islands detection:`, component);
              return false;
            }
            return component.nodes.length === 1;
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Island detection completed`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'islands',
          status: 'complete',
          projectedGraphName,
          components: islands,
          message: `Found ${islands.length} isolated components`,
        };
      }

      default:
        throw new Error(`Unknown detection type: ${type}`);
    }
  } catch (error) {
    await handleToolError(error, context, `${type} detection`, 'detect');

    const errorMessage = error instanceof Error ? error.message : String(error);

    // For unknown detection type, throw the error instead of returning
    if (errorMessage.includes('Unknown detection type')) {
      throw error;
    }

    return {
      type,
      status: 'error',
      message: errorMessage,
      components: [],
    };
  }
};
