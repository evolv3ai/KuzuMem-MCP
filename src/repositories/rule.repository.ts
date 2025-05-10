import { Rule } from '../types';
import { BaseRepository } from './base.repository';
import { Mutex } from '../utils/mutex';

export class RuleRepository extends BaseRepository<Rule> {
  private static instance: RuleRepository;
  private static lock = new Mutex();

  private constructor() {
    super('rules');
  }

  static async getInstance(): Promise<RuleRepository> {
    // Acquire lock for thread safety
    const release = await RuleRepository.lock.acquire();
    
    try {
      if (!RuleRepository.instance) {
        RuleRepository.instance = new RuleRepository();
      }
      
      return RuleRepository.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  async getActiveRules(repositoryId: number): Promise<Rule[]> {
    return this.db(this.tableName)
      .where({ 
        repository_id: repositoryId,
        status: 'active'
      })
      .orderBy('created', 'desc');
  }

  async upsertRule(rule: Rule): Promise<Rule> {
    const existing = await this.findByYamlId(rule.repository_id, rule.yaml_id);
    
    if (existing) {
      await this.update(existing.id!, {
        name: rule.name,
        triggers: rule.triggers,
        content: rule.content,
        status: rule.status
      });
      
      return {
        ...existing,
        name: rule.name,
        triggers: rule.triggers,
        content: rule.content,
        status: rule.status
      };
    } else {
      return this.create(rule);
    }
  }
}
