import { MemoryService } from '../../services/memory.service';
import { KuzuDBClient } from '../../db/kuzu';
import { logger } from '../../utils/logger';
import type { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';
import type { OptimizationStrategy } from './prompt-manager';

export interface MemorySample {
  entities: any[];
  relationships: any[];
  samplingStrategy: SamplingStrategy;
  sampleSize: number;
  timestamp: string;
  repository: string;
  branch: string;
  metadata: {
    totalEntities: number;
    totalRelationships: number;
    samplingRatio: number;
  };
}

export interface ContextAnalysis {
  entityTypes: Record<string, number>;
  relationshipDensity: number;
  ageDistribution: {
    recent: number; // < 30 days
    medium: number; // 30-90 days
    old: number; // > 90 days
  };
  complexityScore: number;
  recommendedStrategy: OptimizationStrategy;
  focusAreas: string[];
  projectCharacteristics: {
    maturity: 'new' | 'developing' | 'mature' | 'legacy';
    activity: 'high' | 'medium' | 'low';
    complexity: 'simple' | 'moderate' | 'complex';
  };
}

export type SamplingStrategy = 'representative' | 'problematic' | 'recent' | 'diverse';

/**
 * MCP Sampling Manager for Core Memory Optimization Agent
 *
 * Provides intelligent sampling of memory graphs to enable context-aware
 * prompt generation and adaptive optimization strategies.
 */
export class MCPSamplingManager {
  private samplingLogger = logger.child({ service: 'MCPSamplingManager' });

  constructor(private memoryService: MemoryService) {
    this.samplingLogger.info('MCPSamplingManager initialized');
  }

  /**
   * Sample memory context based on strategy
   */
  async sampleMemoryContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    samplingStrategy: SamplingStrategy = 'representative',
    sampleSize: number = 20,
  ): Promise<MemorySample> {
    const samplingLogger = this.samplingLogger.child({
      operation: 'sampleMemoryContext',
      repository,
      branch,
      samplingStrategy,
      sampleSize,
    });

    try {
      samplingLogger.info('Starting memory context sampling');

      // Get KuzuDB client
      const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

      // Get total counts for metadata
      const totalCounts = await this.getTotalCounts(kuzuClient, repository, branch);

      // Sample based on strategy
      let entities: any[];
      let relationships: any[];

      switch (samplingStrategy) {
        case 'representative':
          ({ entities, relationships } = await this.sampleRepresentativeEntities(
            kuzuClient,
            repository,
            branch,
            sampleSize,
          ));
          break;
        case 'problematic':
          ({ entities, relationships } = await this.sampleProblematicEntities(
            kuzuClient,
            repository,
            branch,
            sampleSize,
          ));
          break;
        case 'recent':
          ({ entities, relationships } = await this.sampleRecentEntities(
            kuzuClient,
            repository,
            branch,
            sampleSize,
          ));
          break;
        case 'diverse':
          ({ entities, relationships } = await this.sampleDiverseEntities(
            kuzuClient,
            repository,
            branch,
            sampleSize,
          ));
          break;
        default:
          throw new Error(`Unsupported sampling strategy: ${samplingStrategy}`);
      }

      const sample: MemorySample = {
        entities,
        relationships,
        samplingStrategy,
        sampleSize: entities.length,
        timestamp: new Date().toISOString(),
        repository,
        branch,
        metadata: {
          totalEntities: totalCounts.entities,
          totalRelationships: totalCounts.relationships,
          samplingRatio: entities.length / totalCounts.entities,
        },
      };

      samplingLogger.info('Memory context sampling completed', {
        entitiesSampled: entities.length,
        relationshipsSampled: relationships.length,
        samplingRatio: sample.metadata.samplingRatio,
      });

      return sample;
    } catch (error) {
      samplingLogger.error('Memory context sampling failed:', error);
      throw new Error(`Memory context sampling failed: ${error}`);
    }
  }

  /**
   * Analyze memory context to understand characteristics
   */
  async analyzeMemoryContext(sample: MemorySample): Promise<ContextAnalysis> {
    const analysisLogger = this.samplingLogger.child({
      operation: 'analyzeMemoryContext',
      repository: sample.repository,
      branch: sample.branch,
    });

    try {
      analysisLogger.info('Starting memory context analysis');

      // Analyze entity types
      const entityTypes = this.categorizeEntities(sample.entities);

      // Calculate relationship density
      const relationshipDensity = this.calculateRelationshipDensity(sample);

      // Analyze age distribution
      const ageDistribution = this.analyzeAgeDistribution(sample.entities);

      // Calculate complexity score
      const complexityScore = this.calculateComplexityScore(sample);

      // Determine project characteristics
      const projectCharacteristics = this.analyzeProjectCharacteristics(
        sample,
        entityTypes,
        ageDistribution,
        complexityScore,
      );

      // Recommend strategy based on analysis
      const recommendedStrategy = this.recommendStrategy(
        entityTypes,
        relationshipDensity,
        complexityScore,
        projectCharacteristics,
      );

      // Identify focus areas
      const focusAreas = this.identifyFocusAreas(
        sample,
        entityTypes,
        ageDistribution,
        projectCharacteristics,
      );

      const analysis: ContextAnalysis = {
        entityTypes,
        relationshipDensity,
        ageDistribution,
        complexityScore,
        recommendedStrategy,
        focusAreas,
        projectCharacteristics,
      };

      analysisLogger.info('Memory context analysis completed', {
        recommendedStrategy,
        complexityScore,
        focusAreas: focusAreas.length,
      });

      return analysis;
    } catch (error) {
      analysisLogger.error('Memory context analysis failed:', error);
      throw new Error(`Memory context analysis failed: ${error}`);
    }
  }

  /**
   * Build context-aware prompt based on memory sample analysis
   */
  async buildContextAwarePrompt(
    role: 'analyzer' | 'optimizer' | 'safety',
    strategy: OptimizationStrategy,
    memorySample: MemorySample,
    basePrompt: string,
  ): Promise<string> {
    try {
      // Analyze the memory sample
      const contextAnalysis = await this.analyzeMemoryContext(memorySample);

      // Build context-specific additions to the prompt
      const contextualPrompt = this.buildContextualPromptAdditions(
        role,
        strategy,
        memorySample,
        contextAnalysis,
      );

      // Combine base prompt with contextual additions
      const enhancedPrompt = [
        basePrompt,
        '',
        '=== MEMORY CONTEXT ANALYSIS ===',
        contextualPrompt,
        '',
        '=== ADAPTIVE INSTRUCTIONS ===',
        this.buildAdaptiveInstructions(role, contextAnalysis),
      ].join('\n');

      return enhancedPrompt;
    } catch (error) {
      this.samplingLogger.error('Failed to build context-aware prompt:', error);
      // Fallback to base prompt if context analysis fails
      return basePrompt;
    }
  }

  /**
   * Get total entity and relationship counts
   */
  private async getTotalCounts(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
  ): Promise<{ entities: number; relationships: number }> {
    try {
      // Count entities - KuzuDB compatible query
      const entityQuery = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.id IS NOT NULL
        RETURN COUNT(n) AS entityCount
      `;
      const entityResult = await kuzuClient.executeQuery(entityQuery, { repository, branch });
      const entities = entityResult[0]?.entityCount || 0;

      // Count relationships
      const relationshipQuery = `
        MATCH (a)-[r]->(b)
        WHERE a.repository = $repository AND a.branch = $branch
          AND b.repository = $repository AND b.branch = $branch
        RETURN COUNT(r) AS relationshipCount
      `;
      const relationshipResult = await kuzuClient.executeQuery(relationshipQuery, {
        repository,
        branch,
      });
      const relationships = relationshipResult[0]?.relationshipCount || 0;

      return { entities, relationships };
    } catch (error) {
      this.samplingLogger.warn('Failed to get total counts:', error);
      return { entities: 0, relationships: 0 };
    }
  }

  /**
   * Sample representative entities across all types
   */
  private async sampleRepresentativeEntities(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
    sampleSize: number,
  ): Promise<{ entities: any[]; relationships: any[] }> {
    try {
      // Get stratified sample across entity types
      // KuzuDB compatible query - simplified representative sampling
      const query = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.id IS NOT NULL
        WITH n
        ORDER BY n.id
        LIMIT $sampleSize
        RETURN n.id, n.name, n.created, n.description, n.status
      `;

      const entities = await kuzuClient.executeQuery(query, { repository, branch, sampleSize });

      // Get relationships for sampled entities
      const relationships = await this.getSampleRelationships(
        kuzuClient,
        entities.map((e: any) => e.id),
        repository,
        branch,
      );

      return { entities, relationships };
    } catch (error) {
      this.samplingLogger.error('Failed to sample representative entities:', error);
      return { entities: [], relationships: [] };
    }
  }

  /**
   * Sample problematic entities (old, disconnected, or potentially stale)
   */
  private async sampleProblematicEntities(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
    sampleSize: number,
  ): Promise<{ entities: any[]; relationships: any[] }> {
    try {
      // KuzuDB compatible query - simplified problematic entity detection
      const query = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.id IS NOT NULL
        OPTIONAL MATCH (n)-[r]-()
        WITH n, COUNT(r) AS relationshipCount
        WHERE relationshipCount = 0 OR n.status = 'deprecated'
        ORDER BY relationshipCount ASC
        LIMIT $sampleSize
        RETURN n.id, n.name, n.created, n.description, n.status, relationshipCount
      `;

      const entities = await kuzuClient.executeQuery(query, { repository, branch, sampleSize });

      const relationships = await this.getSampleRelationships(
        kuzuClient,
        entities.map((e: any) => e.id),
        repository,
        branch,
      );

      return { entities, relationships };
    } catch (error) {
      this.samplingLogger.error('Failed to sample problematic entities:', error);
      return { entities: [], relationships: [] };
    }
  }

  /**
   * Sample recent entities (created within last 30 days)
   */
  private async sampleRecentEntities(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
    sampleSize: number,
  ): Promise<{ entities: any[]; relationships: any[] }> {
    try {
      // KuzuDB compatible query - simplified recent entity detection
      const query = `
        MATCH (n)
        WHERE n.repository = $repository AND n.branch = $branch
          AND n.id IS NOT NULL
          AND n.created IS NOT NULL AND n.created <> '' AND n.created CONTAINS 'T'
        ORDER BY n.created DESC
        LIMIT $sampleSize
        RETURN n.id, n.name, n.created, n.description, n.status
      `;

      const entities = await kuzuClient.executeQuery(query, { repository, branch, sampleSize });

      const relationships = await this.getSampleRelationships(
        kuzuClient,
        entities.map((e: any) => e.id),
        repository,
        branch,
      );

      return { entities, relationships };
    } catch (error) {
      this.samplingLogger.error('Failed to sample recent entities:', error);
      return { entities: [], relationships: [] };
    }
  }

  /**
   * Sample diverse entities ensuring representation from all types
   */
  private async sampleDiverseEntities(
    kuzuClient: KuzuDBClient,
    repository: string,
    branch: string,
    sampleSize: number,
  ): Promise<{ entities: any[]; relationships: any[] }> {
    try {
      // Get sample from each entity type
      const entityTypes = ['Component', 'Decision', 'Rule', 'File', 'Context', 'Tag'];
      const perTypeSize = Math.max(1, Math.floor(sampleSize / entityTypes.length));

      let allEntities: any[] = [];

      for (const entityType of entityTypes) {
        // KuzuDB compatible query - simplified diverse sampling
        const query = `
          MATCH (n:${entityType})
          WHERE n.repository = $repository AND n.branch = $branch
          ORDER BY n.id
          LIMIT $perTypeSize
          RETURN n.id, n.name, n.created, n.description, n.status
        `;

        const typeEntities = await kuzuClient.executeQuery(query, {
          repository,
          branch,
          perTypeSize,
        });
        allEntities = allEntities.concat(typeEntities);
      }

      // Trim to exact sample size if needed
      if (allEntities.length > sampleSize) {
        allEntities = allEntities.slice(0, sampleSize);
      }

      const relationships = await this.getSampleRelationships(
        kuzuClient,
        allEntities.map((e: any) => e.id),
        repository,
        branch,
      );

      return { entities: allEntities, relationships };
    } catch (error) {
      this.samplingLogger.error('Failed to sample diverse entities:', error);
      return { entities: [], relationships: [] };
    }
  }

  /**
   * Get relationships for sampled entities
   */
  private async getSampleRelationships(
    kuzuClient: KuzuDBClient,
    entityIds: string[],
    repository: string,
    branch: string,
  ): Promise<any[]> {
    if (entityIds.length === 0) {
      return [];
    }

    try {
      // KuzuDB compatible query - simplified relationship sampling
      const query = `
        MATCH (a)-[r]->(b)
        WHERE a.repository = $repository AND a.branch = $branch
          AND b.repository = $repository AND b.branch = $branch
          AND (a.id IN $entityIds OR b.id IN $entityIds)
        RETURN a.id AS fromId, b.id AS toId, 'RELATIONSHIP' AS relationshipType
        LIMIT 100
      `;

      return await kuzuClient.executeQuery(query, { repository, branch, entityIds });
    } catch (error) {
      this.samplingLogger.warn('Failed to get sample relationships:', error);
      return [];
    }
  }

  /**
   * Categorize entities by type
   */
  private categorizeEntities(entities: any[]): Record<string, number> {
    const categories: Record<string, number> = {};

    for (const entity of entities) {
      const type = entity.nodeLabels?.[0] || 'Unknown';
      categories[type] = (categories[type] || 0) + 1;
    }

    return categories;
  }

  /**
   * Calculate relationship density (relationships per entity)
   */
  private calculateRelationshipDensity(sample: MemorySample): number {
    if (sample.entities.length === 0) {
      return 0;
    }
    return sample.relationships.length / sample.entities.length;
  }

  /**
   * Analyze age distribution of entities
   */
  private analyzeAgeDistribution(entities: any[]): ContextAnalysis['ageDistribution'] {
    const distribution = { recent: 0, medium: 0, old: 0 };
    const now = new Date();

    for (const entity of entities) {
      if (!entity.created || !entity.created.includes('T')) {
        distribution.old++; // Treat entities without dates as old
        continue;
      }

      try {
        const created = new Date(entity.created);
        const ageInDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

        if (ageInDays <= 30) {
          distribution.recent++;
        } else if (ageInDays <= 90) {
          distribution.medium++;
        } else {
          distribution.old++;
        }
      } catch {
        distribution.old++; // Treat invalid dates as old
      }
    }

    return distribution;
  }

  /**
   * Calculate complexity score based on various factors
   */
  private calculateComplexityScore(sample: MemorySample): number {
    let score = 0;

    // Entity diversity (more types = more complex)
    const entityTypes = this.categorizeEntities(sample.entities);
    score += Object.keys(entityTypes).length * 10;

    // Relationship density (more connections = more complex)
    const density = this.calculateRelationshipDensity(sample);
    score += density * 20;

    // Entity count (more entities = more complex)
    score += Math.min(sample.metadata.totalEntities / 10, 50);

    // Normalize to 0-100 scale
    return Math.min(Math.round(score), 100);
  }

  /**
   * Analyze project characteristics
   */
  private analyzeProjectCharacteristics(
    sample: MemorySample,
    entityTypes: Record<string, number>,
    ageDistribution: ContextAnalysis['ageDistribution'],
    complexityScore: number,
  ): ContextAnalysis['projectCharacteristics'] {
    // Determine maturity
    let maturity: 'new' | 'developing' | 'mature' | 'legacy';
    const totalEntities = sample.metadata.totalEntities;
    const recentRatio =
      ageDistribution.recent /
      (ageDistribution.recent + ageDistribution.medium + ageDistribution.old);

    if (totalEntities < 20) {
      maturity = 'new';
    } else if (totalEntities < 100 && recentRatio > 0.5) {
      maturity = 'developing';
    } else if (
      recentRatio < 0.1 &&
      ageDistribution.old > ageDistribution.recent + ageDistribution.medium
    ) {
      maturity = 'legacy';
    } else {
      maturity = 'mature';
    }

    // Determine activity level
    let activity: 'high' | 'medium' | 'low';
    if (recentRatio > 0.3) {
      activity = 'high';
    } else if (recentRatio > 0.1) {
      activity = 'medium';
    } else {
      activity = 'low';
    }

    // Determine complexity
    let complexity: 'simple' | 'moderate' | 'complex';
    if (complexityScore < 30) {
      complexity = 'simple';
    } else if (complexityScore < 70) {
      complexity = 'moderate';
    } else {
      complexity = 'complex';
    }

    return { maturity, activity, complexity };
  }

  /**
   * Recommend optimization strategy based on analysis
   */
  private recommendStrategy(
    entityTypes: Record<string, number>,
    relationshipDensity: number,
    complexityScore: number,
    projectCharacteristics: ContextAnalysis['projectCharacteristics'],
  ): OptimizationStrategy {
    // Conservative for new or high-activity projects
    if (projectCharacteristics.maturity === 'new' || projectCharacteristics.activity === 'high') {
      return 'conservative';
    }

    // Aggressive for legacy projects with low activity
    if (projectCharacteristics.maturity === 'legacy' && projectCharacteristics.activity === 'low') {
      return 'aggressive';
    }

    // Balanced for most other cases
    return 'balanced';
  }

  /**
   * Identify focus areas based on analysis
   */
  private identifyFocusAreas(
    sample: MemorySample,
    entityTypes: Record<string, number>,
    ageDistribution: ContextAnalysis['ageDistribution'],
    projectCharacteristics: ContextAnalysis['projectCharacteristics'],
  ): string[] {
    const focusAreas: string[] = [];

    // Stale detection for projects with old entities
    if (ageDistribution.old > ageDistribution.recent + ageDistribution.medium) {
      focusAreas.push('stale-detection');
    }

    // Redundancy removal for complex projects
    if (projectCharacteristics.complexity === 'complex') {
      focusAreas.push('redundancy-removal');
    }

    // Relationship cleanup for high-density graphs
    const density = this.calculateRelationshipDensity(sample);
    if (density > 3) {
      focusAreas.push('relationship-cleanup');
    }

    // Tag consolidation if many tags
    if (entityTypes.Tag && entityTypes.Tag > 10) {
      focusAreas.push('tag-consolidation');
    }

    // Orphan removal for low-activity projects
    if (projectCharacteristics.activity === 'low') {
      focusAreas.push('orphan-removal');
    }

    // Default focus if none identified
    if (focusAreas.length === 0) {
      focusAreas.push('general-optimization');
    }

    return focusAreas;
  }

  /**
   * Build contextual prompt additions
   */
  private buildContextualPromptAdditions(
    role: 'analyzer' | 'optimizer' | 'safety',
    strategy: OptimizationStrategy,
    memorySample: MemorySample,
    contextAnalysis: ContextAnalysis,
  ): string {
    const additions = [
      `Project Characteristics: ${contextAnalysis.projectCharacteristics.maturity} project with ${contextAnalysis.projectCharacteristics.activity} activity`,
      `Complexity Score: ${contextAnalysis.complexityScore}/100 (${contextAnalysis.projectCharacteristics.complexity})`,
      `Entity Distribution: ${Object.entries(contextAnalysis.entityTypes)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ')}`,
      `Age Distribution: Recent: ${contextAnalysis.ageDistribution.recent}, Medium: ${contextAnalysis.ageDistribution.medium}, Old: ${contextAnalysis.ageDistribution.old}`,
      `Relationship Density: ${contextAnalysis.relationshipDensity.toFixed(2)} relationships per entity`,
      `Recommended Strategy: ${contextAnalysis.recommendedStrategy}`,
      `Focus Areas: ${contextAnalysis.focusAreas.join(', ')}`,
    ];

    return additions.join('\n');
  }

  /**
   * Build adaptive instructions based on context
   */
  private buildAdaptiveInstructions(
    role: 'analyzer' | 'optimizer' | 'safety',
    contextAnalysis: ContextAnalysis,
  ): string {
    const instructions: string[] = [];

    // Role-specific adaptive instructions
    if (role === 'analyzer') {
      if (contextAnalysis.projectCharacteristics.maturity === 'legacy') {
        instructions.push(
          '- Focus heavily on identifying truly obsolete entities from the legacy codebase',
        );
        instructions.push('- Look for deprecated patterns and outdated architectural decisions');
      }

      if (contextAnalysis.projectCharacteristics.activity === 'high') {
        instructions.push('- Be extra cautious with recent entities as they may be actively used');
        instructions.push('- Prioritize obvious duplicates over potentially active entities');
      }
    }

    if (role === 'optimizer') {
      if (contextAnalysis.complexityScore > 70) {
        instructions.push('- Break down complex optimization into smaller, safer steps');
        instructions.push('- Prioritize relationship cleanup to reduce complexity');
      }

      if (contextAnalysis.projectCharacteristics.maturity === 'new') {
        instructions.push('- Use minimal optimization to avoid disrupting active development');
        instructions.push('- Focus on obvious cleanup rather than structural changes');
      }
    }

    if (role === 'safety') {
      if (contextAnalysis.relationshipDensity > 3) {
        instructions.push(
          '- Pay extra attention to dependency chains in this highly connected graph',
        );
        instructions.push("- Validate that relationship cleanup won't break critical connections");
      }
    }

    // General adaptive instructions
    instructions.push(
      `- Adapt your approach for a ${contextAnalysis.projectCharacteristics.maturity} project with ${contextAnalysis.projectCharacteristics.complexity} complexity`,
    );
    instructions.push(`- Focus on: ${contextAnalysis.focusAreas.join(', ')}`);

    return instructions.join('\n');
  }
}
