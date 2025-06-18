# Dynamic Memory Management Agent

## 🧠 Overview

This document outlines a revolutionary approach to autonomous memory management in KuzuMem-MCP using the new MCP sampling feature. The goal is to create an intelligent agent that can automatically handle deletion, pruning, and optimization of the memory graph store.

## 🎯 Core Concept

Using MCP's sampling feature to create an autonomous memory management agent that:
- Analyzes memory graph patterns and relationships
- Makes intelligent decisions about what to prune
- Uses sampling to explore multiple optimization strategies
- Executes safe, context-aware cleanup operations

## 🚀 Why This Approach Is Powerful

### Perfect Use Case for Sampling
- **Autonomous Decision Making**: Agent analyzes memory graph and makes informed decisions
- **Context-Aware**: Understands relationships, dependencies, and usage patterns
- **Iterative Refinement**: Samples multiple strategies and picks the best approach
- **Safety Through Intelligence**: Much smarter than rule-based pruning

### Memory Graph Optimization Challenges This Solves
1. **Stale Data Detection**: Identifying outdated components, decisions, or files
2. **Orphaned Relationships**: Finding broken or meaningless connections
3. **Redundancy Elimination**: Detecting duplicate or near-duplicate entities
4. **Dependency Optimization**: Simplifying overly complex dependency chains
5. **Storage Efficiency**: Balancing memory usage with information value

## 🎯 Implementation Strategy

### Phase 1: Memory Analysis Agent
```typescript
// New tool: memory-optimizer
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-repo",
  "branch": "main",
  "strategy": "conservative", // conservative, balanced, aggressive
  "focus": ["stale-detection", "redundancy", "orphaned-relationships"]
}
```

### Phase 2: Sampling-Driven Decision Making
The agent uses sampling to:
1. **Generate multiple optimization strategies**
2. **Evaluate each strategy's impact**
3. **Select the safest, most effective approach**
4. **Present recommendations with confidence scores**

### Phase 3: Autonomous Execution
```typescript
{
  "tool": "memory-optimizer", 
  "operation": "optimize",
  "repository": "my-repo",
  "autoApprove": false, // Start with human approval
  "dryRun": true,
  "maxDeletions": 50,
  "preserveCategories": ["critical-decisions", "active-components"]
}
```

## 🔍 Agent Capabilities

### 1. Intelligent Stale Detection
- Analyze component usage patterns
- Identify decisions that are no longer relevant
- Detect files that haven't been referenced in months
- Consider project lifecycle stages

### 2. Relationship Graph Optimization
- Find circular dependencies that can be simplified
- Identify redundant relationship paths
- Detect orphaned nodes with no meaningful connections
- Optimize tag usage and categorization

### 3. Context-Aware Pruning
- Understand project phases (development vs maintenance)
- Preserve historically significant decisions
- Maintain architectural knowledge while removing implementation details
- Balance between memory efficiency and knowledge retention

### 4. Predictive Analysis
- Predict which entities are likely to become stale
- Suggest proactive archiving strategies
- Identify patterns in memory growth
- Recommend optimal cleanup schedules

## 🛠 Technical Architecture

### **Leveraging Existing KuzuMem-MCP Infrastructure** ✅

**EXCELLENT NEWS**: KuzuMem-MCP already provides the perfect foundation for dynamic memory management:

1. **✅ Direct KuzuDB Access** - `MemoryService.getKuzuClient()` provides direct database access
2. **✅ Repository Isolation** - Each repo/branch has isolated memory space
3. **✅ Graph Analysis Tools** - PageRank, K-Core, Louvain already implemented
4. **✅ Entity Management** - Components, decisions, rules, files, contexts, tags
5. **✅ Relationship Tracking** - Full dependency and association management
6. **✅ Query Infrastructure** - Sophisticated querying and introspection tools

**This means we can build the memory optimization agent directly on top of the existing infrastructure!**

### **Simplified Architecture Using Existing KuzuMem-MCP:**

```typescript
// Leverage existing MemoryService and KuzuDBClient
class MemoryOptimizationAgent {
  constructor(
    private memoryService: MemoryService,  // ✅ Use existing service
    private llmClient: LLMClient
  ) {}

  async analyzeMemory(
    mcpContext: EnrichedRequestHandlerExtra,
    clientProjectRoot: string,
    repository: string,
    branch: string
  ): Promise<AnalysisResult> {
    // ✅ Use existing KuzuDB client
    const kuzuClient = await this.memoryService.getKuzuClient(mcpContext, clientProjectRoot);

    // ✅ Use existing query methods
    const entityCounts = await this.getEntityCounts(repository, branch);
    const relationships = await this.getRelationshipSummary(repository, branch);

    // ✅ Use existing graph analysis
    const graphAnalysis = await this.memoryService.pageRankAnalysis(mcpContext, clientProjectRoot, {
      repository, branch, nodeTableNames: ['Component', 'Decision'],
      relationshipTableNames: ['DEPENDS_ON']
    });

    // 🆕 Add LLM analysis
    return this.llmClient.analyzeMemoryGraph({
      entityCounts, relationships, graphAnalysis
    });
  }
}
```

### Core Architectural Decisions

#### 1. LLM Framework & Provider Selection

**Recommended: Vercel AI SDK + OpenAI/Anthropic**

```typescript
// Serverless-first, simple integration
import { generateObject, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

class MemoryOptimizationAgent {
  private model = openai('gpt-4o') || anthropic('claude-3-5-sonnet-20241022');

  async analyzeMemoryGraph(context: MemoryContext): Promise<OptimizationPlan> {
    const result = await generateObject({
      model: this.model,
      system: this.getSystemPrompt(),
      prompt: this.buildAnalysisPrompt(context),
      schema: OptimizationPlanSchema
    });
    return result.object;
  }
}
```

**Why Vercel AI SDK:**
- ✅ **Serverless-optimized** - Works perfectly in edge/serverless environments
- ✅ **Provider-agnostic** - Easy to switch between OpenAI, Anthropic, etc.
- ✅ **TypeScript-first** - Excellent type safety with Zod schemas
- ✅ **Streaming support** - For real-time optimization feedback
- ✅ **Simple integration** - Minimal boilerplate, focus on logic
- ✅ **Cost-effective** - Pay-per-use, no infrastructure overhead

#### 2. System Prompt Management Strategy

**Recommended: Hierarchical Prompt System with Version Control**

```typescript
interface SystemPromptConfig {
  version: string;
  basePrompt: string;
  roleSpecificPrompts: {
    analyzer: string;
    optimizer: string;
    safety: string;
  };
  contextTemplates: {
    repository: string;
    entities: string;
    relationships: string;
  };
}

class PromptManager {
  private prompts: Map<string, SystemPromptConfig> = new Map();

  // Load prompts from versioned configuration
  async loadPromptConfig(version: string = 'latest'): Promise<SystemPromptConfig> {
    const config = await this.loadFromFile(`./prompts/v${version}/system-prompts.json`);
    return this.validateAndCache(config);
  }

  // Build context-specific system prompt
  buildSystemPrompt(role: 'analyzer' | 'optimizer' | 'safety', context: MemoryContext): string {
    const config = this.prompts.get('current');
    return [
      config.basePrompt,
      config.roleSpecificPrompts[role],
      this.interpolateContext(config.contextTemplates, context)
    ].join('\n\n');
  }
}
```

**Prompt Storage Structure:**
```
src/
├── prompts/
│   ├── v1.0/
│   │   ├── system-prompts.json
│   │   ├── analysis-templates.json
│   │   └── safety-rules.json
│   ├── v1.1/
│   │   └── ... (versioned updates)
│   └── current -> v1.1 (symlink)
```

#### 3. Prompt Delivery Strategy

**Recommended: Hybrid Approach - Static Base + Dynamic Context**

```typescript
enum PromptDeliveryMode {
  STATIC_COMPLETE = 'static',      // Full prompt embedded in agent
  MCP_BROADCAST = 'mcp-broadcast', // Prompt sent via MCP sampling
  CLIENT_DYNAMIC = 'client-dynamic' // Client builds prompt dynamically
}

class DynamicMemoryAgent {
  constructor(private mode: PromptDeliveryMode = PromptDeliveryMode.STATIC_COMPLETE) {}

  async executeOptimization(context: MemoryContext): Promise<OptimizationResult> {
    switch (this.mode) {
      case PromptDeliveryMode.STATIC_COMPLETE:
        return this.executeWithStaticPrompt(context);

      case PromptDeliveryMode.MCP_BROADCAST:
        return this.executeWithMCPPrompt(context);

      case PromptDeliveryMode.CLIENT_DYNAMIC:
        return this.executeWithClientPrompt(context);
    }
  }

  private async executeWithStaticPrompt(context: MemoryContext) {
    // Agent has full prompt knowledge, builds complete context
    const systemPrompt = this.promptManager.buildSystemPrompt('optimizer', context);
    const userPrompt = this.buildStaticUserPrompt(context);

    return this.llmClient.generateOptimization({
      system: systemPrompt,
      user: userPrompt,
      context: this.serializeMemoryGraph(context)
    });
  }

  private async executeWithMCPPrompt(context: MemoryContext) {
    // Use MCP sampling to get prompt from client
    const promptRequest = await this.mcpClient.sample({
      type: 'memory-optimization-prompt',
      context: context.summary,
      capabilities: this.getAgentCapabilities()
    });

    return this.llmClient.generateOptimization({
      system: promptRequest.systemPrompt,
      user: promptRequest.userPrompt,
      context: promptRequest.contextData
    });
  }

  private async executeWithClientPrompt(context: MemoryContext) {
    // Client dynamically builds and sends complete prompt
    const request = await this.waitForClientPrompt(context);

    return this.llmClient.generateOptimization({
      system: request.systemPrompt,
      user: request.userPrompt,
      context: request.contextData
    });
  }
}
```

### New Components Needed

#### 1. Memory Analyzer Service
```typescript
class MemoryAnalyzer {
  constructor(private llmClient: LLMClient, private promptManager: PromptManager) {}

  async analyzeGraph(repository: string, branch: string): Promise<GraphAnalysis> {
    const context = await this.buildMemoryContext(repository, branch);
    const systemPrompt = this.promptManager.buildSystemPrompt('analyzer', context);

    return this.llmClient.generateObject({
      model: this.model,
      system: systemPrompt,
      prompt: `Analyze this memory graph for optimization opportunities: ${JSON.stringify(context)}`,
      schema: GraphAnalysisSchema
    });
  }

  detectStaleEntities(timeThreshold: Date): StaleEntity[]
  findRedundancies(): RedundancyGroup[]
  optimizeDependencies(): OptimizationPlan[]
}
```

#### 2. Sampling Integration
```typescript
class MemoryOptimizationAgent {
  async generateOptimizationStrategies(): Promise<OptimizationStrategy[]>
  async evaluateStrategy(strategy: OptimizationStrategy): Promise<StrategyEvaluation>
  async selectBestStrategy(evaluations: StrategyEvaluation[]): Promise<OptimizationPlan>
}
```

#### 3. Safety & Rollback System
```typescript
class OptimizationSafetyNet {
  createSnapshot(repository: string): SnapshotId
  validateOptimization(plan: OptimizationPlan): ValidationResult
  rollback(snapshotId: SnapshotId): Promise<void>
}
```

## 🎮 User Experience Flow

### Automated Mode
```bash
# Agent runs periodically, suggests optimizations
mcp-tool memory-optimizer --mode=suggest --schedule=weekly

# User reviews and approves
mcp-tool memory-optimizer --approve=optimization-plan-123

# Agent executes with safety nets
```

### Interactive Mode
```bash
# User requests analysis
mcp-tool memory-optimizer --analyze --interactive

# Agent presents findings with sampling-based recommendations
# User can adjust parameters and re-sample
# Agent executes approved plan
```

## 🔒 Safety Mechanisms

### 1. Multi-Level Approval
- **Conservative**: Requires explicit approval for each deletion
- **Balanced**: Batch approval with review summaries
- **Aggressive**: Auto-approve with rollback capability

### 2. Preservation Rules
- Never delete entities tagged as "critical"
- Preserve recent decisions (< 30 days)
- Maintain dependency integrity
- Keep audit trails

### 3. Rollback Capabilities
- Full graph snapshots before optimization
- Incremental rollback of specific changes
- Recovery from backup repositories

## 🚀 Implementation Phases

### Phase 1: Foundation (2-3 weeks)
- Build memory analysis service
- Implement basic stale detection
- Create safety snapshot system

### Phase 2: Sampling Integration (2-3 weeks)
- Integrate MCP sampling for strategy generation
- Build strategy evaluation framework
- Implement recommendation engine

### Phase 3: Autonomous Agent (3-4 weeks)
- Create full optimization agent
- Add scheduling and automation
- Implement comprehensive safety nets

### Phase 4: Advanced Features (ongoing)
- Machine learning for pattern recognition
- Predictive optimization
- Cross-repository optimization
- Performance analytics

## 💡 Potential Challenges & Solutions

### Challenge: Over-Optimization
**Solution**: Conservative defaults, user-defined preservation rules, rollback capabilities

### Challenge: Context Loss
**Solution**: Semantic analysis of entity importance, relationship preservation, audit trails

### Challenge: Performance Impact
**Solution**: Background processing, incremental analysis, caching strategies

## 🎯 Success Metrics

1. **Memory Efficiency**: % reduction in storage usage
2. **Query Performance**: Improved graph traversal times
3. **User Satisfaction**: Reduced manual cleanup effort
4. **Safety**: Zero data loss incidents
5. **Intelligence**: Accuracy of stale detection

## 🤔 Architectural Decision Analysis

### 1. LLM Framework Comparison

| Framework | Pros | Cons | Serverless Ready | Complexity |
|-----------|------|------|------------------|------------|
| **Vercel AI SDK** ✅ | Provider-agnostic, TypeScript-first, streaming | Newer ecosystem | ✅ Excellent | Low |
| LangChain | Mature, many integrations | Heavy, complex | ⚠️ Moderate | High |
| OpenAI SDK Direct | Simple, direct | Vendor lock-in | ✅ Good | Low |
| Anthropic SDK Direct | Claude-optimized | Vendor lock-in | ✅ Good | Low |

**Recommendation: Vercel AI SDK** - Best balance of simplicity, flexibility, and serverless optimization.

### 2. System Prompt Management Comparison

| Approach | Pros | Cons | Maintainability | Flexibility |
|----------|------|------|-----------------|-------------|
| **Versioned Files** ✅ | Version control, easy updates | File management | ✅ High | ✅ High |
| Database Storage | Dynamic updates | Infrastructure dependency | ⚠️ Medium | ✅ High |
| Hardcoded | Simple, fast | Hard to update | ❌ Low | ❌ Low |
| Environment Variables | Easy deployment | Limited size, no versioning | ⚠️ Medium | ❌ Low |

**Recommendation: Versioned Files** - Best for development velocity and maintainability.

### 3. Prompt Delivery Strategy Analysis

#### Option A: Static Complete Prompt ✅ **RECOMMENDED**
```typescript
// Agent contains all prompt logic
const systemPrompt = `
You are a memory optimization agent for KuzuMem-MCP.
Your role is to analyze memory graphs and suggest optimizations.

CAPABILITIES:
- Detect stale entities (components, decisions, files)
- Identify redundant relationships
- Optimize dependency chains
- Preserve critical knowledge

SAFETY RULES:
- Never delete entities tagged as "critical"
- Preserve recent decisions (< 30 days)
- Maintain dependency integrity
- Always provide rollback information

CONTEXT: ${JSON.stringify(memoryContext)}
`;
```

**Pros:**
- ✅ **Simplest implementation** - Self-contained agent
- ✅ **Fastest execution** - No network calls for prompts
- ✅ **Most reliable** - No dependency on external prompt sources
- ✅ **Easier testing** - Deterministic prompt behavior
- ✅ **Better security** - Prompts not transmitted over network

**Cons:**
- ❌ **Less flexible** - Requires code updates for prompt changes
- ❌ **Harder to A/B test** - Can't easily try different prompts

#### Option B: MCP Broadcast Prompts
```typescript
// Client sends prompts via MCP sampling
const promptRequest = await mcpClient.sample({
  type: 'memory-optimization-prompt',
  context: { repository, branch, entityCount: 150 },
  capabilities: ['stale-detection', 'redundancy-removal']
});
```

**Pros:**
- ✅ **Dynamic prompts** - Client can customize based on context
- ✅ **A/B testing** - Easy to experiment with different prompts
- ✅ **Context-aware** - Client knows current project state

**Cons:**
- ❌ **More complex** - Requires MCP sampling implementation
- ❌ **Network dependency** - Additional latency and failure points
- ❌ **Harder to debug** - Prompt generation logic distributed

#### Option C: Client Dynamic Prompts
```typescript
// Client builds complete prompt dynamically
const request = {
  systemPrompt: buildSystemPrompt(projectContext),
  userPrompt: buildUserPrompt(optimizationGoals),
  contextData: serializeMemoryGraph(repository, branch)
};
```

**Pros:**
- ✅ **Maximum flexibility** - Client has full control
- ✅ **Context-rich** - Can include real-time project information
- ✅ **Customizable** - Different clients can have different strategies

**Cons:**
- ❌ **Most complex** - Requires sophisticated client implementation
- ❌ **Inconsistent** - Different clients may behave differently
- ❌ **Harder to maintain** - Prompt logic scattered across clients

### 4. Final Architectural Recommendations

#### Phase 1: Start Simple (Recommended)
```typescript
// Use static prompts with versioned configuration
class MemoryOptimizationAgent {
  private promptManager = new PromptManager('./prompts/current/');
  private llmClient = new VercelAIClient(openai('gpt-4o'));

  async optimizeMemory(repository: string, branch: string): Promise<OptimizationPlan> {
    const context = await this.buildMemoryContext(repository, branch);
    const systemPrompt = this.promptManager.getSystemPrompt('optimizer');
    const userPrompt = this.promptManager.buildUserPrompt(context);

    return this.llmClient.generateOptimization({
      system: systemPrompt,
      user: userPrompt,
      schema: OptimizationPlanSchema
    });
  }
}
```

#### Phase 2: Add Flexibility (Future)
- Add MCP sampling support for dynamic prompts
- Implement A/B testing framework for prompt optimization
- Add client-specific prompt customization

## 🤔 Key Questions for Implementation

1. Which optimization strategies would be most valuable for specific use cases?
2. How aggressive should the default optimization be?
3. What preservation rules are absolutely critical?
4. Should we start with a specific focus area (stale detection, redundancy, etc.)?
5. **NEW: Should we support multiple LLM providers simultaneously for comparison?**
6. **NEW: How do we handle prompt versioning and rollback for the agent itself?**

## 📋 Implementation Roadmap

### Phase 1: Foundation Setup (Week 1-2)

#### 1.1 LLM Integration Setup
```bash
# Install dependencies
npm install ai @ai-sdk/openai @ai-sdk/anthropic zod

# Create basic structure
mkdir -p src/agents/memory-optimizer
mkdir -p src/prompts/v1.0
mkdir -p src/schemas/optimization
```

#### 1.2 Basic Agent Structure
```typescript
// src/agents/memory-optimizer/agent.ts
export class MemoryOptimizationAgent {
  constructor(
    private llmProvider: 'openai' | 'anthropic' = 'openai',
    private promptVersion: string = 'v1.0'
  ) {}

  async analyzeMemory(context: MemoryContext): Promise<AnalysisResult>
  async generateOptimizationPlan(analysis: AnalysisResult): Promise<OptimizationPlan>
  async executeOptimization(plan: OptimizationPlan): Promise<OptimizationResult>
}
```

#### 1.3 Prompt Management System
```typescript
// src/prompts/v1.0/system-prompts.json
{
  "version": "1.0",
  "basePrompt": "You are an intelligent memory optimization agent...",
  "roles": {
    "analyzer": "Focus on identifying optimization opportunities...",
    "optimizer": "Generate safe, effective optimization plans...",
    "safety": "Validate plans and ensure no data loss..."
  }
}
```

### Phase 2: Core Analysis Engine (Week 3-4)

#### 2.1 Memory Context Builder
```typescript
interface MemoryContext {
  repository: string;
  branch: string;
  entityCounts: {
    components: number;
    decisions: number;
    files: number;
    contexts: number;
    tags: number;
  };
  relationships: RelationshipSummary[];
  staleCandidates: StaleEntityCandidate[];
  redundancyGroups: RedundancyGroup[];
}
```

#### 2.2 Analysis Schemas
```typescript
// src/schemas/optimization/analysis-schema.ts
export const AnalysisResultSchema = z.object({
  staleEntities: z.array(z.object({
    id: z.string(),
    type: z.enum(['component', 'decision', 'file', 'context']),
    staleness: z.number().min(0).max(1),
    reason: z.string(),
    safeToDelete: z.boolean()
  })),
  redundancies: z.array(z.object({
    entities: z.array(z.string()),
    similarity: z.number().min(0).max(1),
    mergeRecommendation: z.string().optional()
  })),
  optimizationOpportunities: z.array(z.object({
    type: z.enum(['dependency-simplification', 'tag-consolidation', 'relationship-cleanup']),
    impact: z.enum(['low', 'medium', 'high']),
    description: z.string(),
    entities: z.array(z.string())
  }))
});
```

### Phase 3: Safety & Execution (Week 5-6)

#### 3.1 Snapshot System
```typescript
class MemorySnapshotManager {
  async createSnapshot(repository: string, branch: string): Promise<SnapshotId>
  async validateSnapshot(snapshotId: SnapshotId): Promise<ValidationResult>
  async rollbackToSnapshot(snapshotId: SnapshotId): Promise<RollbackResult>
}
```

#### 3.2 Safe Execution Engine
```typescript
class SafeOptimizationExecutor {
  async executeWithSafety(
    plan: OptimizationPlan,
    options: {
      dryRun: boolean;
      maxDeletions: number;
      requireConfirmation: boolean;
    }
  ): Promise<OptimizationResult>
}
```

### Phase 4: MCP Tool Integration (Week 7-8)

#### 4.1 New MCP Tool: memory-optimizer
```typescript
// src/mcp/tools/unified/memory-optimizer-tool.ts
export const memoryOptimizerTool: Tool = {
  name: 'memory-optimizer',
  description: 'Intelligent memory graph optimization using AI analysis',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['analyze', 'optimize', 'rollback'],
        description: 'Operation to perform'
      },
      repository: { type: 'string' },
      branch: { type: 'string' },
      strategy: {
        type: 'string',
        enum: ['conservative', 'balanced', 'aggressive'],
        default: 'conservative'
      },
      dryRun: { type: 'boolean', default: true },
      maxDeletions: { type: 'number', default: 10 }
    },
    required: ['operation', 'repository', 'branch']
  }
};
```

### Phase 5: Advanced Features (Week 9+)

#### 5.1 Multi-Provider Support
```typescript
class MultiProviderAgent {
  private providers = {
    openai: new OpenAIProvider(),
    anthropic: new AnthropicProvider(),
    local: new OllamaProvider()
  };

  async optimizeWithConsensus(context: MemoryContext): Promise<OptimizationPlan> {
    const results = await Promise.all([
      this.providers.openai.analyze(context),
      this.providers.anthropic.analyze(context)
    ]);

    return this.buildConsensusOptimization(results);
  }
}
```

#### 5.2 Learning & Improvement
```typescript
class OptimizationLearningSystem {
  async recordOptimizationOutcome(
    plan: OptimizationPlan,
    result: OptimizationResult,
    userFeedback: UserFeedback
  ): Promise<void>

  async improvePrompts(learningData: LearningData[]): Promise<PromptImprovements>
}
```

## 📋 Immediate Next Steps

1. **✅ Complete current PR** - Merge deletion tool implementation
2. **🔧 Setup LLM infrastructure** - Install Vercel AI SDK, configure providers
3. **📝 Create initial prompts** - Write v1.0 system prompts for memory optimization
4. **🏗️ Build basic agent** - Implement core MemoryOptimizationAgent class
5. **🧪 Create test scenarios** - Define test cases for different optimization strategies
6. **🔒 Implement safety nets** - Build snapshot and rollback systems
7. **🔌 Add MCP integration** - Create memory-optimizer tool
8. **📊 Add monitoring** - Track optimization effectiveness and safety metrics

---

This dynamic memory management system could revolutionize how we handle memory graphs in MCP systems, combining intelligent analysis, sampling-driven decisions, autonomous execution, and safety-first design.
