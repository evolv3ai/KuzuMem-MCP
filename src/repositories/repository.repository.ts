import { KuzuDBClient } from '../db/kuzu';
import { Repository } from '../types';

/**
 * Repository pattern for Repository nodes in KuzuDB.
 * Each instance is now tied to a specific KuzuDBClient (and thus, a specific database).
 */
export class RepositoryRepository {
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
    // console.error( // Temporarily disable for cleaner logs during this refactor phase
    //   `RepositoryRepository (${this.kuzuClient.dbPath}): findByName CALLED with name: '${name}', branch: '${branch}'`,
    // );

    const syntheticId = `${name}:${branch}`;
    const escapedId = this.escapeStr(syntheticId);
    const query = `MATCH (r:Repository {id: '${escapedId}'}) RETURN r LIMIT 1`;

    let result;
    try {
      result = await this.kuzuClient.executeQuery(query);
    } catch (e) {
      console.error(
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
    repositoryInput: Omit<Repository, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Repository | null> {
    const branch = repositoryInput.branch || 'main';
    const name = repositoryInput.name;
    const syntheticId = `${name}:${branch}`;

    const escapedId = this.escapeStr(syntheticId);
    const escapedName = this.escapeStr(name);
    const escapedBranch = this.escapeStr(branch);
    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');

    const query = `CREATE (r:Repository {id: '${escapedId}', name: '${escapedName}', branch: '${escapedBranch}', created_at: timestamp('${kuzuTimestamp}'), updated_at: timestamp('${kuzuTimestamp}')}) RETURN r`;

    try {
      const result = await this.kuzuClient.executeQuery(query);
      const found = await this.findByName(name, branch);
      return found;
    } catch (error) {
      console.error(`RepositoryRepository: Error during create:`, error);
      return null;
    }
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
    return result.map((row: any) => {
      const node = row.r ?? row['r'] ?? row;
      return {
        name: node.name,
        branch: node.branch,
        id: node.id,
        created_at: node.created_at,
        updated_at: node.updated_at,
      } as Repository;
    });
  }

  async update(repositoryId: string, repository: Partial<Repository>): Promise<void> {
    const escapedId = this.escapeStr(repositoryId);
    const setParts: string[] = [];

    if (repository.name !== undefined) {
      setParts.push(`r.name = '${this.escapeStr(repository.name)}'`);
    }
    if (repository.branch !== undefined) {
      setParts.push(`r.branch = '${this.escapeStr(repository.branch)}'`);
    }

    if (setParts.length === 0) {
      return; // Nothing to update
    }

    const nowIso = new Date().toISOString();
    const kuzuTimestamp = nowIso.replace('T', ' ').replace('Z', '');
    setParts.push(`r.updated_at = timestamp('${kuzuTimestamp}')`);

    const query = `MATCH (r:Repository {id: '${escapedId}'}) SET ${setParts.join(', ')}`;

    try {
      await this.kuzuClient.executeQuery(query);
    } catch (error) {
      console.error(`RepositoryRepository: Error during update of ${repositoryId}:`, error);
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
      console.error(`RepositoryRepository: Error during delete of ${id}:`, error);
      throw error;
    }
  }
}
