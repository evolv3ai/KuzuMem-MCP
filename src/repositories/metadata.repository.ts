import { Metadata } from "../types";
import { Mutex } from "../utils/mutex";
const { KuzuDBClient } = require("../db/kuzu");

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

  /**
   * Get metadata node for a repository
   */
  /**
   * Get metadata node for a repository by synthetic id (id = name + ':' + branch)
   */
  async getMetadataForRepository(repository: string, branch: string): Promise<Metadata | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: $repository})-[:HAS_METADATA]->(m:Metadata {branch: $branch}) RETURN m LIMIT 1`,
      { repository, branch }
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].m ?? rows[0]["m"] ?? rows[0];
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
    // Try to update existing metadata node and relationship
    const existing = await this.getMetadataForRepository(
      String(metadata.repository),
      String(metadata.branch)
    );
    if (existing) {
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: $repository})-[:HAS_METADATA]->(m:Metadata {branch: $branch})
         SET m.content = $content
         RETURN m`,
        {
          repository: String(metadata.repository),
          branch: String(metadata.branch),
          content: metadata.content,
        }
      );
      return {
        ...existing,
        content: metadata.content,
      };
    } else {
      // Create Metadata node and relationship
      const now = new Date().toISOString();
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: $repository})
         CREATE (repo)-[:HAS_METADATA]->(m:Metadata {
           yaml_id: $yamlId,
           name: $name,
           content: $content,
           branch: $branch,
           created_at: timestamp('${now}'),
           updated_at: timestamp('${now}')
         })
         RETURN m`,
        {
          repository: String(metadata.repository),
          yamlId: metadata.yaml_id,
          name: metadata.name,
          content: metadata.content,
          branch: String(metadata.branch),
        }
      );
      return this.getMetadataForRepository(String(metadata.repository), String(metadata.branch));
    }
  }
}
