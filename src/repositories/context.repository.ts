import { Context } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId, parseGraphUniqueId } from '../utils/id.utils';

/**
 * Thread-safe singleton repository for Context, using KuzuDB and Cypher queries
 */
export class ContextRepository {
  private static instance: ContextRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<ContextRepository> {
    const release = await ContextRepository.lock.acquire();
    try {
      if (!ContextRepository.instance) {
        ContextRepository.instance = new ContextRepository();
      }
      return ContextRepository.instance;
    } finally {
      release();
    }
  }

  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  private formatContext(contextData: any, repositoryNodeId: string): Context {
    let iso_date_str = contextData.iso_date;
    if (contextData.iso_date instanceof Date) {
      iso_date_str = contextData.iso_date.toISOString().split('T')[0];
    }
    return {
      ...contextData,
      id: contextData.id,
      iso_date: iso_date_str,
      repository: repositoryNodeId,
      branch: contextData.branch,
      graph_unique_id: undefined,
    } as Context;
  }

  /**
   * Get the latest N contexts for a specific repository node and context branch.
   */
  async getLatestContexts(
    repositoryNodeId: string,
    contextBranch: string,
    limit: number = 10,
  ): Promise<Context[]> {
    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedContextBranch = this.escapeStr(contextBranch);
    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})-[:HAS_CONTEXT]->(c:Context {branch: '${escapedContextBranch}'})
      RETURN c ORDER BY c.created_at DESC LIMIT ${limit}
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => this.formatContext(row.c ?? row['c'], repositoryNodeId));
  }

  /**
   * Get the context for a specific repository name, branch, and ISO date.
   * The logical ID for a daily context is typically 'context-[ISODATE]'.
   */
  async getContextByDate(
    repositoryName: string,
    contextBranch: string,
    isoDate: string,
    contextLogicalId?: string, // Optional: if a specific logical ID is used other than date-derived
  ): Promise<Context | null> {
    const cId = contextLogicalId || `context-${isoDate}`;
    const graphUniqueId = formatGraphUniqueId(repositoryName, contextBranch, cId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const query = `
      MATCH (c:Context {graph_unique_id: '${escapedGraphUniqueId}'}) 
      RETURN c LIMIT 1
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    const rawContextData = rows[0].c ?? rows[0]['c'];
    if (!rawContextData) {
      return null;
    }
    const repositoryNodeId = `${repositoryName}:${contextBranch}`;
    return this.formatContext(rawContextData, repositoryNodeId);
  }

  /**
   * Creates or updates a context.
   * `context.repository` is the Repository node PK (e.g., 'my-repo:main').
   * `context.branch` is the branch of this Context entity.
   * `context.id` is the logical ID of this Context entity.
   */
  async upsertContext(context: Context): Promise<Context | null> {
    const repositoryNodeId = context.repository; // e.g. 'my-repo:main'

    // Extract the logical repository name from the Repository Node ID
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length === 0) {
      throw new Error(`Invalid repositoryNodeId format in context.repository: ${repositoryNodeId}`);
    }
    const logicalRepositoryName = repoIdParts[0];

    const contextBranch = context.branch;
    const logicalId = context.id;
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, contextBranch, logicalId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedLogicalId = this.escapeStr(logicalId);
    const escapedName = this.escapeStr(context.name);
    const escapedSummary = this.escapeStr(context.summary);
    const escapedIsoDate = this.escapeStr(context.iso_date);
    const escapedBranch = this.escapeStr(contextBranch);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})
      MERGE (c:Context {graph_unique_id: '${escapedGraphUniqueId}'})
      ON CREATE SET
        c.id = '${escapedLogicalId}',
        c.name = '${escapedName}',
        c.summary = '${escapedSummary}',
        c.iso_date = date('${escapedIsoDate}'),
        c.branch = '${escapedBranch}',
        c.created_at = timestamp('${kuzuTimestamp}'),
        c.updated_at = timestamp('${kuzuTimestamp}')
      ON MATCH SET
        c.name = '${escapedName}', 
        c.summary = '${escapedSummary}', 
        c.iso_date = date('${escapedIsoDate}'), 
        c.branch = '${escapedBranch}', 
        c.updated_at = timestamp('${kuzuTimestamp}')
      MERGE (repo)-[:HAS_CONTEXT]->(c)
      RETURN c`;

    await KuzuDBClient.executeQuery(query);
    return this.findByIdAndBranch(logicalRepositoryName, logicalId, contextBranch);
  }

  /**
   * Find a context by its logical ID and branch, within a given repository name.
   */
  async findByIdAndBranch(
    repositoryName: string,
    itemId: string, // Logical ID of the context
    itemBranch: string,
  ): Promise<Context | null> {
    const graphUniqueId = formatGraphUniqueId(repositoryName, itemBranch, itemId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const query = `
      MATCH (c:Context {graph_unique_id: '${escapedGraphUniqueId}'})
      RETURN c LIMIT 1
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    const rawContextData = rows[0].c ?? rows[0]['c'];
    if (!rawContextData) {
      return null;
    }
    const repositoryNodeId = `${repositoryName}:${itemBranch}`;
    return this.formatContext(rawContextData, repositoryNodeId);
  }
}
