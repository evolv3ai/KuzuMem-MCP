// Internal services and utilities
import { kuzuLogger } from '../utils/logger';

// Specialized services
import { BaseKuzuClient, timeOperation } from './base/base-kuzu-client';
import { KuzuConnectionManager } from './services/kuzu-connection-manager';
import { KuzuQueryExecutor } from './services/kuzu-query-executor';
import { KuzuTransactionManager } from './services/kuzu-transaction-manager';
import { KuzuSchemaManager } from './services/kuzu-schema-manager';
import { KuzuErrorHandler } from './services/kuzu-error-handler';

/**
 * Main KuzuDB Client that orchestrates specialized database services
 *
 * This is the main orchestrator that delegates to specialized services:
 * - KuzuConnectionManager: Connection lifecycle and health management
 * - KuzuQueryExecutor: Query execution and prepared statements
 * - KuzuTransactionManager: Transaction handling and rollback
 * - KuzuSchemaManager: Schema initialization and DDL operations
 * - KuzuErrorHandler: Error handling and recovery
 */
export class KuzuDBClient extends BaseKuzuClient {
  // Specialized services
  private connectionManager: KuzuConnectionManager;
  private queryExecutor: KuzuQueryExecutor;
  private transactionManager: KuzuTransactionManager;
  private schemaManager: KuzuSchemaManager;
  private errorHandler: KuzuErrorHandler;

  /**
   * Creates an instance of KuzuDBClient with all specialized services
   */
  constructor(clientProjectRoot: string) {
    super(clientProjectRoot);

    // Initialize specialized services
    this.connectionManager = new KuzuConnectionManager(clientProjectRoot);
    this.queryExecutor = new KuzuQueryExecutor(clientProjectRoot, this.connectionManager);
    this.transactionManager = new KuzuTransactionManager(clientProjectRoot, this.connectionManager);
    this.schemaManager = new KuzuSchemaManager(clientProjectRoot, this.queryExecutor);
    this.errorHandler = new KuzuErrorHandler(clientProjectRoot);
  }

  // === Connection Management - Delegated to KuzuConnectionManager ===

  /**
   * Initialize database and connection with progress reporting
   */
  async initialize(progressReporter?: {
    sendProgress: (progress: any) => Promise<void>;
  }): Promise<void> {
    // Check if schema needs initialization
    const schemaValid = await this.schemaManager.validateSchema();

    await this.connectionManager.initialize(progressReporter);

    if (!schemaValid.valid) {
      const logger = this.createOperationLogger('initialize-schema');
      logger.info('Schema validation failed, initializing schema', {
        missingTables: schemaValid.missingTables,
      });
      await this.schemaManager.initializeSchema();
    }
  }

  /**
   * Close database and connection
   */
  async close(): Promise<void> {
    return this.connectionManager.close();
  }

  // === Query Execution - Delegated to KuzuQueryExecutor ===

  /**
   * Execute a query with optional parameters and timeout
   */
  async executeQuery(
    query: string,
    params?: Record<string, any>,
    options?: { timeout?: number },
  ): Promise<any> {
    return this.queryExecutor.executeQuery(query, params, options);
  }

  // === Transaction Management - Delegated to KuzuTransactionManager ===

  /**
   * Execute a series of queries within a transaction
   */
  async transaction<T>(
    transactionBlock: (tx: {
      executeQuery: (query: string, params?: Record<string, any>) => Promise<any>;
    }) => Promise<T>,
  ): Promise<T> {
    return this.transactionManager.transaction(transactionBlock);
  }
}

/**
 * Legacy schema initialization function for backward compatibility
 * @deprecated Use KuzuSchemaManager.initializeSchema() instead
 */
export async function initializeKuzuDBSchema(connection: any): Promise<void> {
  const logger = kuzuLogger.child({ operation: 'initialize-schema-legacy' });
  logger.warn('Using deprecated initializeKuzuDBSchema function. Consider using KuzuSchemaManager instead.');

  // For backward compatibility, we'll create a temporary schema manager
  // This is not ideal but maintains compatibility with existing code
  const tempSchemaManager = {
    async executeQuery(query: string): Promise<any> {
      return connection.query(query);
    }
  };

  // Execute basic schema creation
  const queries = [
    'INSTALL JSON;',
    'LOAD JSON;',
    'INSTALL ALGO;',
    'LOAD ALGO;',
    `CREATE NODE TABLE IF NOT EXISTS Repository (
      id STRING,
      name STRING,
      branch STRING,
      created_at STRING,
      updated_at STRING,
      techStack STRING[],
      architecture STRING,
      PRIMARY KEY (id)
    );`,
    `CREATE NODE TABLE IF NOT EXISTS Component (
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
    );`,
    'CREATE REL TABLE IF NOT EXISTS DEPENDS_ON (FROM Component TO Component);',
    'CREATE REL TABLE IF NOT EXISTS PART_OF (FROM Component TO Repository);',
  ];

  for (const query of queries) {
    try {
      await connection.query(query);
    } catch (e: any) {
      if (!e.message?.includes('already')) {
        logger.warn(`Schema query failed: ${e.message}`);
      }
    }
  }
}
