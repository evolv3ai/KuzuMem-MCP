import { AnalyzeInputSchema } from '../../../schemas/unified-tool-schemas';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

/**
 * Analyze Handler
 * Handles system analysis algorithms across 4 different types: pagerank, k-core, louvain, shortest-path
 */
export const analyzeHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = AnalyzeInputSchema.parse(params);
  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'analyze');
  if (!memoryService.graphAnalysis) {
    throw new Error('GraphAnalysisService not initialized in MemoryService');
  }

  // 3. Log the operation
  logToolExecution(context, `analysis: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    projectedGraphName: validatedParams.projectedGraphName,
  });

  // 4. Validate type-specific required parameters
  switch (type) {
    case 'k-core':
      if (!validatedParams.k) {
        throw new Error('k parameter is required for k-core analysis');
      }
      break;
    case 'shortest-path':
      if (!validatedParams.startNodeId || !validatedParams.endNodeId) {
        throw new Error(
          'startNodeId and endNodeId parameters are required for shortest-path analysis',
        );
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

        const result = await memoryService.graphAnalysis.pageRank(
          context,
          clientProjectRoot,
          {
            type: 'pagerank',
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
            damping: validatedParams.damping,
            maxIterations: validatedParams.maxIterations,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `PageRank analysis complete. Found ${result.nodes?.length || 0} nodes`,
          percent: 100,
          isFinal: true,
        });

        return result;
      }

      case 'k-core': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Running k-core decomposition with k=${validatedParams.k}...`,
          percent: 50,
        });

        const result = await memoryService.graphAnalysis.kCoreDecomposition(
          context,
          clientProjectRoot,
          {
            type: 'k-core',
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
            k: validatedParams.k!,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `K-core analysis complete. Found ${result.nodes?.length || 0} nodes`,
          percent: 100,
          isFinal: true,
        });

        return result;
      }

      case 'louvain': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Running Louvain community detection...',
          percent: 50,
        });

        const result = await memoryService.graphAnalysis.louvainCommunityDetection(
          context,
          clientProjectRoot,
          {
            type: 'louvain',
            repository,
            branch,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Community detection complete. Found ${result.nodes?.length || 0} nodes`,
          percent: 100,
          isFinal: true,
        });

        return result;
      }

      case 'shortest-path': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding shortest path from ${validatedParams.startNodeId} to ${validatedParams.endNodeId}...`,
          percent: 50,
        });

        const result = await memoryService.graphAnalysis.shortestPath(
          context,
          clientProjectRoot,
          {
            type: 'shortest-path',
            repository,
            branch,
            startNodeId: validatedParams.startNodeId!,
            endNodeId: validatedParams.endNodeId!,
            projectedGraphName: validatedParams.projectedGraphName,
            nodeTableNames: validatedParams.nodeTableNames,
            relationshipTableNames: validatedParams.relationshipTableNames,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Shortest path analysis complete. Path found: ${result.pathFound}`,
          percent: 100,
          isFinal: true,
        });

        return result;
      }

      default:
        throw new Error(`Unknown analysis type: ${type}`);
    }
  } catch (error) {
    await handleToolError(error, context, `${type} analysis`, type);
    throw error;
  }
};
