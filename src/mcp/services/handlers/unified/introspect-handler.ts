import { SdkToolHandler } from '../../../tool-handlers';

// TypeScript interfaces for introspect parameters
interface IntrospectParams {
  query: 'labels' | 'count' | 'properties' | 'indexes';
  repository: string;
  branch?: string;
  target?: string;
}

// Output interfaces
interface LabelsOutput {
  labels: string[];
  status: 'complete' | 'error';
  message: string;
}

interface CountOutput {
  label: string;
  count: number;
  message?: string;
}

interface PropertyInfo {
  name: string;
  type: string;
}

interface PropertiesOutput {
  label: string;
  properties: PropertyInfo[];
}

interface IndexInfo {
  name: string;
  tableName: string;
  propertyName: string;
  isPrimaryKey: boolean;
  indexType: string;
}

interface IndexesOutput {
  indexes: IndexInfo[];
}

/**
 * Introspect Handler
 * Handles all graph schema and metadata introspection operations
 */
export const introspectHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as IntrospectParams;

  // Basic validation
  if (!validatedParams.query) {
    throw new Error('query parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

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
        } as LabelsOutput;
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

        return result as CountOutput;
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

        return result as PropertiesOutput;
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
        const normalizedIndexes = result.indexes.map((idx: any) => ({
          name: idx.name || idx.index_name || `${idx.tableName}_${idx.propertyName}_idx`,
          tableName: idx.tableName || idx.table_name || '',
          propertyName: idx.propertyName || idx.property_name || '',
          isPrimaryKey: idx.isPrimaryKey ?? idx.is_primary ?? false,
          indexType: idx.indexType || idx.type || 'INDEX',
        }));

        return {
          indexes: normalizedIndexes,
        } as IndexesOutput;
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
      } as LabelsOutput;
    } else if (query === 'count') {
      return {
        label: target || '',
        count: 0,
        message: errorMessage,
      } as CountOutput;
    } else if (query === 'properties') {
      return {
        label: target || '',
        properties: [],
      } as PropertiesOutput;
    } else {
      return {
        indexes: [],
      } as IndexesOutput;
    }
  }
};
