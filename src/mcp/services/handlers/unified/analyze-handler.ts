import { SdkToolHandler } from '../../../tool-handlers';
import { 
  AnalyzeInputSchema,
  PageRankOutputSchema,
  ShortestPathOutputSchema,
  KCoreOutputSchema,
  LouvainOutputSchema,
} from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

/**
 * Analyze Handler
 * Handles system analysis algorithms across 4 different types
 */
export const analyzeHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = AnalyzeInputSchema.parse(params);
  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Executing analysis: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    projectedGraphName: validatedParams.projectedGraphName,
  });

  // 4. Validate type-specific required parameters
  switch (type) {
    case 'shortest-path':
      if (!validatedParams.startNodeId || !validatedParams.endNodeId) {
        throw new Error('startNodeId and endNodeId are required for shortest-path analysis');
      }
      break;
    case 'k-core':
      if (!validatedParams.k) {
        throw new Error('k parameter is required for k-core analysis');
      }
      break;
  }

  try {
    switch (type) {
      case 'pagerank': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Running PageRank analysis...',
          percent: 50,
        });

        const result = await memoryService.pageRank(context, clientProjectRoot, {
          repository,
          branch,
          projectedGraphName: validatedParams.projectedGraphName,
          nodeTableNames: validatedParams.nodeTableNames,
          relationshipTableNames: validatedParams.relationshipTableNames,
          dampingFactor: validatedParams.damping,
          maxIterations: validatedParams.maxIterations,
        });

        await context.sendProgress({
          status: 'complete',
          message: `PageRank analysis complete. Found ${result.results?.ranks?.length || 0} nodes`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'pagerank' as const,
          status: result.status,
          nodes: result.results?.ranks?.map((r: any) => ({ id: r.nodeId, pagerank: r.score })) || [],
          projectedGraphName: validatedParams.projectedGraphName,
          message: result.message,
        } satisfies z.infer<typeof PageRankOutputSchema>;
      }

      case 'shortest-path': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding shortest path from ${validatedParams.startNodeId} to ${validatedParams.endNodeId}...`,
          percent: 50,
        });

        const result = await memoryService.shortestPath(context, clientProjectRoot, {
          repository,
          branch,
          projectedGraphName: validatedParams.projectedGraphName,
          nodeTableNames: validatedParams.nodeTableNames,
          relationshipTableNames: validatedParams.relationshipTableNames,
          startNodeId: validatedParams.startNodeId!,
          endNodeId: validatedParams.endNodeId!,
        });

        await context.sendProgress({
          status: 'complete',
          message: result.results?.pathFound
            ? `Path found with length ${result.results?.path?.length || 0}`
            : 'No path found between nodes',
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'shortest-path' as const,
          status: result.status,
          pathFound: result.results?.pathFound || false,
          path: result.results?.path?.map((p: any) => p.id) || [],
          pathLength: result.results?.path?.length,
          message: result.message,
        } satisfies z.infer<typeof ShortestPathOutputSchema>;
      }

      case 'k-core': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Running k-core decomposition with k=${validatedParams.k}...`,
          percent: 50,
        });

        const result = await memoryService.kCoreDecomposition(context, clientProjectRoot, {
          repository,
          branch,
          projectedGraphName: validatedParams.projectedGraphName,
          nodeTableNames: validatedParams.nodeTableNames,
          relationshipTableNames: validatedParams.relationshipTableNames,
          k: validatedParams.k!,
        });

        await context.sendProgress({
          status: 'complete',
          message: `K-core analysis complete. Found ${result.results?.components?.length || 0} nodes`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'k-core' as const,
          status: result.status,
          nodes:
            result.results?.components?.map((n: any) => ({
              id: n.nodeId,
              coreNumber: n.coreness,
            })) || [],
          projectedGraphName: validatedParams.projectedGraphName,
          message: result.message,
        } satisfies z.infer<typeof KCoreOutputSchema>;
      }

      case 'louvain': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Running Louvain community detection...',
          percent: 50,
        });

        const result = await memoryService.louvainCommunityDetection(context, clientProjectRoot, {
          repository,
          branch,
          projectedGraphName: validatedParams.projectedGraphName,
          nodeTableNames: validatedParams.nodeTableNames,
          relationshipTableNames: validatedParams.relationshipTableNames,
        });

        await context.sendProgress({
          status: 'complete',
          message: `Community detection complete. Found ${result.results?.communities?.length || 0} nodes`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'louvain' as const,
          status: result.status,
          nodes:
            result.results?.communities?.map((c: any) => ({
              id: c.nodeId,
              communityId: c.communityId,
            })) || [],
          projectedGraphName: validatedParams.projectedGraphName,
          message: result.message,
        } satisfies z.infer<typeof LouvainOutputSchema>;
      }

      default:
        throw new Error(`Unknown analysis type: ${type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Analysis failed: ${errorMessage}`, {
      type,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to execute ${type} analysis: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    throw error;
  }
};