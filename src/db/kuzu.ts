// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuzu = require("kuzu");
// Import configuration with db path
import config from "./config";

/**
 * Thread-safe singleton for KuzuDB connections
 * Based on the official KuzuDB documentation:
 * https://docs.kuzudb.com/client-apis/nodejs/
 */
export class KuzuDBClient {
  private static database: any = null;
  private static connection: any = null;
  private static mutex: boolean = false;

  /**
   * Get the singleton connection to KuzuDB
   * Creates database file and connection if needed
   * @param dbPath Optional override for the database path from config
   */
  public static getConnection(dbPath?: string): any {
    // Use provided path or the one from config
    const dbFilePath = dbPath || config.dbPath;
    // Simple mutex to prevent race conditions during initialization
    if (KuzuDBClient.mutex) {
      // Wait for initialization to complete
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      return wait(100).then(() => KuzuDBClient.getConnection(dbPath));
    }

    if (!KuzuDBClient.connection) {
      try {
        KuzuDBClient.mutex = true;
        
        // Create database instance if it doesn't exist
        if (!KuzuDBClient.database) {
          KuzuDBClient.database = new kuzu.Database(dbFilePath);
        }
        
        // Create a connection to the database
        // This is where queries are executed
        KuzuDBClient.connection = new kuzu.Connection(KuzuDBClient.database);
        
      } catch (error) {
        console.error("Error initializing KuzuDB connection:", error);
        throw error;
      } finally {
        KuzuDBClient.mutex = false;
      }
    }
    
    return KuzuDBClient.connection;
  }
  
  /**
   * Helper method to execute queries with proper error handling
   * Based on the official KuzuDB documentation, queries are executed directly on the connection
   */
  public static async executeQuery(query: string): Promise<any> {
    try {
      const conn = this.getConnection();
    // Only two arguments: query string and callback
    console.log("KuzuDBClient.executeQuery:", query, "callback:", typeof (() => {}));
    return await conn.query(query, () => {});
    } catch (error) {
      console.error(`Error executing query: ${query}`, error);
      throw error;
    }
  }
}

/**
 * Initialization function for the init-memory-bank tool
 * Creates required nodes and relationships
 * @param customPath Optional path override, uses config.dbPath by default
 */
export async function initializeKuzuDB(
  customPath?: string
): Promise<void> {
  // Use provided path or fall back to configuration
  const dbPath = customPath || config.dbPath;
  try {
    // Check if any Repository node exists using the executeQuery helper
    const checkRepo = await KuzuDBClient.executeQuery(
      "MATCH (r:Repository) RETURN count(r) as count"
    );
    
    // Get row count from result
    const rows = await checkRepo.getAll();
    const count = rows.length > 0 ? rows[0].get("count") : 0;
    
    if (count === 0) {
      // Create default repository with main branch
      await KuzuDBClient.executeQuery(
        `CREATE (r:Repository {name: 'default', branch: 'main', created_at: datetime(), updated_at: datetime()})`
      );
      console.log("Initialized KuzuDB: default Repository node created.");
    } else {
      console.log("KuzuDB already initialized: Repository node(s) exist.");
    }
  } catch (error) {
    console.error("Error during KuzuDB initialization:", error);
    throw error;
  }
}
