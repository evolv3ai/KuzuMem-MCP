import { KuzuDBClient } from '../db/kuzu';
import { Repository } from '../types';
import { loggers } from '../utils/logger';

/**
 * Repository pattern for Repository nodes in KuzuDB.
 * Each instance is now tied to a specific KuzuDBClient (and thus, a specific database).
 */
export class RepositoryRepository {
  private logger = loggers.repository();
  private kuzuClient: KuzuDBClient;

  /**
   * Constructor is now public and requires a KuzuDBClient.
   * @param kuzuClient An initialized KuzuDBClient instance for a specific repository database.
   */
  public constructor(kuzuClient: KuzuDBClient) {
    if (!kuzuClient) {
      throw new Error('RepositoryRepository requires an initialized KuzuDBClient instance.');
    }
    this.kuzuClient = kuzuClient;
  }

  public getClient(): KuzuDBClient {
    return this.kuzuClient;
  }

  // Escapes string for Cypher, does NOT add surrounding quotes
  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  /**
   * Find repository by name and branch using synthetic id
   * id = name + ':' + branch
   */
  async findByName(name: string, branch: string = 'main'): Promise<Repository | null> {
    const syntheticId = `${name}:${branch}`;
    const query = `MATCH (r:Repository {id: $id}) RETURN r LIMIT 1`;
    const params = { id: syntheticId };
    const nowIso = new Date().toISOString();

    let result;
    try {
      result = await this.kuzuClient.executeQuery(query, params);
    } catch (e) {
      this.logger.error(
        `RepositoryRepository (${this.kuzuClient.dbPath}): executeQuery FAILED for query: ${query}`,
        e,
      );
      return null;
    }

    if (!result || !Array.isArray(result)) {
      return null;
    }

    if (result.length === 0) {
      return null;
    }

    const node = result[0].r ?? result[0]['r'] ?? result[0];
    if (!node) {
      return null;
    }

    return node
      ? ({
          name: node.name,
          branch: node.branch,
          id: node.id,
          created_at: node.created_at ? new Date(node.created_at) : new Date(nowIso),
          updated_at: node.updated_at ? new Date(node.updated_at) : new Date(nowIso),
        } as Repository)
      : null;
  }

  /**
   * Creates a new repository node with synthetic id (id = name + ':' + branch)
   * Returns the created Repository or null if creation failed
   */
  async create(
    repositoryInput: Omit<Repository, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Repository | null> {
    const branch = repositoryInput.branch || 'main';
    const name = repositoryInput.name;
    const syntheticId = `${name}:${branch}`;
    const now = new Date();

    const query = `
      CREATE (r:Repository {
        id: $id,
        name: $name,
        branch: $branch,
        created_at: $now,
        updated_at: $now
      })
      RETURN r
    `;

    const params = {
      id: syntheticId,
      name: name,
      branch: branch,
      now: now,
    };

    try {
      const result = await this.kuzuClient.executeQuery(query, params);

      if (result && Array.isArray(result) && result.length > 0) {
        const node = result[0].r ?? result[0]['r'] ?? result[0];
        if (node) {
          return {
            name: node.name,
            branch: node.branch,
            id: node.id,
            created_at: new Date(node.created_at),
            updated_at: new Date(node.updated_at),
          } as Repository;
        }
      }
      // If creation fails or returns nothing, a null will be returned below
    } catch (error) {
      this.logger.error(`RepositoryRepository: Error during create:`, error);
    }

    return null;
  }

  /**
   * List all repositories, optionally filter by branch
   * Always returns the synthetic id for each repository
   */
  async findAll(branch?: string): Promise<Repository[]> {
    let query = '';
    if (branch) {
      const escapedBranch = this.escapeStr(branch);
      query = `MATCH (r:Repository {branch: '${escapedBranch}'}) RETURN r`;
    } else {
      query = 'MATCH (r:Repository) RETURN r';
    }
    const result = await this.kuzuClient.executeQuery(query);
    if (!result || !Array.isArray(result)) {
      return [];
    }
    if (result.length === 0) {
      return [];
    }
    const nowIso = new Date().toISOString();
    return result.map((row: any) => {
      const node = row.r ?? row['r'] ?? row;
      return {
        name: node.name,
        branch: node.branch,
        id: node.id,
        created_at: node.created_at ? new Date(node.created_at) : new Date(nowIso),
        updated_at: node.updated_at ? new Date(node.updated_at) : new Date(nowIso),
      } as Repository;
    });
  }

  async update(repositoryId: string, repository: Partial<Repository>): Promise<void> {
    const setParts: string[] = [];
    const params: Record<string, any> = { id: repositoryId };

    if (repository.name !== undefined) {
      setParts.push(`r.name = $name`);
      params.name = repository.name;
    }
    if (repository.branch !== undefined) {
      setParts.push(`r.branch = $branch`);
      params.branch = repository.branch;
    }

    if (setParts.length === 0) {
      return; // Nothing to update
    }

    setParts.push(`r.updated_at = $now`);
    params.now = new Date();

    const query = `MATCH (r:Repository {id: $id}) SET ${setParts.join(', ')}`;

    try {
      await this.kuzuClient.executeQuery(query, params);
    } catch (error) {
      this.logger.error(`RepositoryRepository: Error during update of ${repositoryId}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const escapedId = this.escapeStr(id);

    // Delete the repository and all its relationships
    const query = `MATCH (r:Repository {id: '${escapedId}'}) DETACH DELETE r`;

    try {
      await this.kuzuClient.executeQuery(query);
    } catch (error) {
      this.logger.error(`RepositoryRepository: Error during delete of ${id}:`, error);
      throw error;
    }
  }
}
