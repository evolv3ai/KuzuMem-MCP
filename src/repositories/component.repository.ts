import { Component } from '../types';
import { Mutex } from '../utils/mutex';
const { KuzuDBClient } = require("../db/kuzu");

/**
 * Thread-safe singleton repository for Component, using KuzuDB and Cypher queries
 */
export class ComponentRepository {
  private static instance: ComponentRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<ComponentRepository> {
    const release = await ComponentRepository.lock.acquire();
    try {
      if (!ComponentRepository.instance) {
        ComponentRepository.instance = new ComponentRepository();
      }
      return ComponentRepository.instance;
    } finally {
      release();
    }
  }

  /**
   * Get all active components for a repository (status = 'active'), ordered by name
   */
  async getActiveComponents(repositoryId: number): Promise<Component[]> {
    const result = await this.conn.query(
      'MATCH (c:Component {repository_id: $repositoryId, status: "active"}) RETURN c ORDER BY c.name ASC',
      { repositoryId }
    );
    if (!result) return [];
    return result.map((row: any) => row.get('c'));
  }

  /**
   * Upsert a component by repository_id and yaml_id
   */
  /**
   * Creates or updates a component for a repository
   * Returns the upserted Component or null if not found
   */
  async upsertComponent(component: Component): Promise<Component | null> {
    const existing = await this.findByYamlId(component.repository_id, component.yaml_id);
    if (existing) {
      await this.conn.query(
        'MATCH (c:Component {repository_id: $repository_id, yaml_id: $yaml_id}) SET c.name = $name, c.kind = $kind, c.depends_on = $depends_on, c.status = $status RETURN c',
        {
          repository_id: component.repository_id,
          yaml_id: component.yaml_id,
          name: component.name,
          kind: component.kind,
          depends_on: component.depends_on,
          status: component.status
        }
      );
      return {
        ...existing,
        name: component.name,
        kind: component.kind,
        depends_on: component.depends_on,
        status: component.status
      };
    } else {
      await this.conn.query(
        'CREATE (c:Component {repository_id: $repository_id, yaml_id: $yaml_id, name: $name, kind: $kind, depends_on: $depends_on, status: $status}) RETURN c',
        {
          repository_id: component.repository_id,
          yaml_id: component.yaml_id,
          name: component.name,
          kind: component.kind,
          depends_on: component.depends_on,
          status: component.status
        }
      );
      // Return the newly created component
      return this.findByYamlId(component.repository_id, component.yaml_id);
    }
  }

  /**
   * Find a component by repository_id and yaml_id
   */
  async findByYamlId(repository_id: number, yaml_id: string): Promise<Component | null> {
    const result = await this.conn.query(
      'MATCH (c:Component {repository_id: $repository_id, yaml_id: $yaml_id}) RETURN c LIMIT 1',
      { repository_id, yaml_id }
    );
    if (!result || result.length === 0) return null;
    return result[0].get('c');
  }
}

