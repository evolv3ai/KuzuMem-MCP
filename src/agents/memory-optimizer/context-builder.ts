import { KuzuDBClient } from '../../db/kuzu';
import type { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import type { MemoryContext } from '../../schemas/optimization/types';
import { MemoryService } from '../../services/memory.service';
import { logger } from '../../utils/logger';

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
        if (!this.memoryService.services) {
          throw new Error('ServiceRegistry not initialized in MemoryService');
        }
        const result = await this.memoryService.services.graphQuery.countNodesByLabel(
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
      // KuzuDB compatible query - get creation timestamps of all entities
      const query = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.created_at IS NOT NULL AND n.created_at <> ''
          AND n.created_at CONTAINS 'T'
        RETURN n.created_at AS createdAt
      `;

      const result = await kuzuClient.executeQuery(query, { repository, branch });

      if (!result || result.length === 0) {
        return undefined;
      }

      // Calculate age in days for each entity and compute average
      const currentTime = new Date().getTime();
      let totalAgeInDays = 0;
      let validEntityCount = 0;

      for (const row of result) {
        try {
          const createdAt = new Date(row.createdAt);
          if (!isNaN(createdAt.getTime())) {
            const ageInMs = currentTime - createdAt.getTime();
            const ageInDays = ageInMs / (1000 * 60 * 60 * 24); // Convert ms to days
            totalAgeInDays += ageInDays;
            validEntityCount++;
          }
        } catch (parseError) {
          // Skip entities with invalid timestamps
          continue;
        }
      }

      // Return average age in days, or undefined if no valid entities found
      return validEntityCount > 0 ? totalAgeInDays / validEntityCount : undefined;
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
        RETURN c.created_at
        ORDER BY c.created_at DESC
        LIMIT 1
      `;

      const result = await kuzuClient.executeQuery(query, { repository, branch });
      return result[0]?.created_at || undefined;
    } catch (error) {
      logger.warn('Failed to get last optimization timestamp:', error);
      return undefined;
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

      // KuzuDB compatible query - simplified stale detection
      const query = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.created_at IS NOT NULL
          AND n.created_at <> ''
          AND n.created_at CONTAINS 'T'
        OPTIONAL MATCH (n)-[r]-()
        WITH n, COUNT(r) AS relationshipCount
        WHERE relationshipCount = 0 OR n.status = 'deprecated'
        RETURN n.id, n.name, n.created_at, relationshipCount
        ORDER BY relationshipCount ASC
        LIMIT 50
      `;

      return await kuzuClient.executeQuery(query, { repository, branch, staleDays });
    } catch (error) {
      logger.warn('Failed to get stale entity candidates:', error);
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

      // KuzuDB compatible query - simplified relationship summary
      const query = `
        MATCH (a)-[r]->(b)
        WHERE a.repository = $repository AND a.branch = $branch
          AND b.repository = $repository AND b.branch = $branch
        RETURN 'RELATIONSHIP' AS relationshipType, COUNT(r) AS count
        ORDER BY count DESC
      `;

      return await kuzuClient.executeQuery(query, { repository, branch });
    } catch (error) {
      logger.warn('Failed to get relationship summary:', error);
      return [];
    }
  }
}
