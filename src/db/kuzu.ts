// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuzu = require('kuzu');
import fs from 'fs';
import path from 'path';
import { createPerformanceLogger, kuzuLogger, logError } from '../utils/logger';
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
  const perfLogger = createPerformanceLogger(kuzuLogger, operation);

  try {
    kuzuLogger.debug({ operation, context }, 'Operation starting');

    // Send progress notification if callback provided
    if (progressCallback) {
      await progressCallback(`${operation} for ${context}`);
    }

    const result = await fn();
    perfLogger.complete({ context });
    return result;
  } catch (error) {
    perfLogger.fail(error as Error, { context });
    throw error;
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
    const logger = kuzuLogger.child({ operation: 'constructor' });
    const overrideDbPath = process.env.DB_PATH_OVERRIDE;

    if (overrideDbPath) {
      this.dbPath = overrideDbPath;
      logger.info({ dbPath: this.dbPath }, 'Using DB_PATH_OVERRIDE from environment');
      // Ensure the directory for the override path exists, similar to non-override logic
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info({ dbDir }, 'Created directory for override DB path');
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
        logger.info({ clientProjectRoot }, 'Using CLIENT_PROJECT_ROOT from environment');
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
        logger.info({ dbDir }, 'Created database directory');
      }
    }
    logger.info({ dbPath: this.dbPath }, 'KuzuDBClient instance created');
  }

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
    const logger = kuzuLogger.child({ operation: 'cleanup-stale-lock' });
    // Only clean up locks older than 5 minutes
    const STALE_LOCK_THRESHOLD = 5 * 60 * 1000;

    if (age > STALE_LOCK_THRESHOLD) {
      try {
        await fs.promises.unlink(lockFilePath);
        logger.info(
          { lockFilePath, ageSeconds: Math.round(age / 1000) },
          'Removed stale lock file',
        );
        return true;
      } catch (e) {
        logError(logger, e as Error, { lockFilePath });
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
    const logger = kuzuLogger.child({
      operation: 'validate-connection',
      dbPath: this.dbPath,
    });

    if (!this.connection || !this.connectionCreatedAt) {
      logger.debug('No connection to validate');
      return false;
    }

    // Check connection age
    const connectionAge = Date.now() - this.connectionCreatedAt.getTime();
    if (connectionAge > MAX_CONNECTION_AGE) {
      logger.warn({ connectionAge }, 'Connection exceeded maximum age');
      return false;
    }

    // Check last validation time
    const now = Date.now();
    if (
      this.lastValidationTime &&
      now - this.lastValidationTime.getTime() < CONNECTION_VALIDATION_INTERVAL
    ) {
      return this.isConnectionValid;
    }

    // Perform actual validation
    try {
      const result = await this.connection.query('RETURN 1 as test;');
      this.lastValidationTime = new Date();
      this.isConnectionValid = true;
      logger.debug('Connection validation successful');
      return true;
    } catch (e) {
      this.isConnectionValid = false;
      logError(logger, e as Error, { operation: 'connection-validation' });
      return false;
    }
  }

  /**
   * Reset/close the current connection and database
   * @private
   */
  private async resetConnection(): Promise<void> {
    const logger = kuzuLogger.child({
      operation: 'reset-connection',
      dbPath: this.dbPath,
    });

    logger.info('Resetting connection');

    if (this.connection) {
      try {
        this.connection.close();
      } catch (e) {
        // Ignore errors during connection close
      }
      this.connection = null;
    }

    if (this.database) {
      try {
        this.database.close();
      } catch (e) {
        // Ignore errors during database close
      }
      this.database = null;
    }

    this.connectionCreatedAt = null;
    this.lastValidationTime = null;
    this.isConnectionValid = false;
  }

  async initialize(progressReporter?: {
    sendProgress: (progress: any) => Promise<void>;
  }): Promise<void> {
    // Set up progress reporting function
    const reportProgress = async (message: string, percent?: number) => {
      if (progressReporter?.sendProgress) {
        try {
          await progressReporter.sendProgress({ message, percent });
        } catch (err) {
          logError(kuzuLogger, err as Error, { operation: 'progress-notification' });
        }
      }
    };

    // Check if there's an ongoing initialization for this dbPath
    const existingPromise = KuzuDBClient.initializationPromises.get(this.dbPath);
    if (existingPromise) {
      kuzuLogger.debug({ dbPath: this.dbPath }, 'Waiting for existing initialization');
      return existingPromise;
    }

    // Use existing valid connection if available
    const isValid = await this.validateConnection();
    if (isValid) {
      kuzuLogger.debug({ dbPath: this.dbPath }, 'Using existing valid connection');
      return;
    } else if (this.connection) {
      kuzuLogger.debug('Existing connection invalid, resetting...');
      await this.resetConnection();
    }

    // Create new initialization promise
    const initPromise = this._performInitialization(reportProgress);
    KuzuDBClient.initializationPromises.set(this.dbPath, initPromise);

    try {
      await initPromise;
    } finally {
      // Clean up the promise from the map once initialization is complete (success or failure)
      KuzuDBClient.initializationPromises.delete(this.dbPath);
    }
  }

  /**
   * Performs the actual initialization work.
   * @private
   */
  private async _performInitialization(
    reportProgress: (message: string, percent?: number) => Promise<void>,
  ): Promise<void> {
    const logger = kuzuLogger.child({
      operation: 'initialize',
      dbPath: this.dbPath,
    });
    const perfLogger = createPerformanceLogger(logger, 'database-initialization');

    const release = await KuzuDBClient.initializationLock.acquire();

    try {
      logger.info('Starting database initialization');

      const dbDir = path.dirname(this.dbPath);

      // Check and create directory if needed
      if (!fs.existsSync(dbDir)) {
        await reportProgress(`Creating database directory: ${dbDir}`, 10);
        try {
          fs.mkdirSync(dbDir, { recursive: true });
          logger.info({ dbDir }, 'Created database directory');
        } catch (dirError: unknown) {
          if (this.isPermissionError(dirError)) {
            const userMessage = `Permission denied: Cannot create database directory '${dbDir}'. Please check file system permissions or try running with appropriate privileges.`;
            logger.error({ dbDir, error: dirError }, userMessage);
            throw new Error(userMessage);
          } else {
            logError(logger, dirError as Error, { dbDir, operation: 'create-directory' });
            throw dirError;
          }
        }
      }

      // Check directory writability
      const isWritable = await this.isDirectoryWritable(dbDir);
      if (!isWritable) {
        const userMessage = `Database directory '${dbDir}' is not writable. Please check file system permissions.`;
        logger.error({ dbDir }, userMessage);
        throw new Error(userMessage);
      }

      // Check for stale lock files
      const lockInfo = this.checkForStaleLockFile(this.dbPath);
      if (lockInfo.exists && lockInfo.path && lockInfo.age) {
        await this.cleanupStaleLock(lockInfo.path, lockInfo.age);
      }

      // Initialize database
      await reportProgress(`Opening database: ${this.dbPath}`, 30);
      try {
        this.database = new kuzu.Database(this.dbPath);
        logger.info('Database opened successfully');
      } catch (dbError: unknown) {
        if (this.isPermissionError(dbError)) {
          const userMessage = `Permission denied: Cannot access database file '${this.dbPath}'. Please check file system permissions.`;
          logger.error({ dbPath: this.dbPath, error: dbError }, userMessage);
          throw new Error(userMessage);
        } else if (
          (dbError as any).message &&
          ((dbError as any).message.includes('lock') || (dbError as any).message.includes('busy'))
        ) {
          const userMessage = `Database file '${this.dbPath}' is locked or in use by another process. Please close other connections and try again.`;
          logger.error({ dbPath: this.dbPath, error: dbError }, userMessage);
          throw new Error(userMessage);
        } else {
          const message = `Failed to open database file '${this.dbPath}'. The file may be corrupted or inaccessible.`;
          logError(logger, dbError as Error, { dbPath: this.dbPath, operation: 'open-database' });
          throw new Error(message);
        }
      }

      // Create connection
      await reportProgress(`Establishing connection`, 50);
      try {
        this.connection = new kuzu.Connection(this.database);
        this.connectionCreatedAt = new Date();
        this.isConnectionValid = true;
        logger.info('Connection successfully established');
      } catch (connError: unknown) {
        if (this.isPermissionError(connError)) {
          const userMessage = `Permission denied: Cannot establish connection to database '${this.dbPath}'.`;
          logger.error({ dbPath: this.dbPath, error: connError }, userMessage);
          throw new Error(userMessage);
        } else {
          const userMessage = `Failed to establish connection to database '${this.dbPath}'.`;
          logError(logger, connError as Error, {
            dbPath: this.dbPath,
            operation: 'create-connection',
          });
          throw new Error(userMessage);
        }
      }

      // Validate connection and check schema
      await reportProgress(`Validating connection and checking schema`, 70);
      let repositoryTableExists = false;
      try {
        logger.debug('Testing connection...');
        const testResult = await this.connection.query('RETURN 1;');
        logger.debug('Connection test successful');

        logger.debug('Checking for existing tables...');
        const result = await this.connection.query(`
          CALL show_tables() RETURN name;
        `);

        const tables = result || [];
        logger.debug(
          { tables, resultType: typeof result, isArray: Array.isArray(result) },
          'show_tables() returned',
        );

        // Handle different possible result structures
        if (Array.isArray(tables)) {
          repositoryTableExists = tables.some(
            (table: any) => table.name === 'Repository' || table === 'Repository',
          );
        } else if (tables && typeof tables === 'object') {
          // Handle case where result is a single object or different structure
          repositoryTableExists = JSON.stringify(tables).includes('Repository');
        }

        logger.debug({ repositoryTableExists }, 'Repository table exists?');

        logger.debug('Connection and schema validation completed');
      } catch (error) {
        logError(logger, error as Error, {
          dbPath: this.dbPath,
          operation: 'connection-validation',
        });
      }

      // Initialize schema if needed
      if (!repositoryTableExists) {
        await reportProgress(`Initializing database schema`, 90);
        logger.info('Repository table not found, initializing schema...');
        await initializeKuzuDBSchema(this.connection);
        logger.info('Schema DDL executed');
      }

      await reportProgress(`Initialization complete`, 100);
      perfLogger.complete({ repositoryTableExists });
      logger.info('Database initialization completed successfully');
    } catch (error) {
      perfLogger.fail(error as Error);
      logError(logger, error as Error, { dbPath: this.dbPath, operation: 'initialization' });
      throw error;
    } finally {
      release();
    }
  }

  private getConnection(): any {
    if (!this.connection) {
      throw new Error(
        `Database connection is not initialized for path: ${this.dbPath}. Call initialize() first.`,
      );
    }
    return this.connection;
  }

  async executeQuery(
    query: string,
    params?: Record<string, any>,
    options?: { timeout?: number },
  ): Promise<any> {
    const logger = kuzuLogger.child({
      operation: 'execute-query',
      dbPath: this.dbPath,
      queryLength: query.length,
    });

    // Validate connection before executing
    const isValid = await this.validateConnection();
    if (!isValid) {
      logger.warn('Connection invalid, reinitializing...');
      await this.initialize();
    }

    const connection = this.getConnection();

    const queryPromise = async () => {
      try {
        let queryResult;
        if (params && Object.keys(params).length > 0) {
          const preparedStatement = await connection.prepare(query);
          queryResult = await connection.execute(preparedStatement, params);
        } else {
          queryResult = await connection.query(query);
        }

        // KuzuDB returns a QueryResult object. We must call getAll() to get the actual rows.
        if (queryResult && typeof queryResult.getAll === 'function') {
          const rows = await queryResult.getAll();
          logger.debug(
            {
              resultLength: rows.length,
              hasParams: !!(params && Object.keys(params).length > 0),
            },
            'Query executed successfully and results fetched',
          );
          return rows;
        }

        // For queries that don't return a QueryResult (e.g., some DDL), return the raw result.
        logger.debug(
          {
            resultType: typeof queryResult,
            hasParams: !!(params && Object.keys(params).length > 0),
          },
          'Query executed successfully, but no standard QueryResult object returned.',
        );

        return queryResult;
      } catch (error) {
        logError(logger, error as Error, {
          query: query.substring(0, 100) + '...',
          hasParams: !!(params && Object.keys(params).length > 0),
        });
        throw error;
      }
    };

    if (options?.timeout) {
      return Promise.race([
        queryPromise(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Query timed out after ${options.timeout}ms`)),
            options.timeout,
          ),
        ),
      ]);
    }

    return queryPromise();
  }

  async close(): Promise<void> {
    const logger = kuzuLogger.child({
      operation: 'close',
      dbPath: this.dbPath,
    });

    if (this.connection) {
      try {
        this.connection.close();
        logger.info('Connection closed');
      } catch (err) {
        logError(logger, err as Error, { operation: 'close-connection' });
      }
      this.connection = null;
    }

    if (this.database) {
      try {
        this.database.close();
        logger.info('Database closed');
      } catch (err) {
        logError(logger, err as Error, { operation: 'close-database' });
      }
      this.database = null;
    }

    this.connectionCreatedAt = null;
    this.lastValidationTime = null;
    this.isConnectionValid = false;
  }

  /**
   * Executes a series of queries within a transaction.
   * @param transactionBlock A function that receives the transaction context and executes queries.
   * @returns The result of the last query in the transaction block.
   */
  async transaction<T>(
    transactionBlock: (tx: {
      executeQuery: (query: string, params?: Record<string, any>) => Promise<any>;
    }) => Promise<T>,
  ): Promise<T> {
    if (!this.connection) {
      await this.initialize();
    }
    const logger = kuzuLogger.child({ operation: 'transaction', dbPath: this.dbPath });
    logger.debug('Beginning transaction');

    try {
      await this.connection.query('BEGIN TRANSACTION');

      const txContext = {
        executeQuery: async (query: string, params?: Record<string, any>): Promise<any> => {
          logger.debug({ query, params }, 'Executing query in transaction');

          // When parameters are provided, use prepared statements to avoid the
          // "progressCallback must be a function" error that occurs when
          // passing a params object directly to connection.query().
          if (params && Object.keys(params).length > 0) {
            const prepared = await this.connection.prepare(query);
            return this.connection.execute(prepared, params);
          }

          // No params: run the query directly.
          return this.connection.query(query);
        },
      };

      const result = await transactionBlock(txContext);
      await this.connection.query('COMMIT');
      logger.debug('Transaction committed successfully');
      return result;
    } catch (error) {
      logger.error({ error }, 'Transaction failed, rolling back');
      try {
        await this.connection.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error({ rollbackError }, 'Failed to rollback transaction');
      }
      throw error;
    }
  }
}

export async function initializeKuzuDBSchema(connection: any): Promise<void> {
  const logger = kuzuLogger.child({ operation: 'initialize-schema' });
  const perfLogger = createPerformanceLogger(logger, 'schema-initialization');

  const execute = async (query: string) => {
    try {
      // KuzuDB progress bar API removed in current version
      await connection.query(query);
    } catch (e) {
      const errorMsg = `Failed to execute DDL query: ${query.substring(0, 100)}...`;
      logError(logger, e as Error, { query: query.substring(0, 100) });
      throw new Error(errorMsg);
    }
  };

  logger.info('Attempting DDL setup...');

  try {
    // Install and load ALGO extension for graph algorithms
    try {
      logger.info('Installing ALGO extension...');
      await execute('INSTALL ALGO;');
      logger.info('Loading ALGO extension...');
      await execute('LOAD ALGO;');
      logger.info('ALGO extension installed and loaded');
    } catch (e: any) {
      // If the error is that the extension is already installed, that's fine
      if (
        e.message &&
        (e.message.includes('already installed') || e.message.includes('already loaded'))
      ) {
        logger.info('ALGO extension was already installed and loaded');
      } else {
        logger.warn('Failed to install/load ALGO extension, some graph algorithms may not work', {
          error: e.message,
        });
      }
    }

    // Create node tables
    await execute(`
      CREATE NODE TABLE IF NOT EXISTS Repository (
        id STRING,
        name STRING,
        branch STRING,
        created_at STRING,
        updated_at STRING,
        techStack STRING[],
        architecture STRING,
        PRIMARY KEY (id)
      );
    `);

    await execute(`
      CREATE NODE TABLE IF NOT EXISTS Component (
        id STRING,
        name STRING,
        kind STRING,
        status STRING,
        dependsOn STRING[],
        description STRING,
        metadata STRING,
        graph_unique_id STRING,
        branch STRING,
        repository STRING,
        created_at STRING,
        updated_at STRING,
        PRIMARY KEY (graph_unique_id)
      );
    `);

    await execute(`
      CREATE NODE TABLE IF NOT EXISTS Decision (
        id STRING,
        title STRING,
        rationale STRING,
        status STRING,
        dateCreated STRING,
        impact STRING[],
        tags STRING[],
        graph_unique_id STRING,
        branch STRING,
        repository STRING,
        created_at STRING,
        updated_at STRING,
        PRIMARY KEY (graph_unique_id)
      );
    `);

    await execute(`
      CREATE NODE TABLE IF NOT EXISTS Rule (
        id STRING,
        title STRING,
        description STRING,
        scope STRING,
        severity STRING,
        category STRING,
        examples STRING[],
        graph_unique_id STRING,
        branch STRING,
        repository STRING,
        status STRING,
        created_at STRING,
        updated_at STRING,
        PRIMARY KEY (graph_unique_id)
      );
    `);

    await execute(`
      CREATE NODE TABLE IF NOT EXISTS File (
        id STRING,
        name STRING,
        path STRING,
        size_bytes INT64,
        mime_type STRING,
        created_at STRING,
        updated_at STRING,
        repository STRING,
        branch STRING,
        PRIMARY KEY (id)
      );
    `);

    await execute(`
      CREATE NODE TABLE IF NOT EXISTS Tag (
        id STRING,
        name STRING,
        category STRING,
        description STRING,
        color STRING,
        repository STRING,
        branch STRING,
        created_at STRING,
        updated_at STRING,
        PRIMARY KEY (id)
      );
    `);

    await execute(`
      CREATE NODE TABLE IF NOT EXISTS Context (
        id STRING,
        agent STRING,
        summary STRING,
        observation STRING,
        timestamp STRING,
        repository STRING,
        branch STRING,
        graph_unique_id STRING,
        created_at STRING,
        updated_at STRING,
        PRIMARY KEY (graph_unique_id)
      );
    `);

    await execute(`
      CREATE NODE TABLE IF NOT EXISTS Metadata (
        id STRING,
        graph_unique_id STRING,
        branch STRING,
        name STRING,
        content STRING,
        created_at STRING,
        updated_at STRING,
        PRIMARY KEY (graph_unique_id)
      );
    `);

    // Create relationship tables
    await execute(`
      CREATE REL TABLE IF NOT EXISTS DEPENDS_ON (FROM Component TO Component);
    `);

    await execute(`
      CREATE REL TABLE IF NOT EXISTS IMPLEMENTS (FROM File TO Component);
    `);

    await execute(`
      CREATE REL TABLE IF NOT EXISTS TAGGED_WITH (FROM Component TO Tag, FROM Decision TO Tag, FROM Rule TO Tag, FROM File TO Tag);
    `);

    await execute(`
      CREATE REL TABLE IF NOT EXISTS GOVERNS (FROM Rule TO Component);
    `);

    await execute(`
      CREATE REL TABLE IF NOT EXISTS AFFECTS (FROM Decision TO Component);
    `);

    await execute(`
      CREATE REL TABLE IF NOT EXISTS CONTEXT_OF (FROM Context TO Component, FROM Context TO Decision, FROM Context TO Rule);
    `);

    await execute(`
      CREATE REL TABLE IF NOT EXISTS PART_OF (FROM Component TO Repository, FROM Decision TO Repository, FROM Rule TO Repository, FROM File TO Repository, FROM Tag TO Repository, FROM Context TO Repository);
    `);

    perfLogger.complete();
    logger.info('DDL setup finished for the provided connection');
  } catch (error) {
    perfLogger.fail(error as Error);
    const finalMessage = 'Schema setup failed during DDL execution.';
    logError(logger, error as Error, { operation: 'schema-setup' });
    throw new Error(finalMessage);
  }
}
