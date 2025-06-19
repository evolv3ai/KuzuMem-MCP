// eslint-disable-next-line @typescript-eslint/no-var-requires
const kuzu = require('kuzu');

import { BaseKuzuClient, CONNECTION_VALIDATION_INTERVAL, MAX_CONNECTION_AGE } from '../base/base-kuzu-client';
import { KuzuErrorHandler } from './kuzu-error-handler';
import { logError } from '../../utils/logger';
import { Mutex } from '../../utils/mutex';

/**
 * Service responsible for managing Kuzu database connections
 * Handles connection lifecycle, health validation, and connection pooling
 */
export class KuzuConnectionManager extends BaseKuzuClient {
  private database: any = null;
  private connection: any = null;
  private errorHandler: KuzuErrorHandler;

  // Connection health tracking
  private connectionCreatedAt: Date | null = null;
  private lastValidationTime: Date | null = null;
  private isConnectionValid: boolean = false;

  // Static initialization management
  private static initializationLock = new Mutex();
  private static initializationPromises = new Map<string, Promise<void>>();

  constructor(clientProjectRoot: string) {
    super(clientProjectRoot);
    this.errorHandler = new KuzuErrorHandler(clientProjectRoot);
  }

  /**
   * Get the current connection, throwing an error if not initialized
   */
  getConnection(): any {
    if (!this.connection) {
      throw new Error(
        `Database connection is not initialized for path: ${this.dbPath}. Call initialize() first.`,
      );
    }
    return this.connection;
  }

  /**
   * Get the current database instance
   */
  getDatabase(): any {
    if (!this.database) {
      throw new Error(
        `Database is not initialized for path: ${this.dbPath}. Call initialize() first.`,
      );
    }
    return this.database;
  }

  /**
   * Check if connection is currently valid
   */
  isConnected(): boolean {
    return this.connection !== null && this.isConnectionValid;
  }

  /**
   * Validate the current connection is still healthy
   */
  async validateConnection(): Promise<boolean> {
    const logger = this.createOperationLogger('validate-connection');

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
   */
  async resetConnection(): Promise<void> {
    const logger = this.createOperationLogger('reset-connection');
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

  /**
   * Initialize database and connection with progress reporting
   */
  async initialize(progressReporter?: {
    sendProgress: (progress: any) => Promise<void>;
  }): Promise<void> {
    // Set up progress reporting function
    const reportProgress = async (message: string, percent?: number) => {
      if (progressReporter?.sendProgress) {
        try {
          await progressReporter.sendProgress({ message, percent });
        } catch (err) {
          logError(this.logger, err as Error, { operation: 'progress-notification' });
        }
      }
    };

    // Check if there's an ongoing initialization for this dbPath
    const existingPromise = KuzuConnectionManager.initializationPromises.get(this.dbPath);
    if (existingPromise) {
      this.logger.debug('Waiting for existing initialization');
      return existingPromise;
    }

    // Use existing valid connection if available
    const isValid = await this.validateConnection();
    if (isValid) {
      this.logger.debug('Using existing valid connection');
      return;
    } else if (this.connection) {
      this.logger.debug('Existing connection invalid, resetting...');
      await this.resetConnection();
    }

    // Create new initialization promise
    const initPromise = this._performInitialization(reportProgress);
    KuzuConnectionManager.initializationPromises.set(this.dbPath, initPromise);

    try {
      await initPromise;
    } finally {
      // Clean up the promise from the map once initialization is complete
      KuzuConnectionManager.initializationPromises.delete(this.dbPath);
    }
  }

  /**
   * Performs the actual initialization work
   */
  private async _performInitialization(
    reportProgress: (message: string, percent?: number) => Promise<void>,
  ): Promise<void> {
    const logger = this.createOperationLogger('initialize');
    const release = await KuzuConnectionManager.initializationLock.acquire();

    try {
      logger.info('Starting database initialization');

      const dbDir = this.getDbDirectory();

      // Validate directory access and permissions
      await reportProgress(`Validating directory access: ${dbDir}`, 10);
      await this.errorHandler.validateDirectoryAccess(dbDir);

      // Check for stale lock files
      const lockInfo = this.errorHandler.checkForStaleLockFile(this.dbPath);
      if (lockInfo.exists && lockInfo.path && lockInfo.age) {
        await this.errorHandler.cleanupStaleLock(lockInfo.path, lockInfo.age);
      }

      // Initialize database
      await reportProgress(`Opening database: ${this.dbPath}`, 30);
      try {
        this.database = new kuzu.Database(this.dbPath);
        logger.info('Database opened successfully');
      } catch (dbError: unknown) {
        throw this.errorHandler.handleDatabaseError(dbError, 'open');
      }

      // Create connection
      await reportProgress(`Establishing connection`, 50);
      try {
        this.connection = new kuzu.Connection(this.database);
        this.connectionCreatedAt = new Date();
        this.isConnectionValid = true;
        logger.info('Connection successfully established');
      } catch (connError: unknown) {
        throw this.errorHandler.handleConnectionError(connError, 'establish');
      }

      // Validate connection
      await reportProgress(`Validating connection`, 70);
      try {
        logger.debug('Testing connection...');
        await this.connection.query('RETURN 1;');
        logger.debug('Connection test successful');
      } catch (error) {
        logError(logger, error as Error, { operation: 'connection-validation' });
        throw new Error('Failed to validate database connection');
      }

      await reportProgress(`Initialization complete`, 100);
      logger.info('Database initialization completed successfully');
    } catch (error) {
      logError(logger, error as Error, { operation: 'initialization' });
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Close database and connection
   */
  async close(): Promise<void> {
    const logger = this.createOperationLogger('close');

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
}
