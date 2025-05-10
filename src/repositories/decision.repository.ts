import { Decision } from '../types';
import { BaseRepository } from './base.repository';
import { Mutex } from '../utils/mutex';

export class DecisionRepository extends BaseRepository<Decision> {
  private static instance: DecisionRepository;
  private static lock = new Mutex();

  private constructor() {
    super('decisions');
  }

  static async getInstance(): Promise<DecisionRepository> {
    // Acquire lock for thread safety
    const release = await DecisionRepository.lock.acquire();
    
    try {
      if (!DecisionRepository.instance) {
        DecisionRepository.instance = new DecisionRepository();
      }
      
      return DecisionRepository.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  async getDecisionsByDateRange(
    repositoryId: number, 
    startDate: string, 
    endDate: string
  ): Promise<Decision[]> {
    return this.db(this.tableName)
      .where({ repository_id: repositoryId })
      .whereBetween('date', [startDate, endDate])
      .orderBy('date', 'desc');
  }

  async upsertDecision(decision: Decision): Promise<Decision> {
    const existing = await this.findByYamlId(decision.repository_id, decision.yaml_id);
    
    if (existing) {
      await this.update(existing.id!, {
        name: decision.name,
        context: decision.context,
        date: decision.date
      });
      
      return {
        ...existing,
        name: decision.name,
        context: decision.context,
        date: decision.date
      };
    } else {
      return this.create(decision);
    }
  }
}
