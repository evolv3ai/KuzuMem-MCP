import { SdkToolHandler } from '../../../tool-handlers';
import { DetectInputSchema, DetectOutputSchema } from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

/**
 * Detect Handler
 * Handles pattern detection algorithms
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

  // 3. Log the operation
  context.logger.info(`Executing pattern detection: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    projectedGraphName: validatedParams.projectedGraphName,
  });

  try {
    switch (type) {
      case 'strongly-connected': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Detecting strongly connected components (circular dependencies)...',
          percent: 50,
        });

        const result = await memoryService.getStronglyConnectedComponents(
          context,
          clientProjectRoot,
          {
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.results?.components?.length || 0} strongly connected components`,
          percent: 100,
          isFinal: true,
        });

        // Transform results to match our schema
        const components =
          result.results?.components?.map((comp: any) => ({
            componentId: comp.component_id,
            nodes: comp.nodes || [],
          })) || [];

        return {
          type: 'strongly-connected' as const,
          status: result.status,
          components,
          totalComponents: components.length,
          projectedGraphName: validatedParams.projectedGraphName,
          message: result.message,
        } satisfies z.infer<typeof DetectOutputSchema>;
      }

      case 'weakly-connected': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Detecting weakly connected components (isolated subsystems)...',
          percent: 50,
        });

        const result = await memoryService.getWeaklyConnectedComponents(
          context,
          clientProjectRoot,
          {
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.results?.components?.length || 0} weakly connected components`,
          percent: 100,
          isFinal: true,
        });

        // Transform results to match our schema
        const components =
          result.results?.components?.map((comp: any) => ({
            componentId: comp.component_id,
            nodes: comp.nodes || [],
          })) || [];

        return {
          type: 'weakly-connected' as const,
          status: result.status,
          components,
          totalComponents: components.length,
          projectedGraphName: validatedParams.projectedGraphName,
          message: result.message,
        } satisfies z.infer<typeof DetectOutputSchema>;
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