import { MemoryService } from '../../services/memory.service.js';
import { KuzuDBClient } from '../../db/kuzu.js';
import { logger } from '../../utils/logger.js';
import type { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom.js';
import type { MemoryContext } from '../../schemas/optimization/types.js';

/**
 * Builds comprehensive memory context for optimization analysis
 * Leverages existing KuzuMem-MCP infrastructure for data gathering
 */
export class MemoryContextBuilder {
  constructor(private memoryService: MemoryService) {}

  /**
   * Build complete memory context for a repository/branch
   */
  async buildMemoryContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string = 'main',
  ): Promise<MemoryContext> {
    const contextLogger = logger.child({
      operation: 'buildMemoryContext',
      repository,
      branch,
    });

    try {
      contextLogger.info('Building memory context for optimization analysis');

      // Get KuzuDB client using existing infrastructure
      const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

      // Gather entity counts using existing methods
      const entityCounts = await this.getEntityCounts(
        mcpContext,
        clientProjectRoot,
        repository,
        branch,
      );

      // Get relationship count
      const relationshipCount = await this.getRelationshipCount(kuzuClient, repository, branch);

      // Calculate average entity age
      const averageEntityAge = await this.calculateAverageEntityAge(kuzuClient, repository, branch);

      // Get last optimization timestamp (if any)
      const lastOptimization = await this.getLastOptimizationTimestamp(
        kuzuClient,
        repository,
        branch,
      );

      const totalEntities = Object.values(entityCounts).reduce((sum, count) => sum + count, 0);

      const context: MemoryContext = {
        repository,
        branch,
        entityCounts,
        totalEntities,
        relationshipCount,
        averageEntityAge,
        lastOptimization,
      };

      contextLogger.info('Memory context built successfully', {
        totalEntities,
        relationshipCount,
        averageEntityAge,
      });

      return context;
    } catch (error) {
      contextLogger.error('Failed to build memory context:', error);
      throw new Error(`Failed to build memory context: ${error}`);
    }
  }

  /**
   * Get entity counts for all types using existing MemoryService methods
   */
  private async getEntityCounts(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
  ): Promise<MemoryContext['entityCounts']> {
    const entityTypes = ['Component', 'Decision', 'Rule', 'File', 'Context', 'Tag'];
    const counts: MemoryContext['entityCounts'] = {
      components: 0,
      decisions: 0,
      rules: 0,
      files: 0,
      contexts: 0,
      tags: 0,
    };

    // Use existing countNodesByLabel method
    for (const entityType of entityTypes) {
      try {
        const result = await this.memoryService.countNodesByLabel(
          mcpContext,
          clientProjectRoot,
          repository,
          branch,
          entityType,
        );

        const key = (entityType.toLowerCase() + 's') as keyof typeof counts;
        counts[key] = result.count;
      } catch (error) {
        logger.warn(`Failed to count ${entityType} entities:`, error);
        // Continue with 0 count for this entity type
      }
    }

    return counts;
  }

  /**
   * Get total relationship count using direct KuzuDB query
   */
  private async getRelationshipCount(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
  ): Promise<number> {
    try {
      const query = `
        MATCH (a)-[r]->(b)
        WHERE a.repository = $repository AND a.branch = $branch
          AND b.repository = $repository AND b.branch = $branch
        RETURN COUNT(r) AS relationshipCount
      `;

      const result = await kuzuClient.executeQuery(query, { repository, branch });
      return result[0]?.relationshipCount || 0;
    } catch (error) {
      logger.warn('Failed to count relationships:', error);
      return 0;
    }
  }

  /**
   * Calculate average entity age in days
   */
  private async calculateAverageEntityAge(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
  ): Promise<number | undefined> {
    try {
      const query = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.created IS NOT NULL
        WITH n.created AS created
        WHERE created <> ''
        RETURN AVG(
          CASE 
            WHEN created CONTAINS 'T' THEN 
              (datetime() - datetime(created)) / 86400000000  // Convert microseconds to days
            ELSE NULL
          END
        ) AS avgAge
      `;

      const result = await kuzuClient.executeQuery(query, { repository, branch });
      const avgAge = result[0]?.avgAge;

      return avgAge ? Math.round(Number(avgAge)) : undefined;
    } catch (error) {
      logger.warn('Failed to calculate average entity age:', error);
      return undefined;
    }
  }

  /**
   * Get timestamp of last optimization (from context or metadata)
   */
  private async getLastOptimizationTimestamp(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
  ): Promise<string | undefined> {
    try {
      // Look for optimization context entries
      const query = `
        MATCH (c:Context)
        WHERE c.repository = $repository AND c.branch = $branch
          AND (c.summary CONTAINS 'optimization' OR c.summary CONTAINS 'cleanup')
        RETURN c.created
        ORDER BY c.created DESC
        LIMIT 1
      `;

      const result = await kuzuClient.executeQuery(query, { repository, branch });
      return result[0]?.created || undefined;
    } catch (error) {
      logger.warn('Failed to get last optimization timestamp:', error);
      return undefined;
    }
  }

  /**
   * Get detailed entity information for analysis
   */
  async getDetailedEntityInfo(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    entityType: string,
    limit: number = 100,
  ): Promise<any[]> {
    try {
      const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

      const query = `
        MATCH (n:${entityType})
        WHERE n.repository = $repository AND n.branch = $branch
        RETURN n.id, n.name, n.created, n.status, n.description
        ORDER BY n.created DESC
        LIMIT $limit
      `;

      return await kuzuClient.executeQuery(query, { repository, branch, limit });
    } catch (error) {
      logger.warn(`Failed to get detailed ${entityType} info:`, error);
      return [];
    }
  }

  /**
   * Get relationship summary for analysis
   */
  async getRelationshipSummary(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
  ): Promise<any[]> {
    try {
      const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

      const query = `
        MATCH (a)-[r]->(b)
        WHERE a.repository = $repository AND a.branch = $branch
          AND b.repository = $repository AND b.branch = $branch
        RETURN type(r) AS relationshipType, COUNT(r) AS count
        ORDER BY count DESC
      `;

      return await kuzuClient.executeQuery(query, { repository, branch });
    } catch (error) {
      logger.warn('Failed to get relationship summary:', error);
      return [];
    }
  }

  /**
   * Get stale entity candidates based on age and usage patterns
   */
  async getStaleEntityCandidates(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    staleDays: number = 90,
  ): Promise<any[]> {
    try {
      const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

      const query = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.created IS NOT NULL
          AND n.created <> ''
          AND n.created CONTAINS 'T'
        WITH n, (datetime() - datetime(n.created)) / 86400000000 AS ageInDays
        WHERE ageInDays > $staleDays
        OPTIONAL MATCH (n)-[r]-()
        RETURN n.id, n.name, labels(n) AS nodeLabels, ageInDays, COUNT(r) AS relationshipCount
        ORDER BY ageInDays DESC, relationshipCount ASC
        LIMIT 50
      `;

      return await kuzuClient.executeQuery(query, { repository, branch, staleDays });
    } catch (error) {
      logger.warn('Failed to get stale entity candidates:', error);
      return [];
    }
  }
}
