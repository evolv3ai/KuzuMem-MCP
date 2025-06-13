import { KuzuDBClient } from '../db/kuzu';
import { EnrichedRequestHandlerExtra } from '../mcp/types/sdk-custom';
import { Context } from '../types';
import { formatGraphUniqueId } from '../utils/id.utils';
import { RepositoryRepository } from './repository.repository';

/**
 * Repository for Context, using KuzuDB and Cypher queries.
 * Each instance is now tied to a specific KuzuDBClient.
 */
export class ContextRepository {
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository;

  /**
   * Constructor requires an initialized KuzuDBClient instance.
   * @param kuzuClient An initialized KuzuDBClient.
   */
  public constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    if (!kuzuClient) {
      throw new Error('ContextRepository requires an initialized KuzuDBClient instance.');
    }
    if (!repositoryRepo) {
      throw new Error('ContextRepository requires an initialized RepositoryRepository instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  private formatKuzuRowToContext(
    kuzuRowData: any,
    repositoryName: string,
    branch: string,
    logger: EnrichedRequestHandlerExtra['logger'] | Console = console,
  ): Context {
    const rawContext = kuzuRowData.properties || kuzuRowData;
    const logicalId = rawContext.id?.toString();
    const graphUniqueId =
      rawContext.graph_unique_id?.toString() ||
      formatGraphUniqueId(repositoryName, branch, logicalId);

    let iso_date_str: string;
    if (
      typeof rawContext.iso_date === 'object' &&
      rawContext.iso_date !== null &&
      'year' in rawContext.iso_date &&
      'month' in rawContext.iso_date &&
      'day' in rawContext.iso_date
    ) {
      iso_date_str = `${String(rawContext.iso_date.year).padStart(4, '0')}-${String(rawContext.iso_date.month).padStart(2, '0')}-${String(rawContext.iso_date.day).padStart(2, '0')}`;
    } else if (
      typeof rawContext.iso_date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(rawContext.iso_date)
    ) {
      iso_date_str = rawContext.iso_date;
    } else if (typeof rawContext.iso_date === 'string' && rawContext.iso_date.includes('T')) {
      // Handle ISO timestamp format from KuzuDB (e.g., "2025-05-24T00:00:00.000Z")
      iso_date_str = rawContext.iso_date.split('T')[0];
    } else if (typeof rawContext.iso_date === 'number') {
      // Epoch for date?
      iso_date_str = new Date(rawContext.iso_date).toISOString().split('T')[0];
    } else {
      logger.warn(`[ContextRepository format] Unexpected iso_date format from Kuzu, defaulting:`, {
        dateValue: rawContext.iso_date,
      });
      iso_date_str = new Date().toISOString().split('T')[0]; // Use current date instead of 1970-01-01
    }

    const parseTimestamp = (tsValue: any, fieldName: string): Date => {
      if (tsValue instanceof Date) {
        return tsValue;
      }
      if (typeof tsValue === 'number') {
        return new Date(tsValue / 1000);
      } // Assuming microseconds from Kuzu
      if (typeof tsValue === 'string') {
        const d = new Date(tsValue);
        if (!isNaN(d.getTime())) {
          return d;
        }
      }
      logger.warn(
        `[ContextRepository format] Unexpected ${fieldName} format from Kuzu, using current date as default:`,
        { value: tsValue },
      );
      return new Date(); // Fallback
    };

    return {
      id: logicalId,
      graph_unique_id: graphUniqueId,
      name: rawContext.name,
      summary: rawContext.summary,
      iso_date: iso_date_str,
      branch: rawContext.branch,
      repository: `${repositoryName}:${branch}`,
      created_at: parseTimestamp(rawContext.created_at, 'created_at'),
      updated_at: parseTimestamp(rawContext.updated_at, 'updated_at'),
      agent: rawContext.agent,
      related_issue: rawContext.related_issue,
      decisions: Array.isArray(rawContext.decisions)
        ? rawContext.decisions.map(String)
        : rawContext.decisions
          ? [String(rawContext.decisions)]
          : [],
      observations: Array.isArray(rawContext.observations)
        ? rawContext.observations.map(String)
        : rawContext.observations
          ? [String(rawContext.observations)]
          : [],
    } as Context;
  }

  /**
   * Get the latest N contexts for a specific repository node and context branch.
   */
  async getLatestContexts(
    mcpContext: EnrichedRequestHandlerExtra,
    repositoryNodeId: string,
    contextBranch: string,
    limit: number = 10,
  ): Promise<Context[]> {
    const logger = mcpContext.logger || console;

    // Get the repository name from the repositoryNodeId format (repo:branch)
    const [repositoryName] = repositoryNodeId.includes(':')
      ? repositoryNodeId.split(':')
      : [repositoryNodeId, contextBranch];

    const repoBranchPrefix = `${repositoryName}:${contextBranch}`;

    // Query contexts that belong to the specific repository:branch
    // Context table only has: graph_unique_id, id, name, summary, iso_date, branch
    const query = `
      MATCH (c:Context)
      WHERE c.graph_unique_id STARTS WITH $repoBranchPrefix
        AND c.branch = $contextBranch
      RETURN c
      ORDER BY c.created_at DESC
      LIMIT $limit
    `;
    const params = { repoBranchPrefix, contextBranch, limit };
    logger.debug(
      `[ContextRepository] getLatestContexts for ${repositoryNodeId}, branch ${contextBranch}, limit ${limit}`,
    );
    logger.debug(`[ContextRepository] Query: ${query.trim()}`, params);
    try {
      logger.info(`[ContextRepository] Executing query: ${query.trim()}`, { params });
      const result = await this.kuzuClient.executeQuery(query, params);
      logger.info(
        `[ContextRepository] Query completed successfully. Result type: ${Array.isArray(result) ? 'Array' : typeof result}`,
        { resultLength: Array.isArray(result) ? result.length : 'N/A' },
      );

      // Handle different result patterns like we did for components
      if (Array.isArray(result)) {
        if (result.length === 0) {
          return [];
        }
        const contexts = result.map((row: any) => {
          const contextData = row.c ?? row['c'] ?? row;
          // Skip formatKuzuRowToContext for now and return basic context object
          return {
            id: contextData.id || contextData.properties?.id || 'unknown',
            graph_unique_id:
              contextData.graph_unique_id || contextData.properties?.graph_unique_id || 'unknown',
            name: contextData.name || contextData.properties?.name || 'Unknown Context',
            summary: contextData.summary || contextData.properties?.summary || null,
            iso_date: (function () {
              const rawDate = contextData.iso_date || contextData.properties?.iso_date;
              if (typeof rawDate === 'string') {
                return rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
              } else if (rawDate instanceof Date) {
                return rawDate.toISOString().split('T')[0];
              } else {
                return new Date().toISOString().split('T')[0];
              }
            })(),
            branch: contextBranch,
            repository: repoBranchPrefix,
            created_at: new Date(
              contextData.created_at || contextData.properties?.created_at || Date.now(),
            ),
            updated_at: new Date(
              contextData.updated_at || contextData.properties?.updated_at || Date.now(),
            ),
            agent: contextData.agent || contextData.properties?.agent || null,
            related_issue:
              contextData.related_issue || contextData.properties?.related_issue || null,
            decisions: contextData.decisions || contextData.properties?.decisions || [],
            observations: contextData.observations || contextData.properties?.observations || [],
          } as Context;
        });
        logger.info(
          `[ContextRepository] Retrieved ${contexts.length} latest contexts for ${repositoryNodeId}`,
        );
        return contexts;
      }

      // Handle getAll pattern
      if (!result || typeof result.getAll !== 'function') {
        logger.warn(
          `[ContextRepository] No result from getLatestContexts query for ${repositoryNodeId}`,
        );
        return [];
      }

      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }

      const repoNameFromNodeId = repositoryNodeId.split(':')[0];
      const contexts = rows.map((row: any) => {
        const contextData = row.c;
        // Skip formatKuzuRowToContext for now and return basic context object
        return {
          id: contextData.id || contextData.properties?.id || 'unknown',
          graph_unique_id:
            contextData.graph_unique_id || contextData.properties?.graph_unique_id || 'unknown',
          name: contextData.name || contextData.properties?.name || 'Unknown Context',
          summary: contextData.summary || contextData.properties?.summary || null,
          iso_date: (function () {
            const rawDate = contextData.iso_date || contextData.properties?.iso_date;
            if (typeof rawDate === 'string') {
              return rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
            } else if (rawDate instanceof Date) {
              return rawDate.toISOString().split('T')[0];
            } else {
              return new Date().toISOString().split('T')[0];
            }
          })(),
          branch: contextBranch,
          repository: repositoryNodeId,
          created_at: new Date(
            contextData.created_at || contextData.properties?.created_at || Date.now(),
          ),
          updated_at: new Date(
            contextData.updated_at || contextData.properties?.updated_at || Date.now(),
          ),
          agent: contextData.agent || contextData.properties?.agent || null,
          related_issue: contextData.related_issue || contextData.properties?.related_issue || null,
          decisions: contextData.decisions || contextData.properties?.decisions || [],
          observations: contextData.observations || contextData.properties?.observations || [],
        } as Context;
      });
      logger.info(
        `[ContextRepository] Retrieved ${contexts.length} latest contexts for ${repositoryNodeId}`,
      );
      return contexts;
    } catch (error: any) {
      logger.error(
        `[ContextRepository] Error in getLatestContexts for ${repositoryNodeId}, branch ${contextBranch}: ${error.message}`,
        { stack: error.stack },
      );
      return [];
    }
  }

  /**
   * Get the context for a specific repository name, branch, and ISO date.
   * The logical ID for a daily context is typically 'context-[ISODATE]'.
   */
  async getContextByDate(
    mcpContext: EnrichedRequestHandlerExtra,
    repositoryName: string,
    contextBranch: string,
    isoDate: string,
    contextLogicalIdInput?: string,
  ): Promise<Context | null> {
    const logger = mcpContext.logger || console;
    const contextLogicalId = contextLogicalIdInput || `context-${isoDate}`;
    const graphUniqueId = formatGraphUniqueId(repositoryName, contextBranch, contextLogicalId);
    const query = `MATCH (c:Context {graph_unique_id: $graphUniqueId}) RETURN c LIMIT 1`;
    const params = { graphUniqueId };
    logger.debug(`[ContextRepository] getContextByDate for GID ${graphUniqueId}`);
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0 && result[0].c) {
        logger.info(`[ContextRepository] Found context by date for GID ${graphUniqueId}`);
        return this.formatKuzuRowToContext(result[0].c, repositoryName, contextBranch, logger);
      }
      logger.warn(`[ContextRepository] Context not found by date for GID ${graphUniqueId}`);
      return null;
    } catch (error: any) {
      logger.error(
        `[ContextRepository] Error in getContextByDate for GID ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      return null;
    }
  }

  /**
   * Creates or updates a context.
   * `context.repository` is the Repository node PK (e.g., 'my-repo:main').
   * `context.branch` is the branch of this Context entity.
   * `context.id` is the logical ID of this Context entity.
   */
  async upsertContext(
    mcpContext: EnrichedRequestHandlerExtra,
    context: Context,
  ): Promise<Context | null> {
    const logger = mcpContext.logger || console;
    const { repository: repositoryNodeId, branch, id: logicalId, summary, agent } = context;

    const [logicalRepositoryName] = repositoryNodeId.split(':');
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, branch, logicalId);
    const now = new Date().toISOString();

    const query = `
      MERGE (c:Context {id: $id, graph_unique_id: $graphUniqueId})
      ON CREATE SET
        c.summary = $summary,
        c.agent = $agent,
        c.branch = $branch,
        c.repository = $repository,
        c.created_at = $now,
        c.updated_at = $now
      ON MATCH SET
        c.summary = $summary,
        c.agent = $agent,
        c.branch = $branch,
        c.repository = $repository,
        c.updated_at = $now
      RETURN c
    `;

    const params = {
      id: logicalId,
      graphUniqueId,
      summary: summary || '',
      agent,
      branch,
      repository: repositoryNodeId,
      now,
    };

    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0) {
        return this.formatKuzuRowToContext(result[0].c, logicalRepositoryName, branch, logger);
      }
      return null;
    } catch (error: any) {
      logger.error(
        `[ContextRepository] Error in upsertContext for GID ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      throw error;
    }
  }

  /**
   * Find a context by its logical ID and branch, within a given repository name.
   */
  async findByIdAndBranch(
    mcpContext: EnrichedRequestHandlerExtra,
    repositoryName: string,
    itemId: string,
    itemBranch: string,
  ): Promise<Context | null> {
    const logger = mcpContext.logger || console;
    const graphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);
    const query = `MATCH (c:Context {graph_unique_id: $graphUniqueId}) RETURN c LIMIT 1`;
    const params = { graphUniqueId };
    logger.debug(`[ContextRepository] findByIdAndBranch for GID ${graphUniqueId}`);
    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      if (result && result.length > 0 && result[0].c) {
        logger.info(`[ContextRepository] Found context by GID ${graphUniqueId}`);
        return this.formatKuzuRowToContext(result[0].c, repositoryName, itemBranch, logger);
      }
      logger.warn(`[ContextRepository] Context not found by GID ${graphUniqueId}`);
      return null;
    } catch (error: any) {
      logger.error(
        `[ContextRepository] Error in findByIdAndBranch for GID ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      return null;
    }
  }
}
