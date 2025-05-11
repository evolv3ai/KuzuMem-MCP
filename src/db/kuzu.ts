// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuzu = require('kuzu');
// Import configuration with db path
import config from './config';

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
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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
        console.error('Error initializing KuzuDB connection:', error);
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
      console.error('KuzuDBClient.executeQuery Triggered. Query:', query);
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
export async function initializeKuzuDB(customPath?: string): Promise<void> {
  // Local helper for escaping strings, mirroring KuzuDBClient.escapeStr
  const localEscapeStr = (value: any): string => {
    if (value === undefined || value === null) {
      return 'null';
    }
    return String(value).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  };

  console.error('E2E_DEBUG: [KuzuDB] Attempting initializeKuzuDB DDL setup...');
  const dbPath = customPath || config.dbPath;
  try {
    console.error('E2E_DEBUG: [KuzuDB] Creating table: Repository...');
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Repository(
      id STRING,
      name STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (id)
    )`);
    console.error('E2E_DEBUG: [KuzuDB] Table Repository: OK');

    console.error('E2E_DEBUG: [KuzuDB] Creating table: Metadata...');
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Metadata(
      yaml_id STRING,
      name STRING,
      content STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.error('E2E_DEBUG: [KuzuDB] Table Metadata: OK');

    console.error('E2E_DEBUG: [KuzuDB] Creating table: Context...');
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Context(
      yaml_id STRING,
      name STRING,
      summary STRING,
      iso_date DATE,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.error('E2E_DEBUG: [KuzuDB] Table Context: OK');

    console.error('E2E_DEBUG: [KuzuDB] Creating table: Component...');
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Component(
      yaml_id STRING,
      name STRING,
      kind STRING,
      status STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.error('E2E_DEBUG: [KuzuDB] Table Component: OK');

    console.error('E2E_DEBUG: [KuzuDB] Creating table: Decision...');
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Decision(
      yaml_id STRING,
      name STRING,
      context STRING,
      date DATE,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.error('E2E_DEBUG: [KuzuDB] Table Decision: OK');

    console.error('E2E_DEBUG: [KuzuDB] Creating table: Rule...');
    await KuzuDBClient.executeQuery(`CREATE NODE TABLE IF NOT EXISTS Rule(
      yaml_id STRING,
      name STRING,
      created DATE,
      triggers STRING[],
      content STRING,
      status STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (yaml_id)
    )`);
    console.error('E2E_DEBUG: [KuzuDB] Table Rule: OK');

    console.error('E2E_DEBUG: [KuzuDB] Creating relationship tables...');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS HAS_METADATA(FROM Repository TO Metadata)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel HAS_METADATA: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS HAS_CONTEXT(FROM Repository TO Context)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel HAS_CONTEXT: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS HAS_COMPONENT(FROM Repository TO Component)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel HAS_COMPONENT: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS HAS_DECISION(FROM Repository TO Decision)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel HAS_DECISION: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS HAS_RULE(FROM Repository TO Rule)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel HAS_RULE: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS DEPENDS_ON(FROM Component TO Component)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel DEPENDS_ON: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS CONTEXT_OF(FROM Context TO Component)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel CONTEXT_OF: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS CONTEXT_OF_DECISION(FROM Context TO Decision)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel CONTEXT_OF_DECISION: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS CONTEXT_OF_RULE(FROM Context TO Rule)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel CONTEXT_OF_RULE: OK');
    await KuzuDBClient.executeQuery(
      `CREATE REL TABLE IF NOT EXISTS DECISION_ON(FROM Decision TO Component)`,
    );
    console.error('E2E_DEBUG: [KuzuDB] Rel DECISION_ON: OK');

    console.error('E2E_DEBUG: [KuzuDB] Installing Algo extension (if not exists)...');
    await KuzuDBClient.executeQuery(`INSTALL ALGO`);
    await KuzuDBClient.executeQuery(`LOAD ALGO`);
    console.error('E2E_DEBUG: [KuzuDB] Algo extension: OK (installed and loaded)');

    console.error('E2E_DEBUG: [KuzuDB] Checking for existing Repository nodes...');
    const checkRepo = await KuzuDBClient.executeQuery(
      'MATCH (r:Repository) RETURN count(r) as count',
    );
    const rows = await checkRepo.getAll();
    const count = rows.length > 0 ? (rows[0].count ?? rows[0]['count']) : 0;
    if (count === 0) {
      const now = new Date().toISOString();
      const kuzuTimestamp = String(now).replace('T', ' ').replace('Z', '');
      const defaultRepoId = 'default:main';
      const defaultRepoName = 'default';
      const defaultBranch = 'main';
      await KuzuDBClient.executeQuery(
        `CREATE (r:Repository {id: '${localEscapeStr(defaultRepoId)}', name: '${localEscapeStr(
          defaultRepoName,
        )}', branch: '${localEscapeStr(
          defaultBranch,
        )}', created_at: timestamp('${kuzuTimestamp}'), updated_at: timestamp('${kuzuTimestamp}')})`,
      );
      console.error('E2E_DEBUG: Initialized KuzuDB: default Repository node created.');
    } else {
      console.error('E2E_DEBUG: KuzuDB already initialized: Repository node(s) exist.');
    }
    console.error('E2E_DEBUG: [KuzuDB] initializeKuzuDB DDL setup finished.');
  } catch (error) {
    console.error('E2E_DEBUG: [KuzuDB] Error during KuzuDB initialization DDL setup:', error);
    throw error;
  }
}
