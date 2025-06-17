import { DetectInputSchema } from '../../../schemas/unified-tool-schemas';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, validateSession, logToolExecution } from '../../../utils/error-utils';

/**
 * Detect Handler
 * Handles pattern detection algorithms across different types
 */
export const detectHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = DetectInputSchema.parse(params);
  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'detect');

  // 3. Log the operation
  logToolExecution(context, `pattern detection: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    projectedGraphName: validatedParams.projectedGraphName,
  });

  // 4. Validate type-specific required parameters
  switch (type) {
    case 'path':
      if (!validatedParams.startNodeId || !validatedParams.endNodeId) {
        throw new Error('startNodeId and endNodeId are required for path detection');
      }
      break;
  }

  try {
    switch (type) {
      case 'cycles': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Detecting cycles in component dependencies...',
          percent: 50,
        });

        const result = await memoryService.getStronglyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'cycles',
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          } as any,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Cycle detection complete. Found ${result.components?.length || 0} components in cycles`,
          percent: 100,
          isFinal: true,
        });

        // Override the type to match what the test expects
        return {
          ...result,
          type: 'cycles',
        };
      }

      case 'islands': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Detecting isolated component islands...',
          percent: 50,
        });

        const result = await memoryService.getWeaklyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'islands',
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          } as any,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Island detection complete. Found ${result.components?.length || 0} components in islands`,
          percent: 100,
          isFinal: true,
        });

        // Override the type to match what the test expects
        return {
          ...result,
          type: 'islands',
        };
      }

      case 'path': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding path from ${validatedParams.startNodeId} to ${validatedParams.endNodeId}...`,
          percent: 50,
        });

        const result = await memoryService.shortestPath(context, clientProjectRoot, {
          type: 'shortest-path',
          repository,
          branch,
          projectedGraphName: validatedParams.projectedGraphName,
          nodeTableNames: validatedParams.nodeTableNames,
          relationshipTableNames: validatedParams.relationshipTableNames,
          startNodeId: validatedParams.startNodeId!,
          endNodeId: validatedParams.endNodeId!,
        } as any);

        await context.sendProgress({
          status: 'complete',
          message: `Path finding complete. Path length: ${result.pathLength || 'N/A'}`,
          percent: 100,
          isFinal: true,
        });

        // Override the type to match what the test expects
        return {
          ...result,
          type: 'path',
        };
      }

      case 'strongly-connected': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Finding strongly connected components...',
          percent: 50,
        });

        const result = await memoryService.getStronglyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'strongly-connected',
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Strongly connected components detection complete. Found ${result.components?.length || 0} components`,
          percent: 100,
          isFinal: true,
        });

        return result;
      }

      case 'weakly-connected': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Finding weakly connected components...',
          percent: 50,
        });

        const result = await memoryService.getWeaklyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'weakly-connected',
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Weakly connected components detection complete. Found ${result.components?.length || 0} components`,
          percent: 100,
          isFinal: true,
        });

        return result;
      }

      default:
        throw new Error(`Unknown detection type: ${type}`);
    }
  } catch (error) {
    await handleToolError(error, context, `${type} detection`, type);

    // Return a minimal error result that still matches the expected output schema
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      type,
      status: 'error',
      message: errorMessage,
      components: [],
    };
  }
};
