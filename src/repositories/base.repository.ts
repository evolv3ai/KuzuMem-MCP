import { Knex } from 'knex';
import db from '../db';
import { BaseEntity } from '../types';

export abstract class BaseRepository<T extends BaseEntity> {
  protected readonly db: Knex;
  protected readonly tableName: string;

  constructor(tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async findByRepositoryId(repositoryId: number): Promise<T[]> {
    return this.db(this.tableName)
      .where({ repository_id: repositoryId })
      .select('*') as Promise<T[]>;
  }

  async findByYamlId(repositoryId: number, yamlId: string): Promise<T | null> {
    const result = await this.db(this.tableName)
      .where({ 
        repository_id: repositoryId,
        yaml_id: yamlId 
      })
      .first();
    
    return result || null;
  }

  async create(item: T): Promise<T> {
    const [id] = await this.db(this.tableName).insert({
      ...item,
      updated_at: new Date(),
    }).returning('id');

    return {
      ...item,
      id,
    };
  }

  async update(id: number, item: Partial<T>): Promise<void> {
    await this.db(this.tableName)
      .where({ id })
      .update({
        ...item,
        updated_at: new Date(),
      });
  }

  async delete(id: number): Promise<void> {
    await this.db(this.tableName)
      .where({ id })
      .delete();
  }

  async findAll(): Promise<T[]> {
    return this.db(this.tableName).select('*') as Promise<T[]>;
  }
}
