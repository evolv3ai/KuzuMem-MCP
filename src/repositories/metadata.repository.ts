import { Metadata } from '../types';
import { Mutex } from '../utils/mutex';
import { KuzuDBClient } from '../db/kuzu';

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
   * Get metadata node for a repository
   */
  /**
   * Get metadata node for a repository by synthetic id (id = name + ':' + branch)
   */
  async getMetadataForRepository(repositoryId: string): Promise<Metadata | null> {
    const escapedRepoId = this.escapeStr(repositoryId);
    const query = `MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_METADATA]->(m:Metadata) RETURN m LIMIT 1`;
    console.error(
      `E2E_DEBUG: MetadataRepository.getMetadataForRepository executing query: ${query}`,
    );
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return null;
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return null;
    }
    return (rows[0].m ?? rows[0]['m'] ?? rows[0]) as Metadata;
  }

  /**
   * Creates or updates metadata for a repository (only one metadata per repository)
   */
  /**
   * Creates or updates metadata for a repository (only one metadata per repository)
   * Returns the upserted Metadata or null if not found
   */
  /**
   * Creates or updates metadata for a repository (only one metadata per repository)
   * Uses the synthetic repository id (id = name + ':' + branch)
   */
  async upsertMetadata(metadata: Metadata): Promise<Metadata | null> {
    const repositoryId = String(metadata.repository);
    const escapedRepoId = this.escapeStr(repositoryId);

    const existing = await this.getMetadataForRepository(repositoryId);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', ''); // Kuzu-specific timestamp

    if (existing) {
      const escapedContent = this.escapeJsonProp(metadata.content);
      const escapedName = this.escapeStr(metadata.name);

      const updateQuery = `
         MATCH (repo:Repository {id: '${escapedRepoId}'})-[:HAS_METADATA]->(m:Metadata)
         SET m.content = ${escapedContent}, m.name = '${escapedName}', m.updated_at = timestamp('${kuzuTimestamp}')
         RETURN m`;
      console.error(
        `E2E_DEBUG: MetadataRepository.upsertMetadata (update) executing query: ${updateQuery}`,
      );
      await KuzuDBClient.executeQuery(updateQuery);

      const updatedMetadata = await this.getMetadataForRepository(repositoryId);
      return updatedMetadata;
    } else {
      const escapedYamlId = this.escapeStr(metadata.yaml_id || 'meta');
      const escapedName = this.escapeStr(metadata.name);
      const escapedContent = this.escapeJsonProp(metadata.content);

      const createQuery = `
         MATCH (repo:Repository {id: '${escapedRepoId}'})
         CREATE (repo)-[:HAS_METADATA]->(m:Metadata {
           yaml_id: '${escapedYamlId}',
           name: '${escapedName}',
           content: ${escapedContent},
           created_at: timestamp('${kuzuTimestamp}'),
           updated_at: timestamp('${kuzuTimestamp}')
         })
         RETURN m`;
      console.error(
        `E2E_DEBUG: MetadataRepository.upsertMetadata (create) executing query: ${createQuery}`,
      );
      await KuzuDBClient.executeQuery(createQuery);
      return this.getMetadataForRepository(repositoryId);
    }
  }
}
