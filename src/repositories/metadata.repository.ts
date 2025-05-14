import { Metadata } from '../types';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId, parseGraphUniqueId } from '../utils/id.utils';

/**
 * Repository for Metadata, using KuzuDB and Cypher queries.
 * Each instance is now tied to a specific KuzuDBClient.
 */
export class MetadataRepository {
  private kuzuClient: KuzuDBClient; // Instance-specific client

  /**
   * Constructor requires an initialized KuzuDBClient instance.
   * @param kuzuClient An initialized KuzuDBClient.
   */
  public constructor(kuzuClient: KuzuDBClient) {
    // Made public
    if (!kuzuClient) {
      throw new Error('MetadataRepository requires an initialized KuzuDBClient instance.');
    }
    this.kuzuClient = kuzuClient;
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
   * @param repositoryName The logical name of the repository (e.g., 'my-project').
   * @param branch The branch for the metadata (e.g., 'main', 'dev').
   * @param metadataId The logical ID of the metadata (typically 'meta').
   */
  async findMetadata(
    repositoryName: string,
    branch: string,
    metadataId: string = 'meta',
  ): Promise<Metadata | null> {
    const graphUniqueId = formatGraphUniqueId(repositoryName, branch, metadataId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const query = `MATCH (m:Metadata {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN m.id as id, m.name as name, m.content as contentString, m.branch as branch, m.created_at as created_at, m.updated_at as updated_at, labels(m)[0] as label LIMIT 1`;

    const result = await this.kuzuClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }

    const rawData = rows[0];
    let parsedContent: object | string = {};

    if (rawData.contentString && typeof rawData.contentString === 'string') {
      try {
        parsedContent = JSON.parse(rawData.contentString);
        if (typeof parsedContent === 'string') {
          parsedContent = JSON.parse(parsedContent);
        }
      } catch (e) {
        console.error(
          `Failed to parse metadata content for ${graphUniqueId}:`,
          e,
          'Raw content:',
          rawData.contentString,
        );
        parsedContent = { error: 'Failed to parse content', rawContent: rawData.contentString };
      }
    } else {
      console.warn(`No content string found or not a string for metadata ${graphUniqueId}`);
      parsedContent = rawData.content;
    }

    return {
      id: rawData.id,
      name: rawData.name,
      content: parsedContent,
      branch: rawData.branch,
      created_at: rawData.created_at,
      updated_at: rawData.updated_at,
    } as Metadata;
  }

  /**
   * Creates or updates metadata for a repository.
   * The input `metadata.repository` is the Repository node's PK (e.g., 'my-project:main').
   * The `metadata.branch` is the branch this metadata applies to.
   * The `metadata.id` is the logical ID (e.g., 'meta').
   */
  async upsertMetadata(metadata: Metadata): Promise<Metadata | null> {
    const repositoryNodeId = metadata.repository;
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 2) {
      throw new Error(
        `Invalid repositoryNodeId format: ${repositoryNodeId}. Expected format 'repositoryName:repositoryBranch'.`,
      );
    }
    const logicalRepositoryName = repoIdParts[0];

    const metadataBranch = metadata.branch;
    const logicalId = metadata.id || 'meta';
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, metadataBranch, logicalId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const escapedRepoNodeId = this.escapeStr(repositoryNodeId);
    const escapedName = this.escapeStr(metadata.name);
    const escapedContent = this.escapeJsonProp(metadata.content);
    const escapedMetadataBranch = this.escapeStr(metadataBranch);
    const escapedLogicalId = this.escapeStr(logicalId);

    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const query = `
      MATCH (repo:Repository {id: '${escapedRepoNodeId}'})
      MERGE (m:Metadata {graph_unique_id: '${escapedGraphUniqueId}'})
      ON CREATE SET
        m.id = '${escapedLogicalId}',
        m.name = '${escapedName}',
        m.content = ${escapedContent},
        m.branch = '${escapedMetadataBranch}',
        m.created_at = timestamp('${kuzuTimestamp}'),
        m.updated_at = timestamp('${kuzuTimestamp}')
      ON MATCH SET
        m.name = '${escapedName}',
        m.content = ${escapedContent},
        m.branch = '${escapedMetadataBranch}', 
        m.updated_at = timestamp('${kuzuTimestamp}')
      MERGE (repo)-[:HAS_METADATA]->(m)
      RETURN m`;

    await this.kuzuClient.executeQuery(query);
    return this.findMetadata(logicalRepositoryName, metadataBranch, logicalId);
  }
}
