import { Component } from '../types';
import { BaseRepository } from './base.repository';
import { Mutex } from '../utils/mutex';

export class ComponentRepository extends BaseRepository<Component> {
  private static instance: ComponentRepository;
  private static lock = new Mutex();

  private constructor() {
    super('components');
  }

  static async getInstance(): Promise<ComponentRepository> {
    // Acquire lock for thread safety
    const release = await ComponentRepository.lock.acquire();
    
    try {
      if (!ComponentRepository.instance) {
        ComponentRepository.instance = new ComponentRepository();
      }
      
      return ComponentRepository.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  async getActiveComponents(repositoryId: number): Promise<Component[]> {
    return this.db(this.tableName)
      .where({ 
        repository_id: repositoryId,
        status: 'active'
      })
      .orderBy('name', 'asc');
  }

  async upsertComponent(component: Component): Promise<Component> {
    const existing = await this.findByYamlId(component.repository_id, component.yaml_id);
    
    if (existing) {
      await this.update(existing.id!, {
        name: component.name,
        kind: component.kind,
        depends_on: component.depends_on,
        status: component.status
      });
      
      return {
        ...existing,
        name: component.name,
        kind: component.kind,
        depends_on: component.depends_on,
        status: component.status
      };
    } else {
      return this.create(component);
    }
  }
}
