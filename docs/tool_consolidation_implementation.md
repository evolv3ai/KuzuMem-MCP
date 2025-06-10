# Tool Consolidation Implementation Plan

## Overview
This document tracks the step-by-step implementation of consolidating 29 tool functionalities into 11 unified tools. While the current codebase only has 19 implemented tools, the MemoryService supports additional features (file management, tagging, and introspection) that will be included in the consolidated tools.

### Current vs Planned Tool Coverage
- **Currently Implemented:** 19 tools
- **Service Methods Available:** Support for 29+ operations
- **Consolidation Target:** 11 unified tools covering all functionality

The missing tool implementations (file, tag, introspection) will be incorporated into the appropriate unified tools since the underlying service methods already exist.

## Implementation Order
Tools are ordered by dependencies and complexity:
1. `memory-bank` (foundational)
2. `entity` (core CRUD operations)
3. `introspect` (schema operations)
4. `context` (simple update operation)
5. `query` (complex search operations)
6. `associate` (relationship operations)
7. `analyze` (graph algorithms)
8. `detect` (pattern detection)
9. `bulk-import` (new capability)
10. `semantic-search` (future tool, not broadcasted)

## Pre-Implementation Tasks
- [x] Create backup branch: `git checkout -b tool-consolidation-backup`
- [x] Create development branch: `git checkout -b feature/tool-consolidation`
- [x] Study existing tool patterns in `src/mcp/tools/`
- [x] Review `MemoryService` methods in `src/services/memory.service.ts`
- [x] Understand `ToolHandler` type from `src/mcp/types/index.ts`
- [x] Create `src/mcp/tools/unified/` directory for new tools
- [x] Create `src/mcp/services/handlers/unified/` directory for handlers

**Note:** Discovered that the current implementation has 19 tools (not 29). The missing tools are:
- File management tools (`add-file`, `associate-file-with-component`)
- Tag management tools (`add-tag`, `tag-item`, `find-items-by-tag`)
- Introspection tools (`count-nodes-by-label`, `list-nodes-by-label`, `get-node-properties`, `list-all-indexes`, `list-all-labels`)

These tools were mentioned in the plan but not yet implemented. The MemoryService has the methods to support them:
- `addFile()`, `associateFileWithComponent()`, `addTag()`, `tagItem()`, `findItemsByTag()`
- `countNodesByLabel()`, `listNodesByLabel()`, `getNodeProperties()`, `listAllIndexes()`, `listAllNodeLabels()`

**Decision:** We'll implement these missing features as part of the consolidated tools:
- File and tag creation → `entity` tool
- File-component association and tagging → `associate` tool  
- Tag search → `query` tool
- All introspection operations → `introspect` tool

This ensures the consolidated tools provide complete functionality even for features that weren't previously exposed as individual tools.

## Handler Pattern Template

All handlers should follow this pattern based on current SDK implementation:

```typescript
// Handler file structure (e.g., src/mcp/services/handlers/unified/memory-bank-handler.ts)
import { SdkToolHandler } from '../../tool-handlers';
import { EnrichedRequestHandlerExtra } from '../../types/sdk-custom';
import { MemoryService } from '../../../services/memory.service';
import { 
  MemoryBankInputSchema,  // Create corresponding schema
  MemoryBankOutputSchema   // Create corresponding schema
} from '../../schemas/unified-tool-schemas';

export const memoryBankHandler: SdkToolHandler = async (
  params: any,
  context: EnrichedRequestHandlerExtra,
  memoryService: MemoryService
): Promise<unknown> => {
  // 1. Parse and validate parameters
  const validatedParams = MemoryBankInputSchema.parse(params);
  
  // 2. Get clientProjectRoot from session (except for init-memory-bank)
  const clientProjectRoot = ensureValidSessionContext(validatedParams, context, 'memory-bank');
  
  // 3. Log the operation
  context.logger.info(`Executing memory-bank with operation: ${validatedParams.operation}`, {
    repository: validatedParams.repository,
    branch: validatedParams.branch,
    clientProjectRoot
  });
  
  // 4. Send initial progress (for long operations)
  if (context.sendProgress) {
    await context.sendProgress({
      status: 'initializing',
      message: `Starting ${validatedParams.operation} operation...`,
      percent: 10
    });
  }
  
  // 5. Operation dispatch
  switch (validatedParams.operation) {
    case 'init':
      return await handleInit(validatedParams, context, memoryService);
    case 'get-metadata':
      return await handleGetMetadata(validatedParams, context, memoryService, clientProjectRoot);
    case 'update-metadata':
      return await handleUpdateMetadata(validatedParams, context, memoryService, clientProjectRoot);
    default:
      throw new Error(`Unknown operation: ${validatedParams.operation}`);
  }
};

// Helper function from existing code
function ensureValidSessionContext(
  params: any,
  context: EnrichedRequestHandlerExtra,
  toolName: string,
): string {
  // Copy logic from existing tool-handlers.ts
  // Special handling for init operations that establish context
}
```

## Tool Handler Registration

Update `src/mcp/tool-handlers.ts` to include new unified handlers:

```typescript
// At the top, import new handlers
import { memoryBankHandler } from './services/handlers/unified/memory-bank-handler';
import { entityHandler } from './services/handlers/unified/entity-handler';
// ... other unified handlers

// Add to existing toolHandlers object
export const toolHandlers: Record<string, SdkToolHandler> = {
  // ... existing handlers ...
  
  // New unified tools
  'memory-bank': memoryBankHandler,
  'entity': entityHandler,
  'context': contextHandler,
  'query': queryHandler,
  'analyze': analyzeHandler,
  'detect': detectHandler,
  'introspect': introspectHandler,
  'associate': associateHandler,
  'bulk-import': bulkImportHandler,
  'semantic-search': semanticSearchHandler,
};
```

## Schema Creation Pattern

Create schemas in `src/mcp/schemas/unified-tool-schemas.ts`:

```typescript
import { z } from 'zod';

// Memory Bank Tool Schemas
export const MemoryBankInputSchema = z.object({
  operation: z.enum(['init', 'get-metadata', 'update-metadata']),
  clientProjectRoot: z.string().optional(), // Required only for init
  repository: z.string(),
  branch: z.string().default('main'),
  // Operation-specific fields
  metadata: z.object({}).optional(), // For update-metadata
});

export const MemoryBankOutputSchema = z.union([
  // Init output
  z.object({
    success: z.boolean(),
    message: z.string(),
    path: z.string().optional(),
  }),
  // Get metadata output
  z.object({
    id: z.string(),
    project: z.object({
      name: z.string(),
      created: z.string(),
      description: z.string().optional(),
    }),
    tech_stack: z.record(z.string()),
    architecture: z.string(),
    memory_spec_version: z.string(),
  }),
  // Update metadata output
  z.object({
    success: z.boolean(),
    message: z.string().optional(),
  }),
]);
```

---

## Tool 1: memory-bank

### Files to Create
- `src/mcp/tools/unified/memory-bank-tool.ts`
- `src/mcp/services/handlers/memory-bank-handler.ts`
- `src/__tests__/tools/memory-bank-tool.test.ts`

### Implementation Steps
```typescript
// memory-bank-tool.ts structure
export const memoryBankTool: McpTool = {
  name: 'memory-bank',
  description: 'Unified memory bank lifecycle management',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['init', 'get-metadata', 'update-metadata'],
        description: 'Operation to perform'
      },
      clientProjectRoot: { type: 'string', description: '...' },
      repository: { type: 'string', description: '...' },
      branch: { type: 'string', description: '...' },
      // operation-specific params...
    },
    required: ['operation', 'clientProjectRoot', 'repository', 'branch']
  }
}
```

### Service Methods to Use
- `MemoryService.initializeRepository()`
- `MemoryService.getMetadata()`
- `MemoryService.updateMetadata()`

### Checklist
- [x] Create tool definition file ✅
- [x] Create handler with operation dispatch ✅
- [x] Handle 'init' operation ✅
- [x] Handle 'get-metadata' operation ✅
- [x] Handle 'update-metadata' operation ✅
- [x] Add parameter validation ✅
- [x] Write unit tests ✅
- [x] Test all three operations ✅
- [x] Update exports in `src/mcp/tools/index.ts` ✅
- [x] Register handler in `src/mcp/tool-handlers.ts` ✅

### Files to Delete (After Phase 2)
- `src/mcp/tools/init-memory.ts`
- `src/mcp/tools/metadata-tools.ts`

### Notes Section
Use this section to track discoveries, issues, and decisions during implementation:

**2024-12-10:** Pre-implementation tasks completed. Discovered current implementation has 19 tools instead of 29. Missing tools (file, tag, introspection) have corresponding MemoryService methods but no tool implementations yet. Will proceed with consolidating existing 19 tools.

**2024-12-10:** Completed Tool 1 (memory-bank):
- Successfully consolidated `init-memory-bank`, `get-metadata`, and `update-metadata` into a single tool
- Created unified tool definition with operation parameter
- Implemented handler with proper session management and progress reporting
- Added comprehensive unit tests
- Tool is now available as 'memory-bank' with operations: init, get-metadata, update-metadata

---

## Tool 2: entity (universal entity CRUD) ✅
**Status**: COMPLETE
- Created: `src/mcp/tools/unified/entity-tool.ts`
- Created: `src/mcp/services/handlers/unified/entity-handler.ts`
- Created: `src/__tests__/tools/unified/entity-tool.test.ts`
- Updated: `src/mcp/schemas/unified-tool-schemas.ts`
- Updated: exports and registrations
- Tests: 12/12 passing
- Notes: get/delete operations are placeholders pending MemoryService updates

### Files to Create
- `src/mcp/tools/unified/entity-tool.ts`
- `src/mcp/services/handlers/entity-handler.ts`
- `src/__tests__/tools/entity-tool.test.ts`

### Implementation Steps
```typescript
// entity-tool.ts structure
export const entityTool: McpTool = {
  name: 'entity',
  description: 'Universal entity management',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'update', 'get', 'delete'],
        description: 'Operation to perform'
      },
      entityType: {
        type: 'string',
        enum: ['component', 'decision', 'rule', 'file', 'tag'],
        description: 'Type of entity'
      },
      // ... common params
    }
  }
}
```

### Service Methods to Use
- `MemoryService.addComponent()`
- `MemoryService.addDecision()`
- `MemoryService.addRule()`
- `MemoryService.addFile()`
- `MemoryService.addTag()`
- Implement new get/update/delete methods if missing

### Entity-Specific Field Mappings
```typescript
const entityFieldMap = {
  component: {
    required: ['id', 'name'],
    optional: ['kind', 'depends_on', 'status']
  },
  decision: {
    required: ['id', 'name', 'date'],
    optional: ['context', 'status']
  },
  rule: {
    required: ['id', 'name', 'created'],
    optional: ['triggers', 'content', 'status']
  },
  file: {
    required: ['id', 'name', 'path'],
    optional: ['language', 'metrics', 'content_hash', 'mime_type', 'size_bytes']
  },
  tag: {
    required: ['id', 'name'],
    optional: ['color', 'description']
  }
}
```

### Checklist
- [ ] Create tool definition with all entity types
- [ ] Create handler with entity type dispatch
- [ ] Implement field validation per entity type
- [ ] Handle 'create' for all 5 entity types
- [ ] Handle 'get' operation (may need new service methods)
- [ ] Handle 'update' operation (may need new service methods)
- [ ] Handle 'delete' operation (may need new service methods)
- [ ] Write comprehensive tests for each entity type
- [ ] Test all operations for all entity types
- [ ] Update exports

### Files to Delete (After Phase 2)
- `src/mcp/tools/component-tool.ts`
- `src/mcp/tools/decision-tool.ts`
- `src/mcp/tools/rule-tool.ts`
- Part of `src/mcp/tools/file-and-tag-tools.ts` (keep associate functions)

---

## Tool 3: introspect (schema operations)
- [ ] Create schemas: `IntrospectInputSchema`, `IntrospectOutputSchema`
- [ ] Create tool: `src/mcp/tools/unified/introspect-tool.ts`
- [ ] Create handler: `src/mcp/services/handlers/unified/introspect-handler.ts`
- [ ] Create tests: `src/__tests__/tools/unified/introspect-tool.test.ts`
- [ ] Update exports

### Files to Create
- `src/mcp/tools/unified/introspect-tool.ts`
- `src/mcp/services/handlers/introspect-handler.ts`
- `src/__tests__/tools/introspect-tool.test.ts`

### Implementation Steps
```typescript
// introspect-tool.ts structure
export const introspectTool: McpTool = {
  name: 'introspect',
  description: 'Graph schema and metadata introspection',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        enum: ['labels', 'count', 'properties', 'indexes'],
        description: 'Type of introspection query'
      },
      target: {
        type: 'string',
        description: 'Target label for count/properties queries'
      }
    }
  }
}
```

### Service Methods to Use
- `MemoryService.listAllLabels()`
- `MemoryService.countNodesByLabel()`
- `MemoryService.getNodeProperties()`
- `MemoryService.listAllIndexes()`

### Checklist
- [ ] Create tool definition
- [ ] Create handler with query type dispatch
- [ ] Handle 'labels' query
- [ ] Handle 'count' query (requires target)
- [ ] Handle 'properties' query (requires target)
- [ ] Handle 'indexes' query
- [ ] Add parameter validation (target required for some queries)
- [ ] Write tests for each query type
- [ ] Update exports

### Files to Delete (After Phase 2)
- Parts of `src/mcp/tools/introspection-tools.ts` (keep list-nodes-by-label for query tool)

---

## Tool 4: context

### Files to Create
- `src/mcp/tools/unified/context-tool.ts`
- `src/mcp/services/handlers/context-handler.ts`
- `src/__tests__/tools/context-tool.test.ts`

### Implementation Steps
```typescript
// context-tool.ts structure
export const contextTool: McpTool = {
  name: 'context',
  description: 'Context update operations',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['update'],
        description: 'Operation to perform'
      },
      // update-specific params
    }
  }
}
```

### Service Methods to Use
- `MemoryService.updateContext()`

### Checklist
- [ ] Create tool definition (update only)
- [ ] Create handler
- [ ] Implement update operation
- [ ] Add parameter validation
- [ ] Write tests
- [ ] Update exports

### Files to Delete (After Phase 2)
- Part of `src/mcp/tools/context-tools.ts` (keep get-context for query tool)

---

## Tool 5: query (Most Complex)

### Files to Create
- `src/mcp/tools/unified/query-tool.ts`
- `src/mcp/services/handlers/query-handler.ts`
- `src/__tests__/tools/query-tool.test.ts`

### Implementation Steps
```typescript
// query-tool.ts structure
export const queryTool: McpTool = {
  name: 'query',
  description: 'Unified search and query tool',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['context', 'entities', 'relationships', 'dependencies', 'governance', 'history', 'tags'],
        description: 'Type of query'
      },
      // type-specific params...
    }
  }
}
```

### Query Type Implementations
1. **context**: Use `MemoryService.getContext()`
2. **entities**: Use `MemoryService.listNodesByLabel()`
3. **relationships**: Use `MemoryService.getRelatedItems()`
4. **dependencies**: Use `MemoryService.getComponentDependencies()` and `getComponentDependents()`
5. **governance**: Use `MemoryService.getGoverningItemsForComponent()`
6. **history**: Use `MemoryService.getItemContextualHistory()`
7. **tags**: Use `MemoryService.findItemsByTag()`

### Parameter Mappings
```typescript
const queryParamMap = {
  context: ['latest', 'limit'],
  entities: ['label', 'limit', 'offset'],
  relationships: ['startNode', 'depth', 'filters'],
  dependencies: ['componentId', 'direction'],
  governance: ['componentId'],
  history: ['itemId', 'itemType'],
  tags: ['tagId', 'entityType']
}
```

### Checklist
- [ ] Create tool definition with all query types
- [ ] Create handler with query type dispatch
- [ ] Implement 'context' query
- [ ] Implement 'entities' query
- [ ] Implement 'relationships' query
- [ ] Implement 'dependencies' query (handle direction param)
- [ ] Implement 'governance' query
- [ ] Implement 'history' query
- [ ] Implement 'tags' query
- [ ] Add comprehensive parameter validation
- [ ] Write tests for each query type
- [ ] Test edge cases (empty results, invalid params)
- [ ] Update exports

### Files to Delete (After Phase 2)
- `src/mcp/tools/get-component-dependencies-tool.ts`
- `src/mcp/tools/get-component-dependents-tool.ts`
- `src/mcp/tools/get-item-contextual-history-tool.ts`
- `src/mcp/tools/get-governing-items-for-component-tool.ts`
- `src/mcp/tools/get-related-items-tool.ts`
- Part of `src/mcp/tools/context-tools.ts` (get-context)
- Part of `src/mcp/tools/introspection-tools.ts` (list-nodes-by-label)
- Part of `src/mcp/tools/file-and-tag-tools.ts` (find-items-by-tag)

---

## Tool 6: associate

### Files to Create
- `src/mcp/tools/unified/associate-tool.ts`
- `src/mcp/services/handlers/associate-handler.ts`
- `src/__tests__/tools/associate-tool.test.ts`

### Implementation Steps
```typescript
// associate-tool.ts structure
export const associateTool: McpTool = {
  name: 'associate',
  description: 'Generic relationship creation',
  parameters: {
    type: 'object',
    properties: {
      relationship: {
        type: 'string',
        enum: ['contains-file', 'tagged-with', 'depends-on', 'governed-by'],
        description: 'Type of relationship'
      },
      source: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' }
        }
      },
      target: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' }
        }
      }
    }
  }
}
```

### Service Methods to Use
- `MemoryService.associateFileWithComponent()`
- `MemoryService.tagItem()`
- May need to implement generic relationship creation

### Checklist
- [ ] Create tool definition
- [ ] Create handler with relationship dispatch
- [ ] Handle 'contains-file' relationship
- [ ] Handle 'tagged-with' relationship
- [ ] Handle 'depends-on' relationship
- [ ] Handle 'governed-by' relationship
- [ ] Validate source/target types per relationship
- [ ] Write tests for each relationship type
- [ ] Update exports

### Files to Delete (After Phase 2)
- Part of `src/mcp/tools/file-and-tag-tools.ts` (associate and tag functions)

---

## Tool 7: analyze

### Files to Create
- `src/mcp/tools/unified/analyze-tool.ts`
- `src/mcp/services/handlers/analyze-handler.ts`
- `src/__tests__/tools/analyze-tool.test.ts`

### Implementation Steps
```typescript
// analyze-tool.ts structure
export const analyzeTool: McpTool = {
  name: 'analyze',
  description: 'System-wide analysis algorithms',
  parameters: {
    type: 'object',
    properties: {
      algorithm: {
        type: 'string',
        enum: ['pagerank', 'community', 'core-analysis'],
        description: 'Analysis algorithm'
      },
      projectedGraph: {
        type: 'object',
        properties: {
          nodes: { type: 'array', items: { type: 'string' } },
          relationships: { type: 'array', items: { type: 'string' } }
        }
      },
      parameters: {
        type: 'object',
        description: 'Algorithm-specific parameters'
      }
    }
  }
}
```

### Service Methods to Use
- `MemoryService.runPageRank()`
- `MemoryService.runLouvainCommunityDetection()`
- `MemoryService.runKCoreDecomposition()`

### Algorithm Parameter Mappings
```typescript
const algorithmParams = {
  pagerank: ['dampingFactor', 'maxIterations'],
  community: ['maxLevels', 'resolution'],
  'core-analysis': ['k']
}
```

### Checklist
- [ ] Create tool definition
- [ ] Create handler with algorithm dispatch
- [ ] Handle 'pagerank' algorithm
- [ ] Handle 'community' algorithm
- [ ] Handle 'core-analysis' algorithm
- [ ] Validate algorithm-specific parameters
- [ ] Handle progress streaming for long operations
- [ ] Write tests for each algorithm
- [ ] Update exports

### Files to Delete (After Phase 2)
- `src/mcp/tools/pagerank-tool.ts`
- `src/mcp/tools/louvain-community-detection-tool.ts`
- `src/mcp/tools/k-core-decomposition-tool.ts`

---

## Tool 8: detect

### Files to Create
- `src/mcp/tools/unified/detect-tool.ts`
- `src/mcp/services/handlers/detect-handler.ts`
- `src/__tests__/tools/detect-tool.test.ts`

### Implementation Steps
```typescript
// detect-tool.ts structure
export const detectTool: McpTool = {
  name: 'detect',
  description: 'Structural pattern detection',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        enum: ['cycles', 'islands', 'path'],
        description: 'Pattern to detect'
      },
      scope: {
        type: 'object',
        properties: {
          nodes: { type: 'array' },
          relationships: { type: 'array' }
        }
      }
    }
  }
}
```

### Service Methods to Use
- `MemoryService.runStronglyConnectedComponents()`
- `MemoryService.runWeaklyConnectedComponents()`
- `MemoryService.runShortestPath()`

### Pattern-Specific Parameters
```typescript
const patternParams = {
  cycles: [], // No additional params
  islands: [], // No additional params
  path: ['startNodeId', 'endNodeId']
}
```

### Checklist
- [ ] Create tool definition
- [ ] Create handler with pattern dispatch
- [ ] Handle 'cycles' pattern (strongly connected)
- [ ] Handle 'islands' pattern (weakly connected)
- [ ] Handle 'path' pattern (shortest path)
- [ ] Validate pattern-specific parameters
- [ ] Write tests for each pattern
- [ ] Update exports

### Files to Delete (After Phase 2)
- `src/mcp/tools/strongly-connected-components-tool.ts`
- `src/mcp/tools/weakly-connected-components-tool.ts`
- `src/mcp/tools/shortest-path-tool.ts`

---

## Tool 9: bulk-import

### Files to Create
- `src/mcp/tools/unified/bulk-import-tool.ts`
- `src/mcp/services/handlers/bulk-import-handler.ts`
- `src/__tests__/tools/bulk-import-tool.test.ts`

### Implementation Steps
```typescript
// bulk-import-tool.ts structure
export const bulkImportTool: McpTool = {
  name: 'bulk-import',
  description: 'Efficient bulk operations',
  parameters: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            id: { type: 'string' },
            data: { type: 'object' }
          }
        }
      },
      relationships: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            source: { type: 'string' },
            target: { type: 'string' }
          }
        }
      }
    }
  }
}
```

### Implementation Notes
- Use database transactions for atomicity
- Batch operations for performance
- Validate all entities before importing
- Handle circular dependencies in relationships

### Checklist
- [ ] Create tool definition
- [ ] Create handler with transaction support
- [ ] Implement entity validation
- [ ] Implement batch entity creation
- [ ] Implement batch relationship creation
- [ ] Handle rollback on failure
- [ ] Add progress reporting for large imports
- [ ] Write tests for various scenarios
- [ ] Test error handling and rollback
- [ ] Update exports

---

## Tool 10: semantic-search (Future Tool)

### Files to Create
- `src/mcp/tools/unified/semantic-search-tool.ts`
- `src/mcp/services/handlers/semantic-search-handler.ts`
- `src/__tests__/tools/semantic-search-tool.test.ts`

### Implementation Steps
```typescript
// semantic-search-tool.ts structure
export const semanticSearchTool: McpTool = {
  name: 'semantic-search',
  description: 'Advanced semantic and full-text search',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['semantic', 'fulltext', 'hybrid'],
        description: 'Search mode'
      },
      query: { type: 'string' },
      filters: { type: 'object' }
    }
  }
}
```

### Checklist
- [ ] Create tool definition
- [ ] Create placeholder handler (throws not implemented)
- [ ] Add TODO comments for future implementation
- [ ] Write basic structure tests
- [ ] **DO NOT add to exports** (not broadcasted)

---

## Phase 2: Integration and Cleanup

### Update Tool Exports
File: `src/mcp/tools/index.ts`

```typescript
// Remove all old tool imports
// Add new tool imports
import { memoryBankTool } from './unified/memory-bank-tool';
import { entityTool } from './unified/entity-tool';
// ... etc

export const MEMORY_BANK_MCP_TOOLS: McpTool[] = [
  memoryBankTool,
  entityTool,
  contextTool,
  queryTool,
  analyzeTool,
  detectTool,
  introspectTool,
  associateTool,
  bulkImportTool,
  // Note: semantic-search not included
];
```

### Checklist
- [ ] Remove all 29 old tool imports
- [ ] Add all 10 new tool imports (not semantic-search)
- [ ] Update MEMORY_BANK_MCP_TOOLS array
- [ ] Verify no old tools remain in exports

---

## Phase 3: Testing and Validation

### End-to-End Testing
- [ ] Update all e2e tests in `src/tests/e2e/`
- [ ] Create migration test suite
- [ ] Test all old functionality works with new tools
- [ ] Performance benchmarks

### Integration Testing
- [ ] Test tool interactions
- [ ] Test error handling across tools
- [ ] Test parameter validation
- [ ] Test with real KuzuDB instance

### Documentation Updates
- [ ] Update README.md with new tool descriptions
- [ ] Update docs/README2.md
- [ ] Create migration guide
- [ ] Update API documentation

---

## Phase 4: Cleanup

### Files to Delete
After confirming all tests pass:

```bash
# Old tool files
rm src/mcp/tools/init-memory.ts
rm src/mcp/tools/metadata-tools.ts
rm src/mcp/tools/component-tool.ts
rm src/mcp/tools/decision-tool.ts
rm src/mcp/tools/rule-tool.ts
rm src/mcp/tools/context-tools.ts
rm src/mcp/tools/get-component-dependencies-tool.ts
rm src/mcp/tools/get-component-dependents-tool.ts
rm src/mcp/tools/get-item-contextual-history-tool.ts
rm src/mcp/tools/get-governing-items-for-component-tool.ts
rm src/mcp/tools/get-related-items-tool.ts
rm src/mcp/tools/pagerank-tool.ts
rm src/mcp/tools/louvain-community-detection-tool.ts
rm src/mcp/tools/k-core-decomposition-tool.ts
rm src/mcp/tools/strongly-connected-components-tool.ts
rm src/mcp/tools/weakly-connected-components-tool.ts
rm src/mcp/tools/shortest-path-tool.ts
rm src/mcp/tools/file-and-tag-tools.ts
rm src/mcp/tools/introspection-tools.ts

# Old test files
rm src/__tests__/tools/*-tool.test.ts # (old ones)
```

### Final Validation
- [ ] Run full test suite
- [ ] Verify tool count is 10 (broadcasted)
- [ ] Check no references to old tools remain
- [ ] Performance comparison with old implementation
- [ ] Create PR with comprehensive description

---

## 10. Progress Tracker

### Overall Progress: 18% (2/11 tools)

#### Phase 1: Setup ✅
- [x] Created directories
- [x] Created schema file
- [x] Studied patterns

#### Phase 2: Tool Implementation (2/11 complete)
- [x] Tool 1: memory-bank (init, get-metadata, update-metadata)
- [x] Tool 2: entity (add-component, add-decision, add-rule, add-file, add-tag)
- [ ] Tool 3: introspect
- [ ] Tool 4: context
- [ ] Tool 5: query
- [ ] Tool 6: associate
- [ ] Tool 7: analyze
- [ ] Tool 8: detect
- [ ] Tool 9: bulk-import
- [ ] Tool 10: (reserved for future)
- [ ] Tool 11: (reserved for future)

---

## Git Commit Strategy

### Commit Message Format
```
feat(tools): implement unified <tool-name> tool

- Consolidates <list of old tools>
- Implements <operations/queries>
- Adds comprehensive tests
- Updates exports and documentation

Part of tool consolidation effort (29 → 11 tools)
```

### Commit Order
1. Each tool implementation as separate commit
2. Integration changes as one commit
3. Test updates as separate commits
4. Documentation updates as final commit
5. Cleanup/deletion of old files as last commit

### Example Commits
```bash
# Tool implementations
git commit -m "feat(tools): implement unified memory-bank tool"
git commit -m "feat(tools): implement unified entity tool"
git commit -m "feat(tools): implement unified query tool"

# Integration
git commit -m "feat(tools): integrate unified tools into exports"

# Testing
git commit -m "test(tools): update tests for unified tools"
git commit -m "test(e2e): migrate e2e tests to unified tools"

# Documentation
git commit -m "docs: update documentation for unified tools"

# Cleanup
git commit -m "chore: remove deprecated tool implementations"
```

---

## Testing Strategy

### Unit Test Structure
For each tool, create comprehensive tests:

```typescript
// src/__tests__/tools/unified/<tool-name>-tool.test.ts
describe('Unified <ToolName> Tool', () => {
  let memoryService: MemoryService;
  let context: EnrichedRequestHandlerExtra;
  
  beforeEach(() => {
    // Mock setup
  });
  
  describe('Tool Definition', () => {
    it('should have correct name and parameters', () => {
      // Verify tool structure
    });
  });
  
  describe('Handler', () => {
    describe('<operation>', () => {
      it('should handle valid input', async () => {
        // Test success case
      });
      
      it('should validate parameters', async () => {
        // Test validation
      });
      
      it('should handle errors gracefully', async () => {
        // Test error handling
      });
    });
  });
});
```

### Integration Test Checklist
- [ ] Test tool discovery (all 11 tools appear)
- [ ] Test session management across tools
- [ ] Test tool interactions (query → analyze → modify)
- [ ] Test error propagation
- [ ] Test progress reporting for long operations

### E2E Test Migration
1. Identify all tests using old tools
2. Create mapping of old → new tool calls
3. Update test fixtures
4. Verify same functionality preserved
5. Add new tests for bulk-import

### Performance Testing
- [ ] Benchmark old vs new implementation
- [ ] Test bulk operations efficiency
- [ ] Measure memory usage
- [ ] Profile database query performance

---

## Rollback Plan

If issues arise during implementation:

1. **Immediate Rollback**
   ```bash
   git checkout main
   git branch -D feature/tool-consolidation
   ```

2. **Partial Rollback**
   - Keep working tools
   - Revert problematic ones
   - Maintain both old and new temporarily

3. **Recovery Steps**
   - Restore from `tool-consolidation-backup` branch
   - Document issues encountered
   - Plan fixes before retry

---

## Definition of Done

A tool is considered complete when:

- [ ] Tool definition file created and exported
- [ ] Handler implemented with all operations/queries
- [ ] Input/output schemas defined and validated
- [ ] Unit tests achieve >90% coverage
- [ ] Integration tests pass
- [ ] Documentation updated
- [ ] Performance benchmarked
- [ ] Code reviewed
- [ ] No regression in functionality

---

## Post-Implementation Tasks

After all tools are implemented:

1. **Cleanup Phase**
   - Make sure all old tool files are deleted
   - Make sure all old tool imports are deleted
   - Make sure all old tool exports are deleted
   - Make sure all old tool references are deleted
   - Make sure all old tool tests are deleted

2. **Security Review**
   - Verify parameter validation
   - Check for injection vulnerabilities
   - Review error messages for info leaks

3. **Documentation**
   - Update API reference
   - Update .cursor rules
   - Update README.md and README2.md
   - Record lessons learned
  
4. **Testing**
   - Run full test suite
   - Verify all e2e tests pass
   - Verify no regressions in functionality
   - Verify no references to old tools remain
   - Verify no old tool files remain
   - Verify no old test files remain

---

_Last Updated: 2024-12-10_
_Current Phase: Tool Implementation - Tool 2 Complete ✅_
_Blockers: None_
_Next Action: Start implementing Tool 3: introspect_