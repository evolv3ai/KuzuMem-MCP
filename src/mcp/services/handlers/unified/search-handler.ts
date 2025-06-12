import { SdkToolHandler } from '../../../tool-handlers';

// TypeScript interface for search parameters
interface SearchParams {
  mode?: 'fulltext' | 'semantic' | 'hybrid';
  query: string;
  repository: string;
  branch?: string;
  entityTypes?: string[];
  limit?: number;
  conjunctive?: boolean;
  threshold?: number;
}

// Search result interface
interface SearchResult {
  id: string;
  type: string;
  name: string;
  score: number;
  snippet?: string;
  metadata?: Record<string, any>;
}

/**
 * Unified Search Handler
 * Supports both full-text search and semantic search (future)
 */
export const searchHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as SearchParams;

  // Basic validation
  if (!validatedParams.query) {
    throw new Error('query parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

  const {
    mode = 'fulltext',
    query,
    repository,
    branch = 'main',
    entityTypes = ['component', 'decision', 'rule', 'context'],
    limit = 10,
    conjunctive = false,
    threshold = 0.7,
  } = validatedParams;

  // Validate limit range
  if (limit < 1 || limit > 50) {
    throw new Error('limit must be between 1 and 50');
  }

  // Validate threshold range
  if (threshold < 0 || threshold > 1) {
    throw new Error('threshold must be between 0.0 and 1.0');
  }

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Search requested (mode: ${mode})`, {
    mode,
    query,
    repository,
    branch,
    clientProjectRoot,
    entityTypes,
    limit,
    conjunctive,
  });

  // 4. Send progress notification
  await context.sendProgress({
    status: 'in_progress',
    message: `Executing ${mode} search for "${query}"`,
    percent: 25,
  });

  // 5. Execute search based on mode
  let results: SearchResult[] = [];

  try {
    if (mode === 'fulltext') {
      // Full-text search implementation
      results = await executeFullTextSearch(
        query,
        entityTypes,
        repository,
        branch,
        clientProjectRoot,
        limit,
        conjunctive,
        memoryService,
        context,
      );
    } else if (mode === 'semantic') {
      // Placeholder for future semantic search
      await context.sendProgress({
        status: 'in_progress',
        message: 'Semantic search is a future capability - returning placeholder results',
        percent: 50,
      });

      results = [
        {
          id: 'placeholder-result',
          type: 'component',
          name: 'Semantic Search Placeholder',
          score: 0.99,
          snippet: 'This is a placeholder for future semantic search functionality',
          metadata: {
            note: 'Real implementation will use embeddings and vector similarity',
          },
        },
      ];
    } else if (mode === 'hybrid') {
      // Placeholder for future hybrid search
      await context.sendProgress({
        status: 'in_progress',
        message: 'Hybrid search is a future capability - using fulltext mode only',
        percent: 50,
      });

      results = await executeFullTextSearch(
        query,
        entityTypes,
        repository,
        branch,
        clientProjectRoot,
        limit,
        conjunctive,
        memoryService,
        context,
      );
    }

    // 6. Final progress notification
    await context.sendProgress({
      status: 'complete',
      message: `Search completed with ${results.length} results`,
      percent: 100,
      isFinal: true,
    });

    // 7. Return results
    return {
      status: 'success',
      results,
      totalResults: results.length,
      query,
      mode,
      message: `${mode} search completed successfully`,
    };
  } catch (error) {
    context.logger.error('Search operation failed', { error: (error as Error).message });

    await context.sendProgress({
      status: 'error',
      message: `Search failed: ${(error as Error).message}`,
      percent: 100,
      isFinal: true,
    });

    return {
      status: 'error',
      results: [],
      totalResults: 0,
      query,
      mode,
      message: `Search failed: ${(error as Error).message}`,
    };
  }
};

/**
 * Execute full-text search using KuzuDB's FTS extension
 */
async function executeFullTextSearch(
  query: string,
  entityTypes: string[],
  repository: string,
  branch: string,
  clientProjectRoot: string,
  limit: number,
  conjunctive: boolean,
  memoryService: any,
  context: any,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Check if FTS extension is installed and loaded
  await ensureFtsExtensionLoaded(memoryService, repository, branch, clientProjectRoot, context);

  // For each entity type, execute FTS query
  for (const entityType of entityTypes) {
    // Convert to proper table name (capitalized)
    const tableName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
    const indexName = `${entityType}_fts_index`;

    try {
      // Get searchable properties for this entity type
      const searchableProps = getSearchableProperties(entityType);

      // Ensure FTS index exists for this entity type
      await ensureFtsIndexExists(
        memoryService,
        repository,
        branch,
        clientProjectRoot,
        tableName,
        indexName,
        searchableProps,
        context,
      );

      // Execute the FTS query
      const kuzuClient = await memoryService.getKuzuClient(clientProjectRoot);
      const entityResults = await kuzuClient.executeQuery(
        `
        CALL QUERY_FTS_INDEX('${tableName}', '${indexName}', $query, conjunctive := ${conjunctive})
        YIELD node, score
        RETURN node, score
        ORDER BY score DESC
        LIMIT ${limit}
        `,
        { query },
      );

      // Transform results to standard format
      const transformedResults = entityResults.map((result: any) => ({
        id: result.node.id,
        type: entityType,
        name: result.node.name || result.node.title || result.node.id,
        score: result.score,
        snippet: extractSnippet(result.node, query),
        metadata: extractMetadata(result.node),
      }));

      results.push(...transformedResults);
    } catch (error) {
      context.logger.warn(`Error searching ${entityType}`, { error: (error as Error).message });
      // Continue with other entity types even if one fails
    }
  }

  // Sort by score and limit
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Ensure FTS extension is installed and loaded
 */
async function ensureFtsExtensionLoaded(
  memoryService: any,
  repository: string,
  branch: string,
  clientProjectRoot: string,
  context: any,
): Promise<void> {
  try {
    const kuzuClient = await memoryService.getKuzuClient(clientProjectRoot);
    await kuzuClient.executeQuery('INSTALL FTS;');
    await kuzuClient.executeQuery('LOAD FTS;');
  } catch (error) {
    context.logger.warn('FTS extension may already be loaded', { error: (error as Error).message });
  }
}

/**
 * Ensure FTS index exists for the entity type
 */
async function ensureFtsIndexExists(
  memoryService: any,
  repository: string,
  branch: string,
  clientProjectRoot: string,
  tableName: string,
  indexName: string,
  properties: string[],
  context: any,
): Promise<void> {
  try {
    // Check if index already exists
    const indexExists = await checkIndexExists(
      memoryService,
      repository,
      branch,
      clientProjectRoot,
      tableName,
      indexName,
    );

    if (!indexExists) {
      // Create the index
      const propsArray = JSON.stringify(properties);
      const kuzuClient = await memoryService.getKuzuClient(clientProjectRoot);
      await kuzuClient.executeQuery(
        `CALL CREATE_FTS_INDEX('${tableName}', '${indexName}', ${propsArray}, stemmer := 'english');`,
      );

      context.logger.info(`Created FTS index for ${tableName}`, { indexName, properties });
    }
  } catch (error) {
    context.logger.warn(`Could not ensure FTS index for ${tableName}`, {
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Check if an FTS index exists
 */
async function checkIndexExists(
  memoryService: any,
  repository: string,
  branch: string,
  clientProjectRoot: string,
  tableName: string,
  indexName: string,
): Promise<boolean> {
  try {
    const kuzuClient = await memoryService.getKuzuClient(clientProjectRoot);
    const result = await kuzuClient.executeQuery(
      `CALL SHOW_INDEXES() YIELD tableName, indexName, indexType WHERE tableName = '${tableName}' AND indexName = '${indexName}' AND indexType = 'FTS' RETURN COUNT(*) as count`,
    );

    return result[0]?.count > 0;
  } catch (error) {
    // If we can't check, assume it doesn't exist
    return false;
  }
}

/**
 * Get searchable properties for each entity type
 */
function getSearchableProperties(entityType: string): string[] {
  switch (entityType) {
    case 'component':
      return ['name', 'kind'];
    case 'decision':
      return ['name', 'context'];
    case 'rule':
      return ['name', 'content'];
    case 'file':
      return ['name', 'path'];
    case 'context':
      return ['summary', 'observation'];
    default:
      return ['name'];
  }
}

/**
 * Extract a relevant snippet from the node based on the query
 */
function extractSnippet(node: any, query: string): string {
  // Simple implementation - in a real system, this would use proper text extraction
  // and highlighting based on the matched terms

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' && value.toLowerCase().includes(query.toLowerCase())) {
      // Extract a snippet around the match
      const matchIndex = value.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, matchIndex - 40);
      const end = Math.min(value.length, matchIndex + query.length + 40);
      return (
        (start > 0 ? '...' : '') + value.substring(start, end) + (end < value.length ? '...' : '')
      );
    }
  }

  // Fallback
  return node.name || node.title || node.content || node.summary || '';
}

/**
 * Extract relevant metadata from the node
 */
function extractMetadata(node: any): Record<string, any> {
  const metadata: Record<string, any> = {};

  // Extract relevant fields based on entity type
  if (node.kind) {
    metadata.kind = node.kind;
  }
  if (node.status) {
    metadata.status = node.status;
  }
  if (node.created) {
    metadata.created = node.created;
  }
  if (node.updated) {
    metadata.updated = node.updated;
  }
  if (node.path) {
    metadata.path = node.path;
  }
  if (node.language) {
    metadata.language = node.language;
  }
  if (node.date) {
    metadata.date = node.date;
  }
  if (node.type) {
    metadata.type = node.type;
  }

  return metadata;
}
