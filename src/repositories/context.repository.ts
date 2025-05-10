import { Context } from '../types';
import { BaseRepository } from './base.repository';
import { Mutex } from '../utils/mutex';

export class ContextRepository extends BaseRepository<Context> {
  private static instance: ContextRepository;
  private static lock = new Mutex();

  private constructor() {
    super('contexts');
  }

  static async getInstance(): Promise<ContextRepository> {
    // Acquire lock for thread safety
    const release = await ContextRepository.lock.acquire();
    
    try {
      if (!ContextRepository.instance) {
        ContextRepository.instance = new ContextRepository();
      }
      
      return ContextRepository.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  async getLatestContexts(repositoryId: number, limit: number = 10): Promise<Context[]> {
    return this.db(this.tableName)
      .where({ repository_id: repositoryId })
      .orderBy('iso_date', 'desc')
      .limit(limit);
  }

  async getTodayContext(repositoryId: number, today: string): Promise<Context | null> {
    return this.db(this.tableName)
      .where({ 
        repository_id: repositoryId,
        iso_date: today 
      })
      .first();
  }

  async upsertContext(context: Context): Promise<Context> {
    const existing = await this.findByYamlId(context.repository_id, context.yaml_id);
    
    if (existing) {
      await this.update(existing.id!, {
        agent: context.agent,
        related_issue: context.related_issue,
        summary: context.summary,
        decisions: context.decisions,
        observations: context.observations
      });
      
      return {
        ...existing,
        agent: context.agent,
        related_issue: context.related_issue,
        summary: context.summary,
        decisions: context.decisions,
        observations: context.observations
      };
    } else {
      return this.create(context);
    }
  }
}
