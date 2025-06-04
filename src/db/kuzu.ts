// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuzu = require('kuzu');
import fs from 'fs';
import path from 'path';
import { Mutex } from '../utils/mutex'; // For ensuring atomic initialization of a KuzuDBClient instance
import config from './config'; // Now imports DB_RELATIVE_DIR and DB_FILENAME

/**
 * Helper function to track, log, and report progress for operation timing
 * @param operation Name of the operation being timed
 * @param context Additional context information (e.g., db path)
 * @param progressCallback Optional function to report progress
 * @param fn The async function to execute and time
 * @returns The result of the provided function
 */
async function timeOperation<T>(
  operation: string,
  context: string,
  progressCallback: ((message: string, percent?: number) => Promise<void>) | null = null,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Starting ${operation} for ${context}`);
    
    // Send progress notification if callback provided
    if (progressCallback) {
      await progressCallback(`${operation} for ${context}`);
    }
    
    return await fn();
  } finally {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] Completed ${operation} for ${context} in ${duration}ms`,
    );
  }
}

/**
 * KuzuDBClient: Manages a connection to a specific KuzuDB database instance.
 * Each instance is tied to a specific database file path, determined by the client's project root.
 */
export class KuzuDBClient {
  private database: any = null;
  private connection: any = null;
  public dbPath: string; // Made public
  private static initializationLock = new Mutex(); // Lock for initializing a specific dbPath
  // Use a map to store promise for initialization to prevent concurrent init for the same dbPath
  private static initializationPromises = new Map<string, Promise<void>>();

  /**
   * Creates an instance of KuzuDBClient.
   * The actual database initialization and connection are done in the async initialize method.
   * @param clientProjectRoot The absolute root path of the client project.
   */
  constructor(clientProjectRoot: string) {
    const overrideDbPath = process.env.DB_PATH_OVERRIDE;

    if (overrideDbPath) {
      this.dbPath = overrideDbPath;
      console.log(`KuzuDBClient using DB_PATH_OVERRIDE from environment: ${this.dbPath}`);
      // Ensure the directory for the override path exists, similar to non-override logic
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`KuzuDBClient: Created directory for override DB path: ${dbDir}`);
      }
    } else {
      if (!clientProjectRoot || clientProjectRoot.trim() === '') {
        const envClientRoot = process.env.CLIENT_PROJECT_ROOT;
        if (!envClientRoot || envClientRoot.trim() === '') {
          throw new Error(
            'KuzuDBClient requires a valid clientProjectRoot path. None provided and no CLIENT_PROJECT_ROOT environment variable set.',
          );
        }
        clientProjectRoot = envClientRoot;
        console.log(
          `KuzuDBClient using CLIENT_PROJECT_ROOT from environment: ${clientProjectRoot}`,
        );
      }

      if (!path.isAbsolute(clientProjectRoot)) {
        throw new Error('KuzuDBClient requires an absolute clientProjectRoot path.');
      }
      const repoDbDir = path.join(clientProjectRoot, config.DB_RELATIVE_DIR);
      this.dbPath = path.join(repoDbDir, config.DB_FILENAME);

      // Ensure the directory for the constructed path exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`KuzuDBClient: Created database directory: ${dbDir}`);
      }
    }
    console.log(`KuzuDBClient instance created for path: ${this.dbPath}`);
  }

  /**
   * Asynchronously initializes the database and connection for this client instance.
   * Ensures the database directory exists and schema is initialized (idempotently).
   */
  /**
   * Helper method to detect and format permission error messages
   * @private
   */
  private isPermissionError(err: any): boolean {
    return (
      err.code === 'EACCES' || // Permission denied
      err.code === 'EPERM' ||  // Operation not permitted
      (err.message && (
        err.message.includes('permission denied') ||
        err.message.includes('Permission denied') ||
        err.message.includes('access') && err.message.includes('denied')
      ))
    );
  }

  /**
   * Check if a directory is writable by attempting to create a temp file
   * @private
   */
  private async isDirectoryWritable(dirPath: string): Promise<boolean> {
    const testPath = path.join(dirPath, `.kuzu-write-test-${Date.now()}`);
    try {
      await fs.promises.writeFile(testPath, 'test');
      await fs.promises.unlink(testPath);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Helper method to check for database lock files
   * @private
   */
  private checkForStaleLockFile(dbPath: string): { exists: boolean; path?: string } {
    const lockFilePath = `${dbPath}.lock`;
    if (fs.existsSync(lockFilePath)) {
      try {
        const lockFileContents = fs.readFileSync(lockFilePath, 'utf8');
        return { exists: true, path: lockFilePath };
      } catch (e) {
        // Can't read lock file, but it exists
        return { exists: true, path: lockFilePath };
      }
    }
    return { exists: false };
  }

  /**
   * Initialize the KuzuDBClient with optional progress reporting
   * @param progressReporter Optional function to report progress during initialization
   */
  async initialize(
    progressReporter?: { sendProgress: (progress: any) => Promise<void> }
  ): Promise<void> {
    const initStartTime = Date.now();
    console.log(`[${new Date().toISOString()}] KuzuDBClient: Starting initialization for ${this.dbPath}`);
    
    // Helper function to send progress if a reporter is available
    const reportProgress = async (message: string, percent?: number) => {
      if (progressReporter) {
        try {
          await progressReporter.sendProgress({
            status: 'in_progress',
            message: `Database: ${message}`,
            percent,
          });
        } catch (err) {
          console.error(`Error sending progress notification: ${err}`);
        }
      }
    };
    
    const release = await timeOperation(
      'Acquiring initialization lock',
      this.dbPath,
      reportProgress,
      async () => await KuzuDBClient.initializationLock.acquire()
    );

    try {
      const dbDir = path.dirname(this.dbPath);
      let permissionCheckFailed = false;

      // Check for stale lock files before proceeding
      const lockFileCheck = this.checkForStaleLockFile(this.dbPath);
      if (lockFileCheck.exists) {
        console.warn(`[${new Date().toISOString()}] KuzuDBClient: Lock file detected at ${lockFileCheck.path}. This might indicate a stale lock from a previous session.`);
        await reportProgress(`Lock file detected at ${lockFileCheck.path}. This might indicate a stale lock.`);
      }

      // Try to create the directory if it doesn't exist
      if (!fs.existsSync(dbDir)) {
        await timeOperation('Creating database directory', dbDir, reportProgress, async () => {
          try {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(`KuzuDBClient: Created database directory: ${dbDir}`);
          } catch (dirError: any) {
            if (this.isPermissionError(dirError)) {
              permissionCheckFailed = true;
              const userMessage = `KuzuDBClient: PERMISSION ERROR - Cannot create database directory at '${dbDir}'. The IDE or MCP server process does not have permission to create directories in this location. Please ensure the user running the IDE has full read/write access to this location, or use a different location.`;
              console.error(userMessage);
              await reportProgress(`PERMISSION ERROR - Cannot create database directory at '${dbDir}'`);
              throw new Error(userMessage);
            } else {
              console.error(`KuzuDBClient: Error creating directory ${dbDir}:`, dirError);
              await reportProgress(`Error creating database directory: ${dirError.message}`);
              throw new Error(`KuzuDBClient: Error creating directory ${dbDir}: ${dirError.message}`);
            }
          }
        });
      }

      // Verify the directory is writable even if it already exists
      if (!permissionCheckFailed) {
        await timeOperation('Checking directory is writable', dbDir, reportProgress, async () => {
          const isWritable = await this.isDirectoryWritable(dbDir);
          if (!isWritable) {
            const userMessage = `KuzuDBClient: PERMISSION ERROR - The database directory '${dbDir}' exists but is not writable. The IDE or MCP server process does not have sufficient permissions. Please ensure the user running the IDE has full read/write access to this location.`;
            console.error(userMessage);
            await reportProgress(`PERMISSION ERROR - The database directory exists but is not writable`);
            throw new Error(userMessage);
          }
        });
      }

      if (!this.database) {
        await timeOperation('Instantiating kuzu.Database', this.dbPath, reportProgress, async () => {
          try {
            console.log(`KuzuDBClient: Attempting to instantiate kuzu.Database with path: ${this.dbPath}`);
            await reportProgress(`Creating database instance at ${this.dbPath}`);
            this.database = new kuzu.Database(this.dbPath);
            console.log(`KuzuDBClient: Database object successfully initialized for ${this.dbPath} (using Kuzu default system config).`);
          } catch (dbError: any) {
            if (this.isPermissionError(dbError)) {
              const userMessage = `KuzuDBClient: PERMISSION ERROR - Cannot create or access database files at '${this.dbPath}'. The IDE or MCP server process does not have sufficient permissions. Please ensure the user running the IDE has full read/write access to this location and all files within it.`;
              console.error(userMessage, dbError);
              throw new Error(userMessage);
            } else if (dbError.message && (dbError.message.includes('lock') || dbError.message.includes('Lock'))) {
              // Check if there's an actual lock file that can be inspected
              const lockFileCheck = this.checkForStaleLockFile(this.dbPath);
              let additionalInfo = '';
              if (lockFileCheck.exists) {
                additionalInfo = ` Found lock file at '${lockFileCheck.path}'.`;
              }
              
              const userMessage = `KuzuDBClient: DATABASE LOCK ERROR - Cannot access database at '${this.dbPath}' because it appears to be locked by another process.${additionalInfo} This could be caused by another instance of the IDE or MCP server using this database, or a previous process that did not shut down cleanly. If no other process is using this database, try removing the '.lock' file or restarting your IDE.`;
              console.error(userMessage, dbError);
              throw new Error(userMessage);
            } else {
              console.error(`KuzuDBClient: CRITICAL ERROR instantiating kuzu.Database for ${this.dbPath}:`, dbError);
              const message = `KuzuDBClient: CRITICAL ERROR instantiating kuzu.Database for ${this.dbPath}: ${dbError?.message || dbError}`;
              console.error(message, dbError);
              throw new Error(message);
            }
          }
        });
      }

      if (!this.connection) {
        await timeOperation('Establishing database connection', this.dbPath, reportProgress, async () => {
          try {
            console.log(`KuzuDBClient: Attempting to instantiate kuzu.Connection with database object for: ${this.dbPath}`);
            await reportProgress(`Establishing connection to database`);
            this.connection = new kuzu.Connection(this.database);
            console.log(`KuzuDBClient: Connection successfully established to ${this.dbPath}`);
          } catch (connError: any) {
            if (this.isPermissionError(connError)) {
              const userMessage = `KuzuDBClient: PERMISSION ERROR - Cannot establish connection to database at '${this.dbPath}'. The IDE or MCP server process does not have sufficient permissions to access the database files. Please ensure the user running the IDE has full read/write access to this location and all files within it.`;
              console.error(userMessage, connError);
              throw new Error(userMessage);
            } else if (connError.message && connError.message.includes('lock')) {
              const userMessage = `KuzuDBClient: DATABASE LOCK ERROR - Cannot establish connection to database at '${this.dbPath}' because it appears to be locked by another process. This could be caused by another process accessing the same database, or a previous process that did not shut down cleanly. Try restarting your IDE.`;
              console.error(userMessage, connError);
              throw new Error(userMessage);
            } else {
              console.error(`KuzuDBClient: CRITICAL ERROR instantiating kuzu.Connection for ${this.dbPath}:`, connError);
              const message = `KuzuDBClient: CRITICAL ERROR obtaining connection for ${this.dbPath}: ${connError?.message || connError}`;
              console.error(message, connError);
              throw new Error(message);
            }
          }
        });
      }

      // Check if schema needs initialization by verifying a key table's existence
      let schemaNeedsInit = true;
      
      await timeOperation('Checking schema initialization status', this.dbPath, reportProgress, async () => {
        if (!KuzuDBClient.initializationPromises.has(this.dbPath)) {
          // First check in-memory flag for current process
          try {
            // Try to query a known table. If this fails or returns empty, schema might not be there.
            // show_tables() is a Kuzu system function that lists tables.
            console.log(`[DEBUG] KuzuDBClient: Checking for existing tables in ${this.dbPath}...`);
            const tables = await this.executeQuery('CALL show_tables() RETURN *;');
            console.log(`[DEBUG] KuzuDBClient: show_tables() returned:`, tables);
            const repositoryTableExists = tables.some((t: any) => t.name === 'Repository');
            console.log(`[DEBUG] KuzuDBClient: Repository table exists? ${repositoryTableExists}`);

            if (repositoryTableExists) {
              console.log(
                `KuzuDBClient: Schema (Repository table) already exists in ${this.dbPath}. Skipping DDL.`,
              );
              schemaNeedsInit = false;
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
      });

      if (schemaNeedsInit) {
        await timeOperation('Initializing database schema (DDL)', this.dbPath, reportProgress, async () => {
          console.log(`KuzuDBClient: Schema needs initialization for ${this.dbPath}. Running DDL...`);
          await reportProgress(`Creating database schema tables and relationships`);
          await initializeKuzuDBSchema(this.connection);
          console.log(`KuzuDBClient: Schema DDL executed for ${this.dbPath}`);
        });
      }
    } catch (error) {
      console.error(`KuzuDBClient: Error initializing for ${this.dbPath}:`, error);
      throw error; // Re-throw to allow calling code to handle
    } finally {
      // Ensure lock is released and promise is removed if an error occurred before resolution
      // or if the logic completes (even if successful, to allow re-evaluation if needed by specific app logic,
      // though typically init is once).
      // However, for init-once-per-path, we'd leave it in the map after success.
      // If an error occurs, we should remove it so a subsequent call can retry.
      if (KuzuDBClient.initializationPromises.has(this.dbPath)) {
        // If the promise resolved (successfully or not), its fate is sealed.
        // If it errored, it should have been deleted by the catch block of the promise executor.
      }
      release();
      
      // Log total initialization time
      const totalTime = Date.now() - initStartTime;
      console.log(`[${new Date().toISOString()}] KuzuDBClient: Total initialization time for ${this.dbPath}: ${totalTime}ms`);
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
   * @param _progressCallback Optional callback for progress messages.
   */
  async executeQuery(
    query: string,
    params?: Record<string, any>,
    _progressCallback?: (message: string) => void, // Param retained for external compatibility if ever used
  ): Promise<any> {
    const conn = this.getConnection();

    try {
      let result;

      if (params && Object.keys(params).length > 0) {
        // If we have parameters, prepare the statement first then execute it
        const preparedStatement = await conn.prepare(query);
        if (!preparedStatement.isSuccess()) {
          throw new Error(preparedStatement.getErrorMessage());
        }

        // Pass progressCallback as optional third parameter to execute
        const progressCallback = function (
          pipelineProgress: number,
          numPipelinesFinished: number,
          numPipelines: number,
        ) {
          // Simple no-op callback with proper signature for execute method
          // Do nothing but maintain proper function signature expected by Kuzu
        };
        result = await conn.execute(preparedStatement, params, progressCallback);
      } else {
        // For queries without parameters, use query method directly
        const progressCallback = function (
          pipelineProgress: number,
          numPipelinesFinished: number,
          numPipelines: number,
        ) {
          // Simple no-op callback with proper signature for query method
          // Do nothing but maintain proper function signature expected by Kuzu
        };
        result = await conn.query(query, progressCallback);
      }

      // Process result: if it has getAll (like a QueryResult from a SELECT/RETURN),
      // then call it. Otherwise, return the result directly (might be info for DML).
      if (result && typeof result.getAll === 'function') {
        return await result.getAll();
      }
      return result;
    } catch (error: any) {
      console.error(
        `KuzuDBClient (${this.dbPath}): executeQuery FAILED for query: ${query.substring(0, 150)}... `,
        {
          paramsKeys: params ? Object.keys(params) : 'none',
          errorMessage: error.message,
          errorStack: error.stack?.substring(0, 200),
          errorObject: error, // Logging the full error object might give more Kuzu-specific details
        },
      );
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
    try {
      // console.log(`[KuzuDB Schema] Executing: ${query.substring(0, 100)}...`);
      // Use query method for schema DDL (no parameters needed)
      const progressCallback = function (
        pipelineProgress: number,
        numPipelinesFinished: number,
        numPipelines: number,
      ) {
        // Simple no-op callback with proper signature expected by Kuzu
      };
      await connection.query(query, progressCallback);
    } catch (e: any) {
      const errorMsg = `[KuzuDB Schema] Failed to execute DDL: "${query}". Error: ${e.message}`;
      console.error(errorMsg, e);
      throw new Error(errorMsg); // Wrap schema execution errors
    }
  };

  console.info('[KuzuDB Schema] Attempting DDL setup...');
  try {
    // --- Extensions ---
    await execute('INSTALL ALGO');
    await execute('LOAD ALGO');

    await execute('INSTALL JSON');
    await execute('LOAD EXTENSION JSON'); // Kuzu docs specify 'LOAD EXTENSION JSON'

    // --- Core Node Tables (as before) ---
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

    // --- New File Node Table ---
    await execute(`CREATE NODE TABLE IF NOT EXISTS File(
      id STRING, 
      graph_unique_id STRING, 
      name STRING, 
      path STRING, 
      language STRING, 
      metrics STRING, 
      content_hash STRING, 
      mime_type STRING, 
      size_bytes INT64, 
      created_at TIMESTAMP, 
      updated_at TIMESTAMP, 
      repository STRING, 
      branch STRING, 
      PRIMARY KEY (id)
    )`);

    // --- New Tag Node Table ---
    await execute(`CREATE NODE TABLE IF NOT EXISTS Tag(
      id STRING, 
      name STRING, 
      color STRING, 
      description STRING, 
      created_at TIMESTAMP, 
      PRIMARY KEY (id)
    )`);

    // --- Core Relationship Tables (as before) ---
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
    await execute(`CREATE REL TABLE IF NOT EXISTS GOVERNED_BY(FROM Component TO Decision)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS GOVERNED_BY_RULE(FROM Component TO Rule)`);

    // --- New Relationship Tables for Files and Tags ---
    await execute(`CREATE REL TABLE IF NOT EXISTS HAS_FILE(FROM Repository TO File)`);
    await execute(
      `CREATE REL TABLE IF NOT EXISTS COMPONENT_IMPLEMENTS_FILE(FROM Component TO File)`,
    );
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_COMPONENT(FROM Component TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_RULE(FROM Rule TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_CONTEXT(FROM Context TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_FILE(FROM File TO Tag)`);

    // --- Optional Algo Extension ---
    try {
      await execute(`INSTALL ALGO`);
      await execute(`LOAD ALGO`);
    } catch (algoError: any) {
      console.warn(
        `[KuzuDB Schema] WARNING: Failed to install or load Algo extension. Algorithmic functions may not be available. Error: ${algoError.message}`,
      );
      // Do not re-throw; allow schema initialization to continue without it.
    }

    console.info('[KuzuDB Schema] Installing JSON extension (if not exists)...');
    await execute('INSTALL JSON');
    console.info('[KuzuDB Schema] Loading JSON extension...');
    await execute('LOAD JSON');

    console.info('[KuzuDB Schema] DDL setup finished for the provided connection.');
  } catch (error: unknown) {
    let messageContent = 'Unknown error during schema initialization';
    if (error instanceof Error) {
      messageContent = error.message;
    } else if (typeof error === 'string') {
      messageContent = error;
    }
    const finalMessage = `[KuzuDB Schema] Error during schema initialization: ${messageContent}`;
    console.error(finalMessage, error);
    // Re-throw as a new Error to ensure a clean stack trace and error object
    throw new Error(finalMessage);
  }
}
