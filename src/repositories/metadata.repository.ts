import { Metadata } from '../types';
import { Mutex } from '../utils/mutex';
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
  async getMetadataForRepository(repositoryId: number): Promise<Metadata | null> {
    const result = await this.conn.query(
      'MATCH (m:Metadata {repository_id: $repositoryId}) RETURN m LIMIT 1',
      { repositoryId }
    );
    if (!result || result.length === 0) return null;
    return result[0].get('m');
  }

  /**
   * Creates or updates metadata for a repository (only one metadata per repository)
   */
  /**
 * Creates or updates metadata for a repository (only one metadata per repository)
 * Returns the upserted Metadata or null if not found
 */
async upsertMetadata(metadata: Metadata): Promise<Metadata | null> {
    const existing = await this.getMetadataForRepository(metadata.repository_id);
    if (existing) {
      await this.conn.query(
        'MATCH (m:Metadata {repository_id: $repository_id}) SET m.content = $content RETURN m',
        {
          repository_id: metadata.repository_id,
          content: metadata.content
        }
      );
      return {
        ...existing,
        content: metadata.content
      };
    } else {
      await this.conn.query(
        'CREATE (m:Metadata {repository_id: $repository_id, content: $content}) RETURN m',
        {
          repository_id: metadata.repository_id,
          content: metadata.content
        }
      );
      // Return the newly created metadata
      return this.getMetadataForRepository(metadata.repository_id);
    }
  }
}

