import fs from 'fs';
import path from 'path';
import { BaseKuzuClient } from '../base/base-kuzu-client';
import { logError } from '../../utils/logger';

/**
 * Service responsible for error handling, permission checking, and recovery operations
 * Handles database-specific errors and provides user-friendly error messages
 */
export class KuzuErrorHandler extends BaseKuzuClient {
  /**
   * Helper method to detect and format permission error messages
   */
  isPermissionError(err: any): boolean {
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
   */
  async isDirectoryWritable(dirPath: string): Promise<boolean> {
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
   */
  checkForStaleLockFile(dbPath: string): { exists: boolean; path?: string; age?: number } {
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
   */
  async cleanupStaleLock(lockFilePath: string, age: number): Promise<boolean> {
    const logger = this.createOperationLogger('cleanup-stale-lock');
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
   * Handle database initialization errors with user-friendly messages
   */
  handleDatabaseError(error: any, operation: string): Error {
    const logger = this.createOperationLogger('handle-database-error', { operation });

    if (this.isPermissionError(error)) {
      const userMessage = `Permission denied: Cannot ${operation} database file '${this.dbPath}'. Please check file system permissions.`;
      logger.error({ error }, userMessage);
      return new Error(userMessage);
    }

    if (
      error.message &&
      (error.message.includes('lock') || error.message.includes('busy'))
    ) {
      const userMessage = `Database file '${this.dbPath}' is locked or in use by another process. Please close other connections and try again.`;
      logger.error({ error }, userMessage);
      return new Error(userMessage);
    }

    const message = `Failed to ${operation} database file '${this.dbPath}'. The file may be corrupted or inaccessible.`;
    logError(logger, error, { operation });
    return new Error(message);
  }

  /**
   * Handle connection errors with user-friendly messages
   */
  handleConnectionError(error: any, operation: string): Error {
    const logger = this.createOperationLogger('handle-connection-error', { operation });

    if (this.isPermissionError(error)) {
      const userMessage = `Permission denied: Cannot ${operation} connection to database '${this.dbPath}'.`;
      logger.error({ error }, userMessage);
      return new Error(userMessage);
    }

    const userMessage = `Failed to ${operation} connection to database '${this.dbPath}'.`;
    logError(logger, error, { operation });
    return new Error(userMessage);
  }

  /**
   * Handle directory creation errors with user-friendly messages
   */
  handleDirectoryError(error: any, dirPath: string): Error {
    const logger = this.createOperationLogger('handle-directory-error', { dirPath });

    if (this.isPermissionError(error)) {
      const userMessage = `Permission denied: Cannot create database directory '${dirPath}'. Please check file system permissions or try running with appropriate privileges.`;
      logger.error({ error }, userMessage);
      return new Error(userMessage);
    }

    logError(logger, error, { operation: 'create-directory' });
    return error;
  }

  /**
   * Validate directory permissions and accessibility
   */
  async validateDirectoryAccess(dirPath: string): Promise<void> {
    const logger = this.createOperationLogger('validate-directory-access', { dirPath });

    // Check if directory exists, create if needed
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info('Created database directory');
      } catch (dirError: unknown) {
        throw this.handleDirectoryError(dirError, dirPath);
      }
    }

    // Check directory writability
    const isWritable = await this.isDirectoryWritable(dirPath);
    if (!isWritable) {
      const userMessage = `Database directory '${dirPath}' is not writable. Please check file system permissions.`;
      logger.error(userMessage);
      throw new Error(userMessage);
    }

    logger.debug('Directory access validation successful');
  }
}
