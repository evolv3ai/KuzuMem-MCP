import { KuzuDBClient } from "../db/kuzu";
import { Repository } from "../types";
import { Mutex } from "../utils/mutex";

/**
 * Thread-safe implementation of the repository pattern using singleton
 * Migrated to KuzuDB and Cypher queries
 */
export class RepositoryRepository {
  private conn: any;
  private static instance: RepositoryRepository;
  private static lock = new Mutex();

  private constructor() {
    // Initialize connection for compatibility, but use KuzuDBClient.executeQuery for all queries
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<RepositoryRepository> {
    // Acquire lock for thread safety
    const release = await RepositoryRepository.lock.acquire();

    try {
      if (!RepositoryRepository.instance) {
        RepositoryRepository.instance = new RepositoryRepository();
      }

      return RepositoryRepository.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  /**
   * Find repository by name and branch using synthetic id
   * id = name + ':' + branch
   */
  async findByName(name: string, branch: string = 'main'): Promise<Repository | null> {
    const id = `${name}:${branch}`;
    const result = await KuzuDBClient.executeQuery(
      `MATCH (r:Repository {id: '${id}'}) RETURN r LIMIT 1`
    );
    if (!result || typeof result.getAll !== 'function') return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    const node = rows[0].r ?? rows[0]["r"] ?? rows[0];
    return node
      ? ({
          name: node.name,
          branch: node.branch,
          id: node.id,
          created_at: node.created_at,
          updated_at: node.updated_at,
        } as Repository)
      : null;
  }

  /**
   * Creates a new repository node with synthetic id (id = name + ':' + branch)
   * Returns the created Repository or null if creation failed
   */
  async create(
    repository: Omit<Repository, "id" | "created_at" | "updated_at">
  ): Promise<Repository | null> {
    const branch = repository.branch || 'main';
    const id = `${repository.name}:${branch}`;
    const now = new Date().toISOString();
    await KuzuDBClient.executeQuery(
      `CREATE (r:Repository {id: '${id}', name: '${repository.name}', branch: '${branch}', created_at: timestamp('${now}'), updated_at: timestamp('${now}')}) RETURN r`
    );
    // Return the created repository
    return this.findByName(repository.name, branch);
  }

  /**
   * List all repositories, optionally filter by branch
   * Always returns the synthetic id for each repository
   */
  async findAll(branch?: string): Promise<Repository[]> {
    let result;
    if (branch) {
      result = await KuzuDBClient.executeQuery(`MATCH (r:Repository {branch: '${branch}'}) RETURN r`);
    } else {
      result = await KuzuDBClient.executeQuery("MATCH (r:Repository) RETURN r");
    }
    if (!result || typeof result.getAll !== 'function') return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    return rows.map((row: any) => {
      const node = row.r ?? row["r"] ?? row;
      return {
        name: node.name,
        branch: node.branch,
        id: node.id, // synthetic id
        created_at: node.created_at,
        updated_at: node.updated_at,
      } as Repository;
    });
  }

  // Not implemented: update and delete
  async update(repositoryId: string, repository: Partial<Repository>): Promise<void> {
    // TODO: Implement Cypher update logic for Repository
    throw new Error("Not implemented");
  }

  async delete(id: number): Promise<void> {
    // TODO: Implement Cypher delete logic for Repository
    throw new Error("Not implemented");
  }
}
