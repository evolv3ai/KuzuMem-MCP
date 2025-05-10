const { KuzuDBClient } = require("../db/kuzu");
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

  // Find repository by name and branch using Cypher
  async findByName(name: string, branch: string = 'main'): Promise<Repository | null> {
    const result = await KuzuDBClient.executeQuery(
      "MATCH (r:Repository {name: $name, branch: $branch}) RETURN r LIMIT 1",
      { name, branch }
    );
    if (!result || result.length === 0) return null;
    // Map KuzuDB node to Repository type
    const node = result[0].get("r");
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

  // Create a new repository node (requires branch)
  /**
   * Creates a new repository node (requires branch)
   * Returns the created Repository or null if creation failed
   */
  async create(
    repository: Omit<Repository, "id" | "created_at" | "updated_at">
  ): Promise<Repository | null> {
    const branch = repository.branch || 'main';
    await KuzuDBClient.executeQuery(
      "CREATE (r:Repository {name: $name, branch: $branch, created_at: datetime(), updated_at: datetime()}) RETURN r",
      { name: repository.name, branch }
    );
    // Return the created repository
    return this.findByName(repository.name, branch);
  }

  // List all repositories, optionally filter by branch
  async findAll(branch?: string): Promise<Repository[]> {
    let result;
    if (branch) {
      result = await KuzuDBClient.executeQuery("MATCH (r:Repository {branch: $branch}) RETURN r", { branch });
    } else {
      result = await KuzuDBClient.executeQuery("MATCH (r:Repository) RETURN r");
    }
    if (!result) return [];
    return result.map((row: any) => {
      const node = row.get("r");
      return {
        name: node.name,
        branch: node.branch,
        id: node.id,
        created_at: node.created_at,
        updated_at: node.updated_at,
      } as Repository;
    });
  }

  // Not implemented: update and delete
  async update(id: number, repository: Partial<Repository>): Promise<void> {
    // TODO: Implement Cypher update logic for Repository
    throw new Error("Not implemented");
  }

  async delete(id: number): Promise<void> {
    // TODO: Implement Cypher delete logic for Repository
    throw new Error("Not implemented");
  }
}
