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
  console.log("[KuzuDB] Running initializeKuzuDB DDL setup...");
  // Use provided path or fall back to configuration
  const dbPath = customPath || config.dbPath;
  try {
    // Create node tables if not exist (DDL)
    console.log("[KuzuDB] Creating table: Repository");
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Repository(
      id STRING,
      name STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (id)
    )`);
    console.log("[KuzuDB] Creating table: Metadata");
    console.log("[KuzuDB] Creating table: Metadata");
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Metadata(
      yaml_id STRING,
      name STRING,
      content STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.log("[KuzuDB] Creating table: Context");
    console.log("[KuzuDB] Creating table: Context");
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Context(
      yaml_id STRING,
      name STRING,
      summary STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.log("[KuzuDB] Creating table: Component");
    console.log("[KuzuDB] Creating table: Component");
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Component(
      yaml_id STRING,
      name STRING,
      kind STRING,
      status STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.log("[KuzuDB] Creating table: Decision");
    console.log("[KuzuDB] Creating table: Decision");
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Decision(
      yaml_id STRING,
      name STRING,
      context STRING,
      date DATE,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.log("[KuzuDB] Creating table: Rule");
    console.log("[KuzuDB] Creating table: Rule");
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Rule(
      yaml_id STRING,
      name STRING,
      content STRING,
      created DATE,
      status STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);

    // Create relationship tables (edges)
    console.log("[KuzuDB] Creating relationship tables...");
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS HAS_METADATA(FROM Repository TO Metadata)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS HAS_CONTEXT(FROM Repository TO Context)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS HAS_COMPONENT(FROM Repository TO Component)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS HAS_DECISION(FROM Repository TO Decision)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS HAS_RULE(FROM Repository TO Rule)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS DEPENDS_ON(FROM Component TO Component)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS CONTEXT_OF(FROM Context TO Component)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS CONTEXT_OF_DECISION(FROM Context TO Decision)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS CONTEXT_OF_RULE(FROM Context TO Rule)`);
    await KuzuDBClient.executeQuery(`CREATE REL TABLE IF NOT EXISTS DECISION_ON(FROM Decision TO Component)`);

    // Check if any Repository node exists using the executeQuery helper
    console.log("[KuzuDB] Checking for existing Repository nodes...");
    const checkRepo = await KuzuDBClient.executeQuery(
      "MATCH (r:Repository) RETURN count(r) as count"
    );
    // Get row count from result
    const rows = await checkRepo.getAll();
    const count = rows.length > 0 ? rows[0].count ?? rows[0]["count"] : 0;
    if (count === 0) {
      // Create default repository with main branch
      const now = new Date().toISOString();
      await KuzuDBClient.executeQuery(
        `CREATE (r:Repository {id: 'default:main', name: 'default', branch: 'main', created_at: timestamp('${now}'), updated_at: timestamp('${now}')})`
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
