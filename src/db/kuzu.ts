// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuzu = require('kuzu');
import fs from 'fs';
import path from 'path';
import { Mutex } from '../utils/mutex'; // For ensuring atomic initialization of a KuzuDBClient instance
import config from './config'; // Now imports DB_RELATIVE_DIR and DB_FILENAME

// Add connection validation interval (5 minutes)
const CONNECTION_VALIDATION_INTERVAL = 5 * 60 * 1000;
const SCHEMA_CHECK_TIMEOUT = 5000; // 5 seconds timeout for schema check
const MAX_CONNECTION_AGE = 30 * 60 * 1000; // 30 minutes max connection age

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

  // Connection health tracking
  private connectionCreatedAt: Date | null = null;
  private lastValidationTime: Date | null = null;
  private isConnectionValid: boolean = false;

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
      err.code === 'EPERM' || // Operation not permitted
      (err.message &&
        (err.message.includes('permission denied') ||
          err.message.includes('Permission denied') ||
          (err.message.includes('access') && err.message.includes('denied'))))
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
   * Check for stale lock files
   * @private
   */
  private checkForStaleLockFile(dbPath: string): { exists: boolean; path?: string; age?: number } {
    const dbDir = path.dirname(dbPath);
    const dbName = path.basename(dbPath);
    const lockFileName = `${dbName}.lock`;
    const lockFilePath = path.join(dbDir, lockFileName);

    try {
      const stats = fs.statSync(lockFilePath);
      const age = Date.now() - stats.mtimeMs;
      return { exists: true, path: lockFilePath, age };
    } catch (e) {
      return { exists: false };
    }
  }

  /**
   * Attempt to clean up stale lock files
   * @private
   */
  private async cleanupStaleLock(lockFilePath: string, age: number): Promise<boolean> {
    // Only clean up locks older than 5 minutes
    const STALE_LOCK_THRESHOLD = 5 * 60 * 1000;

    if (age > STALE_LOCK_THRESHOLD) {
      try {
        await fs.promises.unlink(lockFilePath);
        console.log(
          `KuzuDBClient: Removed stale lock file (age: ${Math.round(age / 1000)}s): ${lockFilePath}`,
        );
        return true;
      } catch (e) {
        console.error(`KuzuDBClient: Failed to remove stale lock file: ${lockFilePath}`, e);
        return false;
      }
    }
    return false;
  }

  /**
   * Validate the current connection is still healthy
   * @private
   */
  private async validateConnection(): Promise<boolean> {
    if (!this.connection || !this.database) {
      return false;
    }

    // Check connection age
    if (this.connectionCreatedAt) {
      const age = Date.now() - this.connectionCreatedAt.getTime();
      if (age > MAX_CONNECTION_AGE) {
        console.log(
          `KuzuDBClient: Connection too old (${Math.round(age / 1000)}s), marking as invalid`,
        );
        return false;
      }
    }

    // Skip validation if recently validated
    if (this.lastValidationTime) {
      const timeSinceLastValidation = Date.now() - this.lastValidationTime.getTime();
      if (timeSinceLastValidation < CONNECTION_VALIDATION_INTERVAL) {
        return this.isConnectionValid;
      }
    }

    try {
      // Simple validation query with timeout
      const validationPromise = this.connection.query('RETURN 1 AS test;');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection validation timeout')), 1000),
      );

      await Promise.race([validationPromise, timeoutPromise]);

      this.lastValidationTime = new Date();
      this.isConnectionValid = true;
      return true;
    } catch (e) {
      console.error(`KuzuDBClient: Connection validation failed:`, e);
      this.isConnectionValid = false;
      return false;
    }
  }

  /**
   * Reset the connection, forcing a fresh connection on next use
   * @private
   */
  private async resetConnection(): Promise<void> {
    console.log(`KuzuDBClient: Resetting connection for ${this.dbPath}`);

    // Clear existing connection
    if (this.connection) {
      this.connection = null;
    }
    if (this.database) {
      this.database = null;
    }

    // Clear tracking
    this.connectionCreatedAt = null;
    this.lastValidationTime = null;
    this.isConnectionValid = false;

    // Remove from initialization promises to allow re-init
    if (KuzuDBClient.initializationPromises.has(this.dbPath)) {
      KuzuDBClient.initializationPromises.delete(this.dbPath);
    }
  }

  /**
   * Initialize the KuzuDBClient with optional progress reporting
   * @param progressReporter Optional function to report progress during initialization
   */
  async initialize(progressReporter?: {
    sendProgress: (progress: any) => Promise<void>;
  }): Promise<void> {
    const initStartTime = Date.now();
    console.log(
      `[${new Date().toISOString()}] KuzuDBClient: Starting initialization for ${this.dbPath}`,
    );

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

    // Validate existing connection first
    if (this.database && this.connection) {
      const isValid = await this.validateConnection();
      if (isValid) {
        console.log(`KuzuDBClient: Using existing valid connection for ${this.dbPath}`);
        return;
      } else {
        console.log(`KuzuDBClient: Existing connection invalid, resetting...`);
        await this.resetConnection();
      }
    }

    const release = await timeOperation(
      'Acquiring initialization lock',
      this.dbPath,
      reportProgress,
      async () => await KuzuDBClient.initializationLock.acquire(),
    );

    try {
      // Check if already initializing for this path
      if (KuzuDBClient.initializationPromises.has(this.dbPath)) {
        console.log(
          `KuzuDBClient: Already initializing for ${this.dbPath}, waiting for completion...`,
        );
        await KuzuDBClient.initializationPromises.get(this.dbPath);
        return;
      }

      // Set up the initialization promise
      const initPromise = this._performInitialization(reportProgress);
      KuzuDBClient.initializationPromises.set(this.dbPath, initPromise);

      // Execute initialization
      await initPromise;
    } catch (error) {
      console.error(`KuzuDBClient: Error initializing for ${this.dbPath}:`, error);
      // Clean up on error
      KuzuDBClient.initializationPromises.delete(this.dbPath);
      await this.resetConnection();
      throw error;
    } finally {
      release();
      const totalTime = Date.now() - initStartTime;
      console.log(
        `[${new Date().toISOString()}] KuzuDBClient: Total initialization time for ${this.dbPath}: ${totalTime}ms`,
      );
    }
  }

  /**
   * Perform the actual initialization
   * @private
   */
  private async _performInitialization(
    reportProgress: (message: string, percent?: number) => Promise<void>,
  ): Promise<void> {
    let permissionCheckFailed = false;
    const dbDir = path.dirname(this.dbPath);

    // Check for and handle stale lock files
    const lockFileCheck = this.checkForStaleLockFile(this.dbPath);
    if (lockFileCheck.exists && lockFileCheck.path && lockFileCheck.age) {
      console.warn(
        `Lock file detected at ${lockFileCheck.path} (age: ${Math.round(lockFileCheck.age / 1000)}s)`,
      );
      await reportProgress(`Checking for stale database locks...`, 15);

      const cleaned = await this.cleanupStaleLock(lockFileCheck.path, lockFileCheck.age);
      if (cleaned) {
        await reportProgress(`Cleaned up stale lock file`, 20);
      }
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
            await reportProgress(
              `PERMISSION ERROR - Cannot create database directory at '${dbDir}'`,
            );
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
          await reportProgress(
            `PERMISSION ERROR - The database directory exists but is not writable`,
          );
          throw new Error(userMessage);
        }
      });
    }

    if (!this.database) {
      await timeOperation('Instantiating kuzu.Database', this.dbPath, reportProgress, async () => {
        try {
          console.log(
            `KuzuDBClient: Attempting to instantiate kuzu.Database with path: ${this.dbPath}`,
          );
          await reportProgress(`Creating database instance at ${this.dbPath}`, 40);
          this.database = new kuzu.Database(this.dbPath);
          console.log(
            `KuzuDBClient: Database object successfully initialized for ${this.dbPath} (using Kuzu default system config).`,
          );
        } catch (dbError: any) {
          if (this.isPermissionError(dbError)) {
            const userMessage = `KuzuDBClient: PERMISSION ERROR - Cannot create or access database files at '${this.dbPath}'. The IDE or MCP server process does not have sufficient permissions. Please ensure the user running the IDE has full read/write access to this location and all files within it.`;
            console.error(userMessage, dbError);
            throw new Error(userMessage);
          } else if (
            dbError.message &&
            (dbError.message.includes('lock') || dbError.message.includes('Lock'))
          ) {
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
            console.error(
              `KuzuDBClient: CRITICAL ERROR instantiating kuzu.Database for ${this.dbPath}:`,
              dbError,
            );
            const message = `KuzuDBClient: CRITICAL ERROR instantiating kuzu.Database for ${this.dbPath}: ${dbError?.message || dbError}`;
            console.error(message, dbError);
            throw new Error(message);
          }
        }
      });
    }

    if (!this.connection) {
      await timeOperation(
        'Establishing database connection',
        this.dbPath,
        reportProgress,
        async () => {
          try {
            console.log(
              `KuzuDBClient: Attempting to instantiate kuzu.Connection with database object for: ${this.dbPath}`,
            );
            await reportProgress(`Establishing connection to database`, 50);
            this.connection = new kuzu.Connection(this.database);
            this.connectionCreatedAt = new Date();
            this.isConnectionValid = true;
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
              console.error(
                `KuzuDBClient: CRITICAL ERROR instantiating kuzu.Connection for ${this.dbPath}:`,
                connError,
              );
              const message = `KuzuDBClient: CRITICAL ERROR obtaining connection for ${this.dbPath}: ${connError?.message || connError}`;
              console.error(message, connError);
              throw new Error(message);
            }
          }
        },
      );
    }

    // Check if schema needs initialization by verifying a key table's existence
    let schemaNeedsInit = true;

    await timeOperation(
      'Checking schema initialization status',
      this.dbPath,
      reportProgress,
      async () => {
        try {
          // Implement timeout for schema check
          console.log(
            `[DEBUG] KuzuDBClient: Testing connection with simple query in ${this.dbPath}...`,
          );

          const testQueryPromise = this.connection.query('RETURN 1 AS test;');
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Schema check timeout')), SCHEMA_CHECK_TIMEOUT),
          );

          await Promise.race([testQueryPromise, timeoutPromise]);
          console.log(`[DEBUG] KuzuDBClient: Connection test successful`);

          // Now check for tables with timeout
          console.log(`[DEBUG] KuzuDBClient: Checking for existing tables in ${this.dbPath}...`);

          const tablesQueryPromise = this.connection.query('CALL show_tables() RETURN *;');
          const tablesTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Table listing timeout')), SCHEMA_CHECK_TIMEOUT),
          );

          const tablesResult = await Promise.race([tablesQueryPromise, tablesTimeoutPromise]);
          const tables = await tablesResult.getAll();

          console.log(`[DEBUG] KuzuDBClient: show_tables() returned:`, tables);
          const repositoryTableExists = tables.some((t: any) => t.name === 'Repository');
          console.log(`[DEBUG] KuzuDBClient: Repository table exists? ${repositoryTableExists}`);

          if (repositoryTableExists) {
            console.log(
              `KuzuDBClient: Schema (Repository table) already exists in ${this.dbPath}. Skipping DDL.`,
            );
            schemaNeedsInit = false;
          }
        } catch (e: any) {
          if (e.message && e.message.includes('timeout')) {
            console.error(
              `KuzuDBClient: Schema check timed out after ${SCHEMA_CHECK_TIMEOUT}ms. This may indicate a database lock issue.`,
            );
            // Reset connection and throw to trigger cleanup
            await this.resetConnection();
            throw new Error(
              `Database schema check timed out. The database may be locked by another process. Please try restarting your IDE or removing any .lock files in the database directory.`,
            );
          }
          console.warn(
            `KuzuDBClient: Error checking for existing tables in ${this.dbPath}, assuming schema needs init.`,
            e,
          );
          // If querying tables fails, assume schema needs to be initialized.
          schemaNeedsInit = true;
        }
      },
    );

    if (schemaNeedsInit) {
      await timeOperation(
        'Initializing database schema (DDL)',
        this.dbPath,
        reportProgress,
        async () => {
          console.log(
            `KuzuDBClient: Schema needs initialization for ${this.dbPath}. Running DDL...`,
          );
          await reportProgress(`Creating database schema tables and relationships`, 80);
          await initializeKuzuDBSchema(this.connection);
          console.log(`KuzuDBClient: Schema DDL executed for ${this.dbPath}`);
        },
      );
    }

    // Mark successful initialization
    await reportProgress(`Database initialization complete`, 100);
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
      // Create a timeout promise
      const timeoutMs = 30000; // 30 seconds timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      const executePromise = (async () => {
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
          return await conn.execute(preparedStatement, params, progressCallback);
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
          return await conn.query(query, progressCallback);
        }
      })();

      // Race between the query execution and timeout
      const result = await Promise.race([executePromise, timeoutPromise]);

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
      repository STRING,
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
      repository STRING,
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
      repository STRING,
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
      repository STRING,
      branch STRING,
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
    await execute(`CREATE REL TABLE IF NOT EXISTS IMPLEMENTS(FROM File TO Component)`);
    await execute(
      `CREATE REL TABLE IF NOT EXISTS COMPONENT_IMPLEMENTS_FILE(FROM Component TO File)`,
    );
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_COMPONENT(FROM Component TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_RULE(FROM Rule TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_CONTEXT(FROM Context TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_FILE(FROM File TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_WITH(FROM Component TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_WITH(FROM Decision TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_WITH(FROM Rule TO Tag)`);
    await execute(`CREATE REL TABLE IF NOT EXISTS TAGGED_WITH(FROM File TO Tag)`);

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
