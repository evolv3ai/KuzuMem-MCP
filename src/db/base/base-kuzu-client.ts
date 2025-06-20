import fs from 'fs';
import path from 'path';
import { kuzuLogger } from '../../utils/logger';
import config from '../config';

// Connection constants
export const CONNECTION_VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const SCHEMA_CHECK_TIMEOUT = 5000; // 5 seconds timeout for schema check
export const MAX_CONNECTION_AGE = 30 * 60 * 1000; // 30 minutes max connection age

/**
 * Helper function to track, log, and report progress for operation timing
 */
export async function timeOperation<T>(
  operation: string,
  context: string,
  progressCallback: ((message: string, percent?: number) => Promise<void>) | null = null,
  fn: () => Promise<T>,
): Promise<T> {
  const logger = kuzuLogger.child({ operation, context });

  try {
    logger.debug('Operation starting');

    // Send progress notification if callback provided
    if (progressCallback) {
      await progressCallback(`${operation} for ${context}`);
    }

    const result = await fn();
    logger.debug('Operation completed successfully');
    return result;
  } catch (error) {
    logger.error('Operation failed', { error });
    throw error;
  }
}

/**
 * Base class for Kuzu database operations
 * Provides common configuration, logging, and utility methods
 */
export abstract class BaseKuzuClient {
  public readonly dbPath: string;
  protected logger = kuzuLogger.child({ component: 'BaseKuzuClient' });

  constructor(clientProjectRoot: string) {
    this.dbPath = this.initializeDbPath(clientProjectRoot);
    this.logger = kuzuLogger.child({
      component: this.constructor.name,
      dbPath: this.dbPath,
    });
    this.logger.info('Kuzu client instance created');
  }

  /**
   * Initialize database path from client project root or environment override
   */
  private initializeDbPath(clientProjectRoot: string): string {
    const logger = kuzuLogger.child({ operation: 'initialize-db-path' });
    const overrideDbPath = process.env.DB_PATH_OVERRIDE;

    if (overrideDbPath) {
      logger.info({ dbPath: overrideDbPath }, 'Using DB_PATH_OVERRIDE from environment');
      // Ensure the directory for the override path exists
      const dbDir = path.dirname(overrideDbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info({ dbDir }, 'Created directory for override DB path');
      }
      return overrideDbPath;
    }

    // Validate and use client project root
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
    const dbPath = path.join(repoDbDir, config.DB_FILENAME);

    // Ensure the directory for the constructed path exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      logger.info({ dbDir }, 'Created database directory');
    }

    return dbPath;
  }

  /**
   * Create a child logger with operation context
   */
  protected createOperationLogger(operation: string, context: Record<string, any> = {}) {
    return this.logger.child({
      operation,
      ...context,
    });
  }

  /**
   * Get database directory path
   */
  protected getDbDirectory(): string {
    return path.dirname(this.dbPath);
  }

  /**
   * Get database filename
   */
  protected getDbFilename(): string {
    return path.basename(this.dbPath);
  }
}
