# Priority Enhancements for Core Memory Optimization Agent

## 🎯 **Focus Areas: Snapshot System & MCP Sampling**

Based on practical needs and current AI capabilities, these two enhancements provide the highest value:

1. **Snapshot/Rollback System** - Critical safety feature for production use
2. **MCP Sampling Support** - Dynamic prompt delivery for better optimization

## 📸 **1. Snapshot/Rollback System**

### **Why This is Critical:**
- **Production Safety**: Users need confidence they can undo optimizations
- **Risk Mitigation**: Enables more aggressive optimization strategies safely
- **Compliance**: Audit trails and change management requirements
- **User Trust**: Essential for adoption in critical systems

### **Implementation Architecture:**

```typescript
// src/services/snapshot.service.ts
export class SnapshotService {
  constructor(private kuzuClient: KuzuDBClient) {}

  async createSnapshot(
    repository: string,
    branch: string,
    description: string = 'Pre-optimization snapshot'
  ): Promise<SnapshotResult> {
    const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Export all entities and relationships for this repo/branch
    const entities = await this.exportAllEntities(repository, branch);
    const relationships = await this.exportAllRelationships(repository, branch);
    
    // Store snapshot in dedicated table
    await this.storeSnapshot(snapshotId, {
      repository,
      branch,
      description,
      created: new Date().toISOString(),
      entities,
      relationships,
      metadata: await this.getRepositoryMetadata(repository, branch)
    });

    return { snapshotId, entitiesCount: entities.length, relationshipsCount: relationships.length };
  }

  async rollbackToSnapshot(snapshotId: string): Promise<RollbackResult> {
    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    // Begin transaction for atomic rollback
    await this.kuzuClient.beginTransaction();
    
    try {
      // Clear current state for repo/branch
      await this.clearRepositoryState(snapshot.repository, snapshot.branch);
      
      // Restore entities
      for (const entity of snapshot.entities) {
        await this.restoreEntity(entity);
      }
      
      // Restore relationships
      for (const relationship of snapshot.relationships) {
        await this.restoreRelationship(relationship);
      }
      
      await this.kuzuClient.commitTransaction();
      
      return {
        success: true,
        restoredEntities: snapshot.entities.length,
        restoredRelationships: snapshot.relationships.length,
        rollbackTime: new Date().toISOString()
      };
    } catch (error) {
      await this.kuzuClient.rollbackTransaction();
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  async listSnapshots(repository: string, branch?: string): Promise<SnapshotInfo[]> {
    const query = `
      MATCH (s:Snapshot)
      WHERE s.repository = $repository 
        ${branch ? 'AND s.branch = $branch' : ''}
      RETURN s.id, s.description, s.created, s.entitiesCount, s.relationshipsCount
      ORDER BY s.created DESC
    `;
    
    return await this.kuzuClient.executeQuery(query, { repository, branch });
  }

  async validateSnapshot(snapshotId: string): Promise<ValidationResult> {
    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) return { valid: false, reason: 'Snapshot not found' };
    
    // Validate snapshot integrity
    const entityIntegrity = await this.validateEntityIntegrity(snapshot.entities);
    const relationshipIntegrity = await this.validateRelationshipIntegrity(snapshot.relationships);
    
    return {
      valid: entityIntegrity.valid && relationshipIntegrity.valid,
      entityCount: snapshot.entities.length,
      relationshipCount: snapshot.relationships.length,
      issues: [...entityIntegrity.issues, ...relationshipIntegrity.issues]
    };
  }
}
```

### **Integration with Core Memory Optimization Agent:**

```typescript
// Update memory-optimization-agent.ts
export class MemoryOptimizationAgent {
  constructor(
    private memoryService: MemoryService,
    private snapshotService: SnapshotService, // ← Add snapshot service
    private config: MemoryOptimizationConfig = { llmProvider: 'openai' }
  ) {}

  async executeOptimizationPlan(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    plan: OptimizationPlan,
    options: {
      dryRun?: boolean;
      requireConfirmation?: boolean;
      createSnapshot?: boolean; // ← New option
    } = {}
  ): Promise<OptimizationResult> {
    
    let snapshotId: string | undefined;
    
    // Create snapshot before optimization (if not dry run)
    if (!options.dryRun && options.createSnapshot !== false) {
      const snapshotResult = await this.snapshotService.createSnapshot(
        repository,
        branch,
        `Pre-optimization snapshot for plan ${plan.id}`
      );
      snapshotId = snapshotResult.snapshotId;
      
      this.agentLogger.info('Created pre-optimization snapshot', {
        snapshotId,
        entitiesCount: snapshotResult.entitiesCount
      });
    }

    try {
      // Execute optimization plan...
      const result = await this.executeOptimizationActions(plan, options);
      
      return {
        ...result,
        snapshotId, // ← Include snapshot ID for rollback
      };
    } catch (error) {
      // If optimization fails and we have a snapshot, offer rollback
      if (snapshotId) {
        this.agentLogger.error('Optimization failed, snapshot available for rollback', {
          snapshotId,
          error: String(error)
        });
      }
      throw error;
    }
  }
}
```

## 🎯 **2. MCP Sampling Support**

### **Why This is Valuable:**
- **Dynamic Prompts**: Deliver context-specific prompts based on current memory state
- **Adaptive Optimization**: Adjust strategies based on real-time analysis
- **Personalization**: Customize optimization approaches for different project types
- **Continuous Improvement**: Evolve prompts based on optimization outcomes

### **Implementation Architecture:**

```typescript
// src/agents/memory-optimizer/mcp-sampling-manager.ts
export class MCPSamplingManager {
  constructor(
    private memoryService: MemoryService,
    private promptManager: PromptManager
  ) {}

  async sampleMemoryContext(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string,
    samplingStrategy: 'representative' | 'problematic' | 'recent' = 'representative'
  ): Promise<MemorySample> {
    
    switch (samplingStrategy) {
      case 'representative':
        return await this.sampleRepresentativeEntities(repository, branch);
      case 'problematic':
        return await this.sampleProblematicEntities(repository, branch);
      case 'recent':
        return await this.sampleRecentEntities(repository, branch);
    }
  }

  async buildContextAwarePrompt(
    role: AgentRole,
    strategy: OptimizationStrategy,
    memorySample: MemorySample
  ): Promise<string> {
    
    // Analyze the memory sample to determine context
    const contextAnalysis = await this.analyzeMemoryContext(memorySample);
    
    // Select appropriate prompt template based on context
    const promptTemplate = await this.selectPromptTemplate(role, strategy, contextAnalysis);
    
    // Inject sample-specific context into prompt
    return await this.interpolatePromptWithSample(promptTemplate, memorySample, contextAnalysis);
  }

  private async sampleRepresentativeEntities(
    repository: string,
    branch: string,
    sampleSize: number = 20
  ): Promise<MemorySample> {
    
    // Get representative sample across all entity types
    const query = `
      MATCH (n)
      WHERE n.repository = $repository AND n.branch = $branch
      WITH n, labels(n) AS nodeLabels, rand() AS r
      ORDER BY r
      LIMIT $sampleSize
      RETURN n.id, n.name, n.created, n.description, nodeLabels
    `;
    
    const entities = await this.memoryService.getKuzuClient().executeQuery(query, {
      repository,
      branch,
      sampleSize
    });

    // Get relationships for sampled entities
    const relationships = await this.getSampleRelationships(entities.map(e => e.id));
    
    return {
      entities,
      relationships,
      samplingStrategy: 'representative',
      sampleSize: entities.length,
      timestamp: new Date().toISOString()
    };
  }

  private async analyzeMemoryContext(sample: MemorySample): Promise<ContextAnalysis> {
    // Analyze the sample to understand memory characteristics
    const entityTypes = this.categorizeEntities(sample.entities);
    const relationshipDensity = this.calculateRelationshipDensity(sample);
    const ageDistribution = this.analyzeAgeDistribution(sample.entities);
    const complexityScore = this.calculateComplexityScore(sample);
    
    return {
      entityTypes,
      relationshipDensity,
      ageDistribution,
      complexityScore,
      recommendedStrategy: this.recommendStrategy(entityTypes, relationshipDensity, complexityScore),
      focusAreas: this.identifyFocusAreas(sample)
    };
  }
}
```

### **Integration with Prompt Manager:**

```typescript
// Update prompt-manager.ts
export class PromptManager {
  constructor(
    private promptsDir: string = './src/prompts',
    private samplingManager?: MCPSamplingManager // ← Add sampling support
  ) {}

  async buildContextAwareSystemPrompt(
    role: AgentRole,
    strategy: OptimizationStrategy,
    memoryContext: MemoryContext,
    enableSampling: boolean = false
  ): Promise<string> {
    
    if (enableSampling && this.samplingManager) {
      // Use MCP sampling for dynamic prompt generation
      const memorySample = await this.samplingManager.sampleMemoryContext(
        memoryContext.repository,
        memoryContext.branch,
        'representative'
      );
      
      return await this.samplingManager.buildContextAwarePrompt(role, strategy, memorySample);
    } else {
      // Use standard prompt generation
      return await this.buildSystemPrompt(role, strategy);
    }
  }
}
```

## 🚀 **Implementation Timeline**

### **Phase 1: Snapshot System (2-3 weeks)**
1. **Week 1**: Implement SnapshotService with basic create/restore functionality
2. **Week 2**: Add snapshot validation, listing, and metadata management
3. **Week 3**: Integrate with Core Memory Optimization Agent and add MCP tool support

### **Phase 2: MCP Sampling (2-3 weeks)**
1. **Week 1**: Implement MCPSamplingManager with basic sampling strategies
2. **Week 2**: Add context analysis and dynamic prompt generation
3. **Week 3**: Integrate with PromptManager and add configuration options

## 🎯 **Benefits of This Approach**

### **Snapshot System Benefits:**
- **Production Ready**: Safe to use in critical environments
- **User Confidence**: Easy rollback reduces optimization anxiety
- **Audit Compliance**: Full change tracking and rollback capabilities
- **Risk Mitigation**: Enables more aggressive optimization strategies

### **MCP Sampling Benefits:**
- **Adaptive Intelligence**: Prompts adapt to actual memory state
- **Better Optimization**: Context-aware strategies for different project types
- **Continuous Learning**: Prompts improve based on real memory patterns
- **Personalization**: Different optimization approaches for different contexts

This focused approach leverages the existing high-reasoning AI models while adding the essential safety and adaptability features needed for production use!
