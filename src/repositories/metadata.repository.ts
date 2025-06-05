import { Metadata } from '../types';
import { KuzuDBClient } from '../db/kuzu';
import { RepositoryRepository } from './repository.repository';
import { EnrichedRequestHandlerExtra } from '../mcp/types/sdk-custom';
/**
 * Repository for Metadata, using KuzuDB and Cypher queries.
 * Each instance is now tied to a specific KuzuDBClient.
 */
export class MetadataRepository {
  private kuzuClient: KuzuDBClient; // Instance-specific client
  private repositoryRepo: RepositoryRepository; // Added private member

  /**
   * Constructor requires an initialized KuzuDBClient instance.
   * @param kuzuClient An initialized KuzuDBClient.
   * @param repositoryRepo A RepositoryRepository instance.
   */
  public constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    // Made public
    if (!kuzuClient) {
      throw new Error('MetadataRepository requires an initialized KuzuDBClient instance.');
    }
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo; // Assign to member
  }

  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  private escapeJsonProp(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    try {
      const jsonString = JSON.stringify(value);
      return `'${this.escapeStr(jsonString)}'`;
    } catch (e) {
      console.error('Failed to stringify JSON for escapeJsonProp', value, e);
      return 'null';
    }
  }

  /**
   * Get metadata for a repository, branch, and metadata logical ID (usually 'meta').
   * @param mcpContext The McpServerRequestContext for logging.
   * @param repositoryName The logical name of the repository (e.g., 'my-project').
   * @param branch The branch for the metadata (e.g., 'main', 'dev').
   * @param metadataId The logical ID of the metadata (typically 'meta').
   */
  async findMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    repositoryName: string,
    branch: string,
    metadataId: string = 'meta',
  ): Promise<Metadata | null> {
    const logger = mcpContext.logger || console;
    const graphUniqueId = `${repositoryName}:${branch}:${metadataId}`;
    const query = `MATCH (m:Metadata {graph_unique_id: $graphUniqueId}) RETURN m`;
    logger.debug(`[MetadataRepository] Executing findMetadata query for GID: ${graphUniqueId}`);
    try {
      const result = await this.kuzuClient.executeQuery(query, { graphUniqueId });
      if (result && result.length > 0) {
        const metadataNode = result[0].m.properties || result[0].m;
        let content = metadataNode.content;
        if (typeof content === 'string') {
          try {
            content = JSON.parse(content);
          } catch (e: any) {
            logger.error(
              `[MetadataRepository] Failed to parse metadata content for ${graphUniqueId}: ${e.message}`,
              { rawContent: metadataNode.content },
            );
          }
        }
        logger.info(`[MetadataRepository] Found metadata ${graphUniqueId}`);
        return {
          ...metadataNode,
          id: metadataNode.id?.toString(),
          graph_unique_id: metadataNode.graph_unique_id?.toString(),
          content: content,
          created_at: metadataNode.created_at ? new Date(metadataNode.created_at) : undefined,
          updated_at: metadataNode.updated_at ? new Date(metadataNode.updated_at) : undefined,
        } as Metadata;
      }
      logger.warn(`[MetadataRepository] Metadata not found for GID: ${graphUniqueId}`);
      return null;
    } catch (error: any) {
      logger.error(
        `[MetadataRepository] Error finding metadata ${graphUniqueId}: ${error.message}`,
        { stack: error.stack },
      );
      return null;
    }
  }

  /**
   * Creates or updates metadata for a repository.
   * The input `metadata.repository` is the Repository node's PK (e.g., 'my-project:main').
   * The `metadata.branch` is the branch this metadata applies to.
   * The `metadata.id` is the logical ID (e.g., 'meta').
   */
  async upsertMetadata(
    mcpContext: EnrichedRequestHandlerExtra,
    metadata: Metadata,
  ): Promise<Metadata | null> {
    const logger = mcpContext.logger || console;
    let repoNameForGid: string;
    let branchForGid: string;

    if (metadata.repository && metadata.repository.includes(':')) {
      const parts = metadata.repository.split(':');
      repoNameForGid = parts[0];
      branchForGid = parts.length > 1 ? parts[1] : metadata.branch;
    } else {
      logger.warn(
        '[MetadataRepository] metadata.repository format unexpected for GID construction',
        { repository: metadata.repository },
      );
      repoNameForGid = metadata.repository || 'unknown_repo';
      branchForGid = metadata.branch || 'unknown_branch';
    }
    const graph_unique_id_val = `${repoNameForGid}:${branchForGid}:${metadata.id}`;

    const flatParams = {
      gid: graph_unique_id_val,
      id_val: metadata.id,
      branch_val: metadata.branch,
      name_val: metadata.name,
      content_val: JSON.stringify(metadata.content || {}),
      created_val: (metadata.created_at instanceof Date
        ? metadata.created_at
        : new Date(metadata.created_at || Date.now())
      ).toISOString(),
    };

    const query = `
      MERGE (m:Metadata {graph_unique_id: $gid})
      ON CREATE SET
        m.id = $id_val,
        m.graph_unique_id = $gid,
        m.branch = $branch_val,
        m.name = $name_val,
        m.content = $content_val,
        m.created_at = CASE 
          WHEN $created_val IS NOT NULL THEN timestamp($created_val) 
          ELSE current_timestamp() 
        END,
        m.updated_at = current_timestamp()
      ON MATCH SET
        m.branch = $branch_val,
        m.name = $name_val,
        m.content = $content_val,
        m.updated_at = current_timestamp()
    `;
    logger.debug(`[MetadataRepository] Upserting metadata (PK for query: ${graph_unique_id_val})`, {
      params: Object.keys(flatParams),
    });
    try {
      await this.kuzuClient.executeQuery(query, flatParams);
      logger.info(
        `[MetadataRepository] MERGE executed for metadata (PK: ${graph_unique_id_val}). Attempting to find...`,
      );
      const foundMetadata = await this.findMetadata(
        mcpContext,
        repoNameForGid,
        branchForGid,
        metadata.id,
      );

      if (foundMetadata) {
        logger.info(
          `[MetadataRepository] Metadata upserted and found successfully (PK: ${graph_unique_id_val})`,
        );
        return foundMetadata;
      }
      logger.warn(
        `[MetadataRepository] Upserted metadata but could not find it afterwards (PK: ${graph_unique_id_val})`,
      );
      return null;
    } catch (error: any) {
      logger.error(
        `[MetadataRepository] Error upserting metadata (PK for query: ${flatParams.gid}): ${error.message}`,
        { stack: error.stack },
      );
      return null;
    }
  }
}
