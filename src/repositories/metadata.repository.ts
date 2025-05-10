import { Metadata } from '../types';
import { BaseRepository } from './base.repository';
import { Mutex } from '../utils/mutex';

export class MetadataRepository extends BaseRepository<Metadata> {
  private static instance: MetadataRepository;
  private static lock = new Mutex();

  private constructor() {
    super('metadata');
  }

  static async getInstance(): Promise<MetadataRepository> {
    // Acquire lock for thread safety
    const release = await MetadataRepository.lock.acquire();
    
    try {
      if (!MetadataRepository.instance) {
        MetadataRepository.instance = new MetadataRepository();
      }
      
      return MetadataRepository.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  async getMetadataForRepository(repositoryId: number): Promise<Metadata | null> {
    const result = await this.db(this.tableName)
      .where({ repository_id: repositoryId })
      .first();
    
    return result || null;
  }

  // Creates or updates metadata for a repository (only one metadata per repository)
  async upsertMetadata(metadata: Metadata): Promise<Metadata> {
    const existing = await this.getMetadataForRepository(metadata.repository_id);
    
    if (existing) {
      await this.update(existing.id!, {
        content: metadata.content
      });
      return {
        ...existing,
        content: metadata.content
      };
    } else {
      return this.create(metadata);
    }
  }
}
