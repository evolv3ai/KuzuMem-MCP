import { Knex } from "knex";
import db from "../db";
import { Repository } from "../types";
import { Mutex } from "../utils/mutex";

/**
 * Thread-safe implementation of the repository pattern using singleton
 * Following the user's best practices
 */
export class RepositoryRepository {
  private readonly db: Knex;
  private static instance: RepositoryRepository;
  private static lock = new Mutex();

  private constructor() {
    this.db = db;
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

  async findById(id: number): Promise<Repository | null> {
    const repository = await this.db("repositories").where({ id }).first();

    return repository || null;
  }

  async findByName(name: string): Promise<Repository | null> {
    const repository = await this.db("repositories").where({ name }).first();

    return repository || null;
  }

  async create(
    repository: Omit<Repository, "id" | "created_at" | "updated_at">
  ): Promise<Repository> {
    const [id] = await this.db("repositories")
      .insert({
        ...repository,
        updated_at: new Date(),
      })
      .returning("id");

    return {
      ...repository,
      id,
    };
  }

  async update(id: number, repository: Partial<Repository>): Promise<void> {
    await this.db("repositories")
      .where({ id })
      .update({
        ...repository,
        updated_at: new Date(),
      });
  }

  async delete(id: number): Promise<void> {
    await this.db("repositories").where({ id }).delete();
  }

  async findAll(): Promise<Repository[]> {
    return this.db("repositories").select("*");
  }
}
