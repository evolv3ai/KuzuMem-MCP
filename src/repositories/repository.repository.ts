import { KuzuDBClient } from '../db/kuzu';
import { Repository } from '../types';
import { Mutex } from '../utils/mutex';

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

  // Escapes string for Cypher, does NOT add surrounding quotes
  private escapeStr(value: any): string {
    if (value === undefined || value === null) {
      return 'null';
    } // Represents Cypher null
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  /**
   * Find repository by name and branch using synthetic id
   * id = name + ':' + branch
   */
  async findByName(name: string, branch: string = 'main'): Promise<Repository | null> {
    // Log received parameters immediately
    console.error(
      `DEBUG: RepositoryRepository.findByName CALLED with name: '${name}', branch: '${branch}'`,
    );

    const syntheticId = `${name}:${branch}`;
    const escapedId = this.escapeStr(syntheticId);
    const query = `MATCH (r:Repository {id: '${escapedId}'}) RETURN r LIMIT 1`;

    console.error(`E2E_DEBUG: RepositoryRepository.findByName executing query: ${query}`);

    let result;
    try {
      result = await KuzuDBClient.executeQuery(query);
    } catch (e) {
      console.error(
        `DEBUG: RepositoryRepository.findByName KuzuDBClient.executeQuery FAILED for query: ${query}`,
        e,
      );
      return null;
    }

    if (!result || typeof result.getAll !== 'function') {
      console.error(
        `DEBUG: RepositoryRepository.findByName - Kuzu query result invalid or no getAll function. Query: ${query}`,
      );
      return null;
    }

    const rows = await result.getAll();
    console.error(
      `DEBUG: RepositoryRepository.findByName - Kuzu query returned ${rows.length} rows. Query: ${query}`,
    );

    if (!rows || rows.length === 0) {
      console.error(`DEBUG: RepositoryRepository.findByName - No rows returned. Query: ${query}`);
      return null;
    }

    const node = rows[0].r ?? rows[0]['r'] ?? rows[0];
    if (!node) {
      console.error(
        `DEBUG: RepositoryRepository.findByName - Row contained no 'r' property. Query: ${query}`,
      );
      return null;
    }
    if (node.id === undefined) {
      console.error(
        `DEBUG: RepositoryRepository.findByName - Node found, but node.id is undefined. Node:`,
        node,
        `Query: ${query}`,
      );
    }

    return node
      ? ({
          name: node.name,
          branch: node.branch,
          id: node.id, // This is the synthetic id
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
    // console.error(
    //   `E2E_DEBUG: RepositoryRepository.create executing query: ${query}`
    // ); // This line was causing STDOUT pollution issues in tests
    await KuzuDBClient.executeQuery(query);
    return this.findByName(name, branch);
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
    console.error(`E2E_DEBUG: RepositoryRepository.findAll executing query: ${query}`);
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== 'function') {
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any) => {
      const node = row.r ?? row['r'] ?? row;
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
    console.warn('RepositoryRepository.update not implemented');
    throw new Error('Not implemented');
  }

  async delete(id: string): Promise<void> {
    // TODO: Implement Cypher delete logic for Repository
    console.warn('RepositoryRepository.delete not implemented');
    throw new Error('Not implemented');
  }
}
