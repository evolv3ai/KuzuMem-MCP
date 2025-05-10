import { Component } from "../types";
import { Mutex } from "../utils/mutex";
import { KuzuDBClient } from "../db/kuzu";

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
  async getActiveComponents(repositoryId: string): Promise<Component[]> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (r:Repository {id: '${repositoryId}'})-[:HAS_COMPONENT]->(c:Component {status: 'active'}) RETURN c ORDER BY c.name ASC`
    );
    if (!result || typeof result.getAll !== "function") return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    return rows.map((row: any) => row.c ?? row["c"] ?? row);
  }

  /**
   * Upsert a component by repository_id and yaml_id
   */
  /**
   * Creates or updates a component for a repository
   * Returns the upserted Component or null if not found
   */
  async upsertComponent(component: Component): Promise<Component | null> {
    const existing = await this.findByYamlId(
      String(component.repository),
      String(component.yaml_id)
    );
    if (existing) {
      await KuzuDBClient.executeQuery(
        `MATCH (r:Repository {id: '${component.repository}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${component.yaml_id}'}) SET c.name = '${component.name}', c.kind = '${component.kind}', c.depends_on = '${component.depends_on}', c.status = '${component.status}' RETURN c`
      );
      return {
        ...existing,
        name: component.name,
        kind: component.kind,
        depends_on: component.depends_on,
        status: component.status,
      };
    } else {
      await KuzuDBClient.executeQuery(
        `MATCH (r:Repository {id: '${component.repository}'}) CREATE (r)-[:HAS_COMPONENT]->(c:Component {yaml_id: '${component.yaml_id}', name: '${component.name}', kind: '${component.kind}', depends_on: '${component.depends_on}', status: '${component.status}'}) RETURN c`
      );
      // Return the newly created component
      return this.findByYamlId(
        String(component.repository),
        String(component.yaml_id)
      );
    }
  }

  /**
   * Find a component by repository_id and yaml_id
   */
  async findByYamlId(
    repositoryId: string,
    yaml_id: string
  ): Promise<Component | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (r:Repository {id: '${repositoryId}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${yaml_id}'}) RETURN c LIMIT 1`
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].c ?? rows[0]["c"] ?? rows[0];
  }
}
