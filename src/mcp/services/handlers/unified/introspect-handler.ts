import { SdkToolHandler } from '../../../tool-handlers';
import {
  IntrospectInputSchema,
  LabelsOutputSchema,
  CountOutputSchema,
  PropertiesOutputSchema,
  IndexesOutputSchema,
} from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

/**
 * Introspect Handler
 * Handles all graph schema and metadata introspection operations
 */
export const introspectHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = IntrospectInputSchema.parse(params);
  const { query, repository, branch = 'main', target } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Executing introspect query: ${query}`, {
    repository,
    branch,
    target,
    clientProjectRoot,
  });

  // 4. Validate target parameter for queries that require it
  if ((query === 'count' || query === 'properties') && !target) {
    throw new Error(`Target label is required for ${query} query`);
  }

  try {
    switch (query) {
      case 'labels': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Retrieving all node labels...',
          percent: 50,
        });

        const result = await memoryService.listAllNodeLabels(
          context,
          clientProjectRoot,
          repository,
          branch,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.labels.length} node labels`,
          percent: 100,
          isFinal: true,
        });

        // Ensure required fields are populated
        return {
          labels: result.labels,
          status: 'complete' as const,
          message: result.message || `Found ${result.labels.length} node labels`,
        } satisfies z.infer<typeof LabelsOutputSchema>;
      }

      case 'count': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Counting nodes with label: ${target}`,
          percent: 50,
        });

        const result = await memoryService.countNodesByLabel(
          context,
          clientProjectRoot,
          repository,
          branch,
          target!,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Counted ${result.count} nodes with label ${target}`,
          percent: 100,
          isFinal: true,
        });

        return result satisfies z.infer<typeof CountOutputSchema>;
      }

      case 'properties': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Retrieving properties for label: ${target}`,
          percent: 50,
        });

        const result = await memoryService.getNodeProperties(
          context,
          clientProjectRoot,
          repository,
          branch,
          target!,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.properties.length} properties for label ${target}`,
          percent: 100,
          isFinal: true,
        });

        return result satisfies z.infer<typeof PropertiesOutputSchema>;
      }

      case 'indexes': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Retrieving all database indexes...',
          percent: 50,
        });

        const result = await memoryService.listAllIndexes(
          context,
          clientProjectRoot,
          repository,
          branch,
          target, // Optional filter by label
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.indexes.length} indexes`,
          percent: 100,
          isFinal: true,
        });

        // Ensure all required fields are populated in indexes
        const normalizedIndexes = result.indexes.map((idx) => ({
          name: idx.name,
          tableName: idx.tableName,
          propertyName: idx.propertyName,
          isPrimaryKey: idx.isPrimaryKey ?? false,
          indexType: idx.indexType ?? 'UNKNOWN',
        }));

        return {
          indexes: normalizedIndexes,
        } satisfies z.infer<typeof IndexesOutputSchema>;
      }

      default:
        throw new Error(`Unknown introspection query: ${query}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Introspect query failed: ${errorMessage}`, {
      query,
      target,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to execute ${query} query: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    // Return appropriate error response based on query type
    if (query === 'labels') {
      return {
        labels: [],
        status: 'error' as const,
        message: errorMessage,
      } satisfies z.infer<typeof LabelsOutputSchema>;
    } else if (query === 'count') {
      return {
        label: target || '',
        count: 0,
        message: errorMessage,
      } satisfies z.infer<typeof CountOutputSchema>;
    } else if (query === 'properties') {
      return {
        label: target || '',
        properties: [],
      } satisfies z.infer<typeof PropertiesOutputSchema>;
    } else {
      return {
        indexes: [],
      } satisfies z.infer<typeof IndexesOutputSchema>;
    }
  }
};