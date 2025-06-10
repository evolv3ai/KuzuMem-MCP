import { SdkToolHandler } from '../../../tool-handlers';
import {
  DetectInputSchema,
  DetectOutputSchema,
  ShortestPathOutputSchema,
} from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

/**
 * Detect Handler
 * Handles pattern detection algorithms: cycles, islands, and shortest paths
 */
export const detectHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = DetectInputSchema.parse(params);
  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Validate type-specific required parameters
  if (type === 'path') {
    if (!validatedParams.startNodeId || !validatedParams.endNodeId) {
      throw new Error('startNodeId and endNodeId are required for path detection');
    }
  }

  // 4. Log the operation
  context.logger.info(`Executing pattern detection: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    projectedGraphName: validatedParams.projectedGraphName,
  });

  try {
    switch (type) {
      case 'cycles': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Detecting cycles (strongly connected components)...',
          percent: 50,
        });

        const result = await memoryService.getStronglyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'strongly-connected' as any, // Temporary type assertion during cleanup
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.totalComponents || 0} cycles`,
          percent: 100,
          isFinal: true,
        });

        return {
          ...result,
          type: 'cycles',
        };
      }

      case 'islands': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Detecting islands (weakly connected components)...',
          percent: 50,
        });

        const result = await memoryService.getWeaklyConnectedComponents(
          context,
          clientProjectRoot,
          {
            type: 'weakly-connected' as any, // Temporary type assertion during cleanup
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.totalComponents || 0} islands`,
          percent: 100,
          isFinal: true,
        });

        return {
          ...result,
          type: 'islands',
        };
      }

      case 'path': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding shortest path from ${validatedParams.startNodeId} to ${validatedParams.endNodeId}...`,
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
        } as any); // Temporary type assertion during cleanup

        await context.sendProgress({
          status: 'complete',
          message: result.pathFound
            ? `Path found with length ${result.pathLength || 0}`
            : 'No path found between nodes',
          percent: 100,
          isFinal: true,
        });

        return {
          ...result,
          type: 'path',
        };
      }

      default:
        throw new Error(`Unknown detection type: ${type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Detection failed: ${errorMessage}`, {
      type,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to execute ${type} detection: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    throw error;
  }
};