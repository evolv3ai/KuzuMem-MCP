import { BaseKuzuClient } from '../base/base-kuzu-client';
import { KuzuConnectionManager } from './kuzu-connection-manager';
import { logError } from '../../utils/logger';

/**
 * Service responsible for executing queries against the Kuzu database
 * Handles query execution, prepared statements, and result processing
 */
export class KuzuQueryExecutor extends BaseKuzuClient {
  private connectionManager: KuzuConnectionManager;

  constructor(clientProjectRoot: string, connectionManager: KuzuConnectionManager) {
    super(clientProjectRoot);
    this.connectionManager = connectionManager;
  }

  /**
   * Execute a query with optional parameters and timeout
   */
  async executeQuery(
    query: string,
    params?: Record<string, any>,
    options?: { timeout?: number },
  ): Promise<any> {
    const logger = this.createOperationLogger('execute-query', {
      queryLength: query.length,
    });

    // Validate connection before executing
    const isValid = await this.connectionManager.validateConnection();
    if (!isValid) {
      logger.warn('Connection invalid, reinitializing...');
      await this.connectionManager.initialize();
    }

    const connection = this.connectionManager.getConnection();

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

  /**
   * Execute a prepared statement with parameters
   */
  async executePreparedStatement(query: string, params: Record<string, any>): Promise<any> {
    const logger = this.createOperationLogger('execute-prepared-statement');

    try {
      const connection = this.connectionManager.getConnection();
      const preparedStatement = await connection.prepare(query);
      const result = await connection.execute(preparedStatement, params);

      logger.debug(
        { paramCount: Object.keys(params).length },
        'Prepared statement executed successfully',
      );

      return result;
    } catch (error) {
      logError(logger, error as Error, {
        query: query.substring(0, 100) + '...',
        paramCount: Object.keys(params).length,
      });
      throw error;
    }
  }

  /**
   * Execute a simple query without parameters
   */
  async executeSimpleQuery(query: string): Promise<any> {
    const logger = this.createOperationLogger('execute-simple-query');

    try {
      const connection = this.connectionManager.getConnection();
      const result = await connection.query(query);

      logger.debug('Simple query executed successfully');
      return result;
    } catch (error) {
      logError(logger, error as Error, {
        query: query.substring(0, 100) + '...',
      });
      throw error;
    }
  }

  /**
   * Execute multiple queries in sequence
   */
  async executeBatch(queries: string[]): Promise<any[]> {
    const logger = this.createOperationLogger('execute-batch', {
      queryCount: queries.length,
    });

    const results: any[] = [];

    try {
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        logger.debug({ queryIndex: i, queryLength: query.length }, 'Executing batch query');

        const result = await this.executeSimpleQuery(query);
        results.push(result);
      }

      logger.debug('Batch execution completed successfully');
      return results;
    } catch (error) {
      logError(logger, error as Error, {
        queryCount: queries.length,
        completedQueries: results.length,
      });
      throw error;
    }
  }

  /**
   * Check if a table exists in the database
   */
  async tableExists(tableName: string): Promise<boolean> {
    const logger = this.createOperationLogger('table-exists', { tableName });

    try {
      const result = await this.executeQuery(`
        CALL show_tables() RETURN name;
      `);

      const tables = result || [];
      const exists = Array.isArray(tables)
        ? tables.some((table: any) => table.name === tableName || table === tableName)
        : JSON.stringify(tables).includes(tableName);

      logger.debug({ exists }, 'Table existence check completed');
      return exists;
    } catch (error) {
      logError(logger, error as Error, { tableName });
      return false;
    }
  }

  /**
   * Get database schema information
   */
  async getSchemaInfo(): Promise<{
    tables: string[];
    relationships: string[];
  }> {
    const logger = this.createOperationLogger('get-schema-info');

    try {
      // Get tables
      const tablesResult = await this.executeQuery(`
        CALL show_tables() RETURN name;
      `);

      const tables = Array.isArray(tablesResult)
        ? tablesResult.map((table: any) => table.name || table).filter(Boolean)
        : [];

      // Get relationships (this might need adjustment based on KuzuDB's relationship introspection)
      const relationshipsResult = await this.executeQuery(
        `
        CALL show_connection() RETURN *;
      `,
      ).catch(() => []); // Fallback to empty array if command doesn't exist

      const relationships = Array.isArray(relationshipsResult)
        ? relationshipsResult.map((rel: any) => rel.name || rel).filter(Boolean)
        : [];

      logger.debug(
        { tableCount: tables.length, relationshipCount: relationships.length },
        'Schema information retrieved',
      );

      return { tables, relationships };
    } catch (error) {
      logError(logger, error as Error);
      return { tables: [], relationships: [] };
    }
  }
}
