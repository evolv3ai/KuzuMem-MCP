// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuzu = require('kuzu');
import path from 'path';
import fs from 'fs';
import config from './config'; // Now imports DB_RELATIVE_DIR and DB_FILENAME
import { Mutex } from '../utils/mutex'; // For ensuring atomic initialization of a KuzuDBClient instance

/**
 * KuzuDBClient: Manages a connection to a specific KuzuDB database instance.
 * Each instance is tied to a specific database file path, determined by the client's project root.
 */
export class KuzuDBClient {
  private database: any = null;
  private connection: any = null;
  public dbPath: string; // Made public
  private static initializationLock = new Mutex(); // Lock for initializing a specific dbPath
  private static initializedPaths = new Set<string>(); // Track initialized schemas to prevent re-running DDL

  /**
   * Creates an instance of KuzuDBClient.
   * The actual database initialization and connection are done in the async initialize method.
   * @param clientProjectRoot The absolute root path of the client project.
   */
  constructor(clientProjectRoot: string) {
    // If clientProjectRoot is not provided or is empty, try to use the CLIENT_PROJECT_ROOT env var
    if (!clientProjectRoot || clientProjectRoot.trim() === '') {
      const envClientRoot = process.env.CLIENT_PROJECT_ROOT;
      if (!envClientRoot || envClientRoot.trim() === '') {
        throw new Error(
          'KuzuDBClient requires a valid clientProjectRoot path. None provided and no CLIENT_PROJECT_ROOT environment variable set.',
        );
      }
      clientProjectRoot = envClientRoot;
      console.log(`KuzuDBClient using CLIENT_PROJECT_ROOT from environment: ${clientProjectRoot}`);
    }

    if (!path.isAbsolute(clientProjectRoot)) {
      throw new Error('KuzuDBClient requires an absolute clientProjectRoot path.');
    }
    // Construct the specific dbPath for this instance
    const repoDbDir = path.join(clientProjectRoot, config.DB_RELATIVE_DIR);
    this.dbPath = path.join(repoDbDir, config.DB_FILENAME);
    console.log(`KuzuDBClient instance created for path: ${this.dbPath}`);
  }

  /**
   * Asynchronously initializes the database and connection for this client instance.
   * Ensures the database directory exists and schema is initialized (idempotently).
   */
  async initialize(): Promise<void> {
    const release = await KuzuDBClient.initializationLock.acquire();
    try {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`KuzuDBClient: Created database directory: ${dbDir}`);
      }

      if (!this.database) {
        this.database = new kuzu.Database(this.dbPath);
        console.log(
          `KuzuDBClient: Database object initialized for ${this.dbPath} (using Kuzu default system config).`,
        );
      }

      if (!this.connection) {
        this.connection = new kuzu.Connection(this.database);
        console.log(`KuzuDBClient: Connection established to ${this.dbPath}`);
      }

      // Check if schema needs initialization by verifying a key table's existence
      let schemaNeedsInit = true;
      if (!KuzuDBClient.initializedPaths.has(this.dbPath)) {
        // First check in-memory flag for current process
        try {
          // Try to query a known table. If this fails or returns empty, schema might not be there.
          // kuzu_tables() is a Kuzu system function that lists tables.
          const tablesResult = await this.connection.query('CALL kuzu_tables() RETURN name;');
          const tables = await tablesResult.getAll();
          const repositoryTableExists = tables.some((t: any) => t.name === 'Repository');

          if (repositoryTableExists) {
            console.log(
              `KuzuDBClient: Schema (Repository table) already exists in ${this.dbPath}. Skipping DDL.`,
            );
            schemaNeedsInit = false;
            KuzuDBClient.initializedPaths.add(this.dbPath); // Mark as checked for this process
          }
        } catch (e) {
          console.warn(
            `KuzuDBClient: Error checking for existing tables in ${this.dbPath}, assuming schema needs init.`,
            e,
          );
          // If querying tables fails, assume schema needs to be initialized.
          schemaNeedsInit = true;
        }
      } else {
        // Already marked as initialized in this process run
        schemaNeedsInit = false;
        console.log(
          `KuzuDBClient: Schema already marked as initialized for ${this.dbPath} in this session, skipping DDL check.`,
        );
      }

      if (schemaNeedsInit) {
        console.log(`KuzuDBClient: Schema needs initialization for ${this.dbPath}. Running DDL...`);
        await initializeKuzuDBSchema(this.connection);
        KuzuDBClient.initializedPaths.add(this.dbPath);
        console.log(`KuzuDBClient: Schema DDL executed for ${this.dbPath}`);
      }
    } catch (error) {
      console.error(`KuzuDBClient: Error initializing for ${this.dbPath}:`, error);
      throw error; // Re-throw to allow calling code to handle
    } finally {
      release();
    }
  }

  /**
   * Gets the active connection. Throws if not initialized.
   */
  private getConnection(): any {
    if (!this.connection) {
      throw new Error(
        `KuzuDBClient for ${this.dbPath} is not initialized. Call initialize() first.`,
      );
    }
    return this.connection;
  }

  /**
   * Executes a Cypher query against this specific KuzuDB instance.
   * @param query The Cypher query string.
   * @param params Optional query parameters.
   */
  async executeQuery(query: string, params?: Record<string, any>): Promise<any> {
    const conn = this.getConnection();
    try {
      console.error(
        `KuzuDBClient (${this.dbPath}): Executing query: ${query.substring(0, 100)}...`,
        params ? `Params: ${Object.keys(params).join(', ')}` : 'No params',
      );
      if (params && Object.keys(params).length > 0) {
        return await conn.query(query, params);
      } else {
        return await conn.query(query);
      }
    } catch (error) {
      console.error(`KuzuDBClient (${this.dbPath}): Error executing query: ${query}`, error);
      throw error;
    }
  }

  /**
   * Closes the database connection. Should be called on application shutdown.
   */
  async close(): Promise<void> {
    if (this.connection) {
      // Kuzu Node.js driver does not have an explicit close for connection or database.
      // Connections are managed by the Database object's lifecycle.
      // Finalization/resource release happens when Database object is garbage collected
      // or process exits. For manual cleanup, one might set database and connection to null.
      console.log(
        `KuzuDBClient: Connection for ${this.dbPath} is managed by KuzuDB C++ core. No explicit close needed for connection object.`,
      );
      this.connection = null; // Allow GC
    }
    if (this.database) {
      // Similar to connection, explicit database.close() is not a standard feature of the node driver.
      // Database resources are typically released when the object is GC'd or process exits.
      console.log(
        `KuzuDBClient: Database for ${this.dbPath} resources managed by KuzuDB C++ core. No explicit close needed.`,
      );
      this.database = null; // Allow GC
    }
  }
}

/**
 * Initializes the KuzuDB schema (tables and relationships) on a given connection.
 * This function is designed to be idempotent.
 * @param connection An active KuzuDB connection object.
 */
export async function initializeKuzuDBSchema(connection: any): Promise<void> {
  if (!connection) {
    throw new Error('A valid KuzuDB connection is required to initialize schema.');
  }
  const execute = async (query: string) => {
    console.error(`Executing DDL: ${query.substring(0, 100)}...`);
    await connection.query(query);
  };

  console.error('[KuzuDB Schema] Attempting DDL setup...');
  try {
    await execute(`CREATE NODE TABLE IF NOT EXISTS Repository(
      id STRING,
      name STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (id)
    )`);

    await execute(`CREATE NODE TABLE IF NOT EXISTS Metadata(
      graph_unique_id STRING,
      id STRING,
      name STRING,
      content STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (graph_unique_id)
    )`);

    await execute(`CREATE NODE TABLE IF NOT EXISTS Context(
      graph_unique_id STRING,
      id STRING,
      name STRING,
      summary STRING,
      iso_date DATE,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (graph_unique_id)
    )`);

    await execute(`CREATE NODE TABLE IF NOT EXISTS Component(
      graph_unique_id STRING,
      id STRING,
      name STRING,
      kind STRING,
      status STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (graph_unique_id)
    )`);

    await execute(`CREATE NODE TABLE IF NOT EXISTS Decision(
      graph_unique_id STRING,
      id STRING,
      name STRING,
      context STRING,
      date DATE,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (graph_unique_id)
    )`);

    await execute(`CREATE NODE TABLE IF NOT EXISTS Rule(
      graph_unique_id STRING,
      id STRING,
      name STRING,
      created DATE,
      triggers STRING[],
      content STRING,
      status STRING,
      branch STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      PRIMARY KEY (graph_unique_id)
    )`);

    await execute(`CREATE REL TABLE IF NOT EXISTS HAS_METADATA(FROM Repository TO Metadata)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS HAS_CONTEXT(FROM Repository TO Context)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS HAS_COMPONENT(FROM Repository TO Component)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS HAS_DECISION(FROM Repository TO Decision)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS HAS_RULE(FROM Repository TO Rule)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS DEPENDS_ON(FROM Component TO Component)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS CONTEXT_OF(FROM Context TO Component)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS CONTEXT_OF_DECISION(FROM Context TO Decision)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS CONTEXT_OF_RULE(FROM Context TO Rule)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS DECISION_ON(FROM Decision TO Component)`);

    console.error('[KuzuDB Schema] Installing Algo extension (if not exists)...');
    await execute(`INSTALL ALGO`);
    await execute(`LOAD ALGO`);
    console.error('[KuzuDB Schema] Algo extension: OK (installed and loaded)');

    console.error('[KuzuDB Schema] DDL setup finished for the provided connection.');
  } catch (error) {
    console.error('[KuzuDB Schema] Error during DDL setup:', error);
    throw error;
  }
}
