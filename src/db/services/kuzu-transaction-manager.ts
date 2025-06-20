import { BaseKuzuClient } from '../base/base-kuzu-client';
import { KuzuConnectionManager } from './kuzu-connection-manager';
import { logError } from '../../utils/logger';

/**
 * Service responsible for managing database transactions
 * Handles transaction lifecycle, rollback, and nested transaction support
 */
export class KuzuTransactionManager extends BaseKuzuClient {
  private connectionManager: KuzuConnectionManager;
  private activeTransactions = new Set<string>();

  constructor(clientProjectRoot: string, connectionManager: KuzuConnectionManager) {
    super(clientProjectRoot);
    this.connectionManager = connectionManager;
  }

  /**
   * Execute a series of queries within a transaction
   */
  async transaction<T>(
    transactionBlock: (tx: {
      executeQuery: (query: string, params?: Record<string, any>) => Promise<any>;
    }) => Promise<T>,
  ): Promise<T> {
    if (!this.connectionManager.isConnected()) {
      await this.connectionManager.initialize();
    }

    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const logger = this.createOperationLogger('transaction', { transactionId });

    logger.debug('Beginning transaction');

    try {
      const connection = this.connectionManager.getConnection();
      await connection.query('BEGIN TRANSACTION');
      this.activeTransactions.add(transactionId);

      const txContext = {
        executeQuery: async (query: string, params?: Record<string, any>): Promise<any> => {
          logger.debug({ query, params }, 'Executing query in transaction');

          // When parameters are provided, use prepared statements to avoid the
          // "progressCallback must be a function" error that occurs when
          // passing a params object directly to connection.query().
          if (params && Object.keys(params).length > 0) {
            const prepared = await connection.prepare(query);
            return connection.execute(prepared, params);
          }

          // No params: run the query directly.
          return connection.query(query);
        },
      };

      const result = await transactionBlock(txContext);
      await connection.query('COMMIT');
      this.activeTransactions.delete(transactionId);

      logger.debug('Transaction committed successfully');
      return result;
    } catch (error) {
      logger.error({ error }, 'Transaction failed, rolling back');

      try {
        const connection = this.connectionManager.getConnection();
        await connection.query('ROLLBACK');
        this.activeTransactions.delete(transactionId);
        logger.debug('Transaction rolled back successfully');
      } catch (rollbackError) {
        logger.error({ rollbackError }, 'Failed to rollback transaction');
        this.activeTransactions.delete(transactionId);
      }

      throw error;
    }
  }

  /**
   * Execute a transaction with automatic retry on failure
   */
  async transactionWithRetry<T>(
    transactionBlock: (tx: {
      executeQuery: (query: string, params?: Record<string, any>) => Promise<any>;
    }) => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000,
  ): Promise<T> {
    const logger = this.createOperationLogger('transaction-with-retry', { maxRetries });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({ attempt }, 'Attempting transaction');
        return await this.transaction(transactionBlock);
      } catch (error) {
        lastError = error as Error;
        logger.warn({ attempt, error }, 'Transaction attempt failed');

        if (attempt < maxRetries) {
          logger.debug({ retryDelay }, 'Waiting before retry');
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    logger.error({ maxRetries }, 'All transaction attempts failed');
    throw lastError || new Error('Transaction failed after all retry attempts');
  }

  /**
   * Execute multiple transactions in sequence
   */
  async sequentialTransactions<T>(
    transactionBlocks: Array<
      (tx: {
        executeQuery: (query: string, params?: Record<string, any>) => Promise<any>;
      }) => Promise<T>
    >,
  ): Promise<T[]> {
    const logger = this.createOperationLogger('sequential-transactions', {
      transactionCount: transactionBlocks.length,
    });

    const results: T[] = [];

    try {
      for (let i = 0; i < transactionBlocks.length; i++) {
        logger.debug({ transactionIndex: i }, 'Executing sequential transaction');
        const result = await this.transaction(transactionBlocks[i]);
        results.push(result);
      }

      logger.debug('All sequential transactions completed successfully');
      return results;
    } catch (error) {
      logger.error({ completedTransactions: results.length }, 'Sequential transaction failed');
      throw error;
    }
  }

  /**
   * Check if there are any active transactions
   */
  hasActiveTransactions(): boolean {
    return this.activeTransactions.size > 0;
  }

  /**
   * Get the number of active transactions
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  /**
   * Force rollback all active transactions (emergency cleanup)
   */
  async forceRollbackAll(): Promise<void> {
    const logger = this.createOperationLogger('force-rollback-all', {
      activeTransactionCount: this.activeTransactions.size,
    });

    if (this.activeTransactions.size === 0) {
      logger.debug('No active transactions to rollback');
      return;
    }

    logger.warn('Force rolling back all active transactions');

    try {
      const connection = this.connectionManager.getConnection();
      await connection.query('ROLLBACK');
      this.activeTransactions.clear();
      logger.info('All active transactions rolled back');
    } catch (error) {
      logError(logger, error as Error, { operation: 'force-rollback' });
      // Clear the set anyway since we can't be sure of the state
      this.activeTransactions.clear();
      throw error;
    }
  }

  /**
   * Execute a read-only transaction (for queries that don't modify data)
   */
  async readOnlyTransaction<T>(
    queryBlock: (tx: {
      executeQuery: (query: string, params?: Record<string, any>) => Promise<any>;
    }) => Promise<T>,
  ): Promise<T> {
    const logger = this.createOperationLogger('read-only-transaction');

    // For read-only operations, we can execute without explicit transaction boundaries
    // but still provide the transaction-like interface
    if (!this.connectionManager.isConnected()) {
      await this.connectionManager.initialize();
    }

    const connection = this.connectionManager.getConnection();

    const txContext = {
      executeQuery: async (query: string, params?: Record<string, any>): Promise<any> => {
        logger.debug({ query, params }, 'Executing read-only query');

        if (params && Object.keys(params).length > 0) {
          const prepared = await connection.prepare(query);
          return connection.execute(prepared, params);
        }

        return connection.query(query);
      },
    };

    try {
      const result = await queryBlock(txContext);
      logger.debug('Read-only transaction completed successfully');
      return result;
    } catch (error) {
      logError(logger, error as Error, { operation: 'read-only-transaction' });
      throw error;
    }
  }
}
