import { BaseKuzuClient } from '../base/base-kuzu-client';
import { KuzuQueryExecutor } from './kuzu-query-executor';
import { createPerformanceLogger } from '../../utils/logger';
import { logError } from '../../utils/logger';

/**
 * Service responsible for database schema management
 * Handles schema initialization, DDL operations, and schema validation
 */
export class KuzuSchemaManager extends BaseKuzuClient {
  private queryExecutor: KuzuQueryExecutor;

  constructor(clientProjectRoot: string, queryExecutor: KuzuQueryExecutor) {
    super(clientProjectRoot);
    this.queryExecutor = queryExecutor;
  }

  /**
   * Initialize the complete KuzuDB schema
   */
  async initializeSchema(): Promise<void> {
    const logger = this.createOperationLogger('initialize-schema');
    const perfLogger = createPerformanceLogger(logger, 'schema-initialization');

    try {
      logger.info('Starting schema initialization');

      // Install extensions
      await this.installExtensions();

      // Create node tables
      await this.createNodeTables();

      // Create relationship tables
      await this.createRelationshipTables();

      logger.info('Database schema creation completed');
      perfLogger.complete();
    } catch (error) {
      perfLogger.fail(error as Error);
      logError(logger, error as Error, { operation: 'schema-setup' });
      throw new Error('Schema setup failed during DDL execution.');
    }
  }

  /**
   * Install required KuzuDB extensions
   */
  private async installExtensions(): Promise<void> {
    const logger = this.createOperationLogger('install-extensions');

    // Install and load JSON extension
    try {
      logger.info('Installing JSON extension...');
      await this.queryExecutor.executeSimpleQuery('INSTALL JSON;');
      logger.info('Loading JSON extension...');
      await this.queryExecutor.executeSimpleQuery('LOAD JSON;');
      logger.info('JSON extension installed and loaded');
    } catch (e: any) {
      if (
        e.message &&
        (e.message.includes('already installed') || e.message.includes('already loaded'))
      ) {
        logger.info('JSON extension was already installed and loaded');
      } else {
        logger.warn('Failed to install/load JSON extension, JSON functions may not work', {
          error: e.message,
        });
      }
    }

    // Install and load ALGO extension
    try {
      logger.info('Installing ALGO extension...');
      await this.queryExecutor.executeSimpleQuery('INSTALL ALGO;');
      logger.info('Loading ALGO extension...');
      await this.queryExecutor.executeSimpleQuery('LOAD ALGO;');
      logger.info('ALGO extension installed and loaded');
    } catch (e: any) {
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
  }

  /**
   * Create all node tables
   */
  private async createNodeTables(): Promise<void> {
    const logger = this.createOperationLogger('create-node-tables');
    logger.info('Creating node tables');

    const nodeTableQueries = [
      // Repository table
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

      // Component table
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

      // Decision table
      `CREATE NODE TABLE IF NOT EXISTS Decision (
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
      );`,

      // Rule table
      `CREATE NODE TABLE IF NOT EXISTS Rule (
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
      );`,

      // File table
      `CREATE NODE TABLE IF NOT EXISTS File (
        id STRING,
        name STRING,
        path STRING,
        size INT64,
        mime_type STRING,
        lastModified STRING,
        checksum STRING,
        metadata STRING,
        created_at STRING,
        updated_at STRING,
        repository STRING,
        branch STRING,
        PRIMARY KEY (id)
      );`,

      // Tag table
      `CREATE NODE TABLE IF NOT EXISTS Tag (
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
      );`,

      // Context table
      `CREATE NODE TABLE IF NOT EXISTS Context (
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
      );`,

      // Metadata table
      `CREATE NODE TABLE IF NOT EXISTS Metadata (
        id STRING,
        graph_unique_id STRING,
        branch STRING,
        name STRING,
        content STRING,
        created_at STRING,
        updated_at STRING,
        PRIMARY KEY (graph_unique_id)
      );`,
    ];

    await this.queryExecutor.executeBatch(nodeTableQueries);
    logger.info('Node tables created successfully');
  }

  /**
   * Create all relationship tables
   */
  private async createRelationshipTables(): Promise<void> {
    const logger = this.createOperationLogger('create-relationship-tables');
    logger.info('Creating relationship tables');

    const relationshipTableQueries = [
      'CREATE REL TABLE IF NOT EXISTS DEPENDS_ON (FROM Component TO Component);',
      'CREATE REL TABLE IF NOT EXISTS IMPLEMENTS (FROM Component TO File);',
      'CREATE REL TABLE IF NOT EXISTS TAGGED_WITH (FROM Component TO Tag, FROM Decision TO Tag, FROM Rule TO Tag, FROM File TO Tag);',
      'CREATE REL TABLE IF NOT EXISTS GOVERNS (FROM Rule TO Component);',
      'CREATE REL TABLE IF NOT EXISTS AFFECTS (FROM Decision TO Component);',
      'CREATE REL TABLE IF NOT EXISTS CONTEXT_OF (FROM Context TO Component, FROM Context TO Decision, FROM Context TO Rule);',
      'CREATE REL TABLE IF NOT EXISTS PART_OF (FROM Component TO Repository, FROM Decision TO Repository, FROM Rule TO Repository, FROM File TO Repository, FROM Tag TO Repository, FROM Context TO Repository);',
    ];

    await this.queryExecutor.executeBatch(relationshipTableQueries);
    logger.info('Relationship tables created successfully');
  }

  /**
   * Check if the schema is properly initialized
   */
  async validateSchema(): Promise<{ valid: boolean; missingTables: string[] }> {
    const logger = this.createOperationLogger('validate-schema');

    const requiredTables = [
      'Repository',
      'Component',
      'Decision',
      'Rule',
      'File',
      'Tag',
      'Context',
      'Metadata',
    ];

    const missingTables: string[] = [];

    try {
      for (const tableName of requiredTables) {
        const exists = await this.queryExecutor.tableExists(tableName);
        if (!exists) {
          missingTables.push(tableName);
        }
      }

      const valid = missingTables.length === 0;
      logger.debug({ valid, missingTables }, 'Schema validation completed');

      return { valid, missingTables };
    } catch (error) {
      logError(logger, error as Error);
      return { valid: false, missingTables: requiredTables };
    }
  }

  /**
   * Get current schema information
   */
  async getSchemaInfo(): Promise<{
    tables: string[];
    relationships: string[];
    extensions: string[];
  }> {
    const logger = this.createOperationLogger('get-schema-info');

    try {
      const { tables, relationships } = await this.queryExecutor.getSchemaInfo();

      // Try to get extension information (this might not be available in all KuzuDB versions)
      let extensions: string[] = [];
      try {
        const extensionResult = await this.queryExecutor.executeQuery('CALL show_extensions() RETURN name;');
        extensions = Array.isArray(extensionResult)
          ? extensionResult.map((ext: any) => ext.name || ext).filter(Boolean)
          : [];
      } catch (e) {
        // Extensions query not supported, use known extensions
        extensions = ['JSON', 'ALGO'];
      }

      logger.debug({
        tableCount: tables.length,
        relationshipCount: relationships.length,
        extensionCount: extensions.length,
      }, 'Schema information retrieved');

      return { tables, relationships, extensions };
    } catch (error) {
      logError(logger, error as Error);
      return { tables: [], relationships: [], extensions: [] };
    }
  }
}
