import { BaseGraphOperations } from '../base/base-graph-operations';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

/**
 * Service responsible for managing projected graphs in KuzuDB
 * Handles creation, cleanup, and lifecycle management of projected graphs
 */
export class GraphProjectionManager extends BaseGraphOperations {
  /**
   * Execute a callback with a projected graph, ensuring proper cleanup
   */
  async withProjectedGraph<T>(
    mcpContext: EnrichedRequestHandlerExtra,
    projectionName: string,
    nodeTables: string[],
    relTables: string[],
    callback: () => Promise<T>,
  ): Promise<T | { error: string }> {
    const logger = this.createOperationLogger(mcpContext, 'withProjectedGraph', {
      projectionName,
      nodeTables,
      relTables,
    });

    const nodeTableNamesArray = `[${nodeTables.map((n) => `'${n}'`).join(', ')}]`;
    const relTableNamesArray = `[${relTables.map((r) => `'${r}'`).join(', ')}]`;
    const safeProjectionName = projectionName.replace(/[^a-zA-Z0-9_]/g, '_');

    // Use correct KuzuDB syntax for projected graphs
    const createProjectionQuery = `CALL project_graph('${safeProjectionName}', ${nodeTableNamesArray}, ${relTableNamesArray});`;
    const dropProjectionQuery = `CALL drop_projected_graph('${safeProjectionName}');`;

    try {
      logger.debug(
        `Creating projected graph: ${safeProjectionName} with query: ${createProjectionQuery}`,
      );
      await this.kuzuClient.executeQuery(createProjectionQuery, {});
      logger.debug(`Successfully created projected graph: ${safeProjectionName}`);
    } catch (projectionError: any) {
      logger.error(`Error creating projected graph ${safeProjectionName}:`, {
        error: projectionError.toString(),
        stack: projectionError.stack,
        query: createProjectionQuery,
      });
      // Return a graceful error response instead of throwing
      return {
        error: `Failed to create projected graph '${safeProjectionName}': ${projectionError.message}`,
      };
    }

    try {
      return await callback();
    } catch (callbackError: any) {
      logger.error(
        `Error executing callback for projected graph ${safeProjectionName}:`,
        {
          error: callbackError.toString(),
          stack: callbackError.stack,
        },
      );
      return { error: `Algorithm execution failed: ${callbackError.message}` };
    } finally {
      try {
        logger.debug(`Dropping projected graph: ${safeProjectionName}`);
        await this.kuzuClient.executeQuery(dropProjectionQuery, {});
      } catch (dropError: any) {
        logger.error(`Error dropping projected graph ${safeProjectionName}:`, {
          error: dropError.toString(),
          stack: dropError.stack,
        });
        // This error is less critical and should not mask a success or a more important error.
      }
    }
  }

  /**
   * Create a projected graph manually (without automatic cleanup)
   */
  async createProjectedGraph(
    mcpContext: EnrichedRequestHandlerExtra,
    projectionName: string,
    nodeTables: string[],
    relTables: string[],
  ): Promise<{ success: boolean; error?: string }> {
    const logger = this.createOperationLogger(mcpContext, 'createProjectedGraph', {
      projectionName,
      nodeTables,
      relTables,
    });

    const nodeTableNamesArray = `[${nodeTables.map((n) => `'${n}'`).join(', ')}]`;
    const relTableNamesArray = `[${relTables.map((r) => `'${r}'`).join(', ')}]`;
    const safeProjectionName = projectionName.replace(/[^a-zA-Z0-9_]/g, '_');

    const createProjectionQuery = `CALL project_graph('${safeProjectionName}', ${nodeTableNamesArray}, ${relTableNamesArray});`;

    try {
      logger.debug(`Creating projected graph: ${safeProjectionName}`);
      await this.kuzuClient.executeQuery(createProjectionQuery, {});
      logger.info(`Successfully created projected graph: ${safeProjectionName}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`Failed to create projected graph ${safeProjectionName}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        success: false,
        error: `Failed to create projected graph '${safeProjectionName}': ${error.message}`,
      };
    }
  }

  /**
   * Drop a projected graph manually
   */
  async dropProjectedGraph(
    mcpContext: EnrichedRequestHandlerExtra,
    projectionName: string,
  ): Promise<{ success: boolean; error?: string }> {
    const logger = this.createOperationLogger(mcpContext, 'dropProjectedGraph', {
      projectionName,
    });

    const safeProjectionName = projectionName.replace(/[^a-zA-Z0-9_]/g, '_');
    const dropProjectionQuery = `CALL drop_projected_graph('${safeProjectionName}');`;

    try {
      logger.debug(`Dropping projected graph: ${safeProjectionName}`);
      await this.kuzuClient.executeQuery(dropProjectionQuery, {});
      logger.info(`Successfully dropped projected graph: ${safeProjectionName}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`Failed to drop projected graph ${safeProjectionName}:`, {
        error: error.toString(),
        stack: error.stack,
      });
      return {
        success: false,
        error: `Failed to drop projected graph '${safeProjectionName}': ${error.message}`,
      };
    }
  }

  /**
   * List all projected graphs
   */
  async listProjectedGraphs(
    mcpContext: EnrichedRequestHandlerExtra,
  ): Promise<{ graphs: string[]; error?: string }> {
    const logger = this.createOperationLogger(mcpContext, 'listProjectedGraphs', {});

    try {
      // This query might not exist in all KuzuDB versions, so we'll handle gracefully
      const listQuery = `CALL show_projected_graphs() RETURN name;`;
      const result = await this.kuzuClient.executeQuery(listQuery, {});

      const graphs = Array.isArray(result)
        ? result.map((row: any) => row.name || row).filter(Boolean)
        : [];

      logger.debug(`Found ${graphs.length} projected graphs`);
      return { graphs };
    } catch (error: any) {
      logger.warn(`Could not list projected graphs (command may not be supported):`, {
        error: error.toString(),
      });
      return {
        graphs: [],
        error: `Could not list projected graphs: ${error.message}`,
      };
    }
  }

  /**
   * Check if a projected graph exists
   */
  async projectedGraphExists(
    mcpContext: EnrichedRequestHandlerExtra,
    projectionName: string,
  ): Promise<boolean> {
    const logger = this.createOperationLogger(mcpContext, 'projectedGraphExists', {
      projectionName,
    });

    try {
      const { graphs } = await this.listProjectedGraphs(mcpContext);
      const safeProjectionName = projectionName.replace(/[^a-zA-Z0-9_]/g, '_');
      const exists = graphs.includes(safeProjectionName);

      logger.debug(`Projected graph ${safeProjectionName} exists: ${exists}`);
      return exists;
    } catch (error: any) {
      logger.warn(`Could not check if projected graph exists:`, {
        error: error.toString(),
      });
      return false;
    }
  }
}
