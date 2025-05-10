import { Decision } from "../types";
import { Mutex } from "../utils/mutex";
import { KuzuDBClient } from "../db/kuzu";

/**
 * Thread-safe singleton repository for Decision, using KuzuDB and Cypher queries
 */
export class DecisionRepository {
  private static instance: DecisionRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<DecisionRepository> {
    const release = await DecisionRepository.lock.acquire();
    try {
      if (!DecisionRepository.instance) {
        DecisionRepository.instance = new DecisionRepository();
      }
      return DecisionRepository.instance;
    } finally {
      release();
    }
  }

  /**
   * Get all decisions for a repository in a date range, ordered by date descending
   */
  async getDecisionsByDateRange(
    repository: string,
    startDate: string,
    endDate: string
  ): Promise<Decision[]> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repository}'})-[:HAS_DECISION]->(d:Decision) WHERE d.date >= '${startDate}' AND d.date <= '${endDate}' RETURN d ORDER BY d.date DESC`
    );
    if (!result || typeof result.getAll !== "function") return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    return rows.map((row: any) => row.d ?? row["d"] ?? row);
  }

  /**
   * Upsert a decision by repository and yaml_id
   */
  /**
   * Creates or updates a decision for a repository
   * Returns the upserted Decision or null if not found
   */
  async upsertDecision(decision: Decision): Promise<Decision | null> {
    const existing = await this.findByYamlId(
      String(decision.repository),
      String(decision.yaml_id)
    );
    if (existing) {
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: '${decision.repository}'})-[:HAS_DECISION]->(d:Decision {yaml_id: '${decision.yaml_id}'}) SET d.name = '${decision.name}', d.context = '${decision.context}', d.date = '${decision.date}' RETURN d`
      );
      return {
        ...existing,
        name: decision.name,
        context: decision.context,
        date: decision.date,
      };
    } else {
      await KuzuDBClient.executeQuery(
        `MATCH (repo:Repository {id: '${decision.repository}'}) CREATE (repo)-[:HAS_DECISION]->(d:Decision {yaml_id: '${decision.yaml_id}', name: '${decision.name}', context: '${decision.context}', date: '${decision.date}'}) RETURN d`
      );
      // Return the newly created decision
      return this.findByYamlId(
        String(decision.repository),
        String(decision.yaml_id)
      );
    }
  }

  /**
   * Find a decision by repository and yaml_id
   */
  async findByYamlId(
    repository: string,
    yaml_id: string
  ): Promise<Decision | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (repo:Repository {id: '${repository}'})-[:HAS_DECISION]->(d:Decision {yaml_id: '${yaml_id}'}) RETURN d LIMIT 1`
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].d ?? rows[0]["d"] ?? rows[0];
  }
}
