import { Metadata } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';
import { formatGraphUniqueId, parseGraphUniqueId } from '../utils/id.utils';

/**
 * Thread-safe singleton repository for Metadata, using KuzuDB and Cypher queries
 */
export class MetadataRepository {
  private static instance: MetadataRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<MetadataRepository> {
    const release = await MetadataRepository.lock.acquire();
    try {
      if (!MetadataRepository.instance) {
        MetadataRepository.instance = new MetadataRepository();
      }
      return MetadataRepository.instance;
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

  private escapeJsonProp(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    } // Return Cypher keyword null
    try {
      const jsonString = JSON.stringify(value);
      return `'${this.escapeStr(jsonString)}'`; // Produces a Cypher string: e.g. '"{\"key\":\"value\"}"'
    } catch (e) {
      console.error('Failed to stringify JSON for escapeJsonProp', value, e);
      return 'null'; // Return Cypher keyword null for consistency
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

    const query = `MATCH (m:Metadata {graph_unique_id: '${escapedGraphUniqueId}'}) RETURN m LIMIT 1`;
    // console.error for query logging can be added if needed for debugging

    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }

    const metadataData = rows[0].m ?? rows[0]['m'];
    return {
      ...metadataData,
      id: metadataData.id, // Ensure logical id is mapped
      graph_unique_id: undefined, // Do not expose internal DB PK
    } as Metadata;
  }

  /**
   * Creates or updates metadata for a repository.
   * The input `metadata.repository` is the Repository node's PK (e.g., 'my-project:main').
   * The `metadata.branch` is the branch this metadata applies to.
   * The `metadata.id` is the logical ID (e.g., 'meta').
   */
  async upsertMetadata(metadata: Metadata): Promise<Metadata | null> {
    const repositoryNodeId = metadata.repository; // This is PK of Repository, e.g., 'my-project:main'

    // Extract the logical repository name from the Repository Node ID
    const repoIdParts = repositoryNodeId.split(':');
    if (repoIdParts.length < 2) {
      // Ensure at least 'name' and 'branch' parts exist
      throw new Error(
        `Invalid repositoryNodeId format: ${repositoryNodeId}. Expected format 'repositoryName:repositoryBranch'.`,
      );
    }
    const logicalRepositoryName = repoIdParts[0]; // Get the 'my-project' part
    // const repositorysOwnBranch = repoIdParts[1]; // Branch of the repository node itself, if needed

    const metadataBranch = metadata.branch; // Branch this specific metadata document pertains to
    const logicalId = metadata.id || 'meta'; // Logical ID for this metadata (usually 'meta')

    // graph_unique_id for Metadata is repoName (logical) : metadataBranch : metadataLogicalId
    const graphUniqueId = formatGraphUniqueId(logicalRepositoryName, metadataBranch, logicalId);
    const escapedGraphUniqueId = this.escapeStr(graphUniqueId);

    const escapedRepoNodeId = this.escapeStr(repositoryNodeId); // For MATCH (repo:Repository {id: ... })
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

    await KuzuDBClient.executeQuery(query);
    // When finding, use the logicalRepositoryName, the metadata's own branch, and its logicalId
    return this.findMetadata(logicalRepositoryName, metadataBranch, logicalId);
  }
}
