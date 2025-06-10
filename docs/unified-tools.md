# KuzuMem-MCP Unified Tools Documentation

## Overview

KuzuMem-MCP has been refactored to consolidate 29 individual tool operations into 11 unified tools. This simplification improves usability while maintaining all functionality. Each unified tool groups related operations under a single command with operation-specific parameters.

## Tool List

### 1. memory-bank
Memory bank lifecycle management tool that handles initialization and metadata operations.

**Operations:**
- `init` - Initialize a new memory bank for a repository/branch
- `get-metadata` - Retrieve repository metadata
- `update-metadata` - Update repository metadata

**Example Usage:**
```json
{
  "tool": "memory-bank",
  "operation": "init",
  "clientProjectRoot": "/path/to/project",
  "repository": "my-app",
  "branch": "main"
}
```

### 2. entity
Universal entity CRUD operations for all memory bank entity types.

**Operations:**
- `create` - Create a new entity
- `update` - Update an existing entity
- `get` - Retrieve an entity (placeholder)
- `delete` - Delete an entity (placeholder)

**Entity Types:**
- `component` - System components/modules
- `decision` - Architectural decisions
- `rule` - Coding/architectural rules
- `file` - File records
- `tag` - Tags for categorization

**Example Usage:**
```json
{
  "tool": "entity",
  "operation": "create",
  "entityType": "component",
  "repository": "my-app",
  "branch": "main",
  "data": {
    "id": "comp-auth-service",
    "name": "Authentication Service",
    "kind": "service",
    "depends_on": ["comp-user-service"]
  }
}
```

### 3. introspect
Graph schema and metadata introspection tool for exploring the memory bank structure.

**Queries:**
- `labels` - List all node labels in the graph
- `count` - Count nodes by label
- `properties` - Get properties schema for a label
- `indexes` - List database indexes

**Example Usage:**
```json
{
  "tool": "introspect",
  "query": "count",
  "target": "Component",
  "repository": "my-app",
  "branch": "main"
}
```

### 4. context
Context management tool for tracking work progress and session information.

**Operations:**
- `update` - Update the current work context

**Example Usage:**
```json
{
  "tool": "context",
  "operation": "update",
  "repository": "my-app",
  "branch": "main",
  "summary": "Implemented authentication flow",
  "observation": "Added JWT token handling",
  "decision": "dec-20241210-jwt-auth"
}
```

### 5. query
Unified search and query tool supporting multiple query types.

**Query Types:**
- `context` - Query work contexts
- `entities` - Query entities by label
- `relationships` - Query related items
- `dependencies` - Query component dependencies
- `governance` - Query governing rules/decisions
- `history` - Query item history
- `tags` - Query items by tag

**Example Usage:**
```json
{
  "tool": "query",
  "type": "dependencies",
  "repository": "my-app",
  "branch": "main",
  "componentId": "comp-auth-service",
  "direction": "outgoing"
}
```

### 6. associate
Relationship creation tool for linking entities.

**Relationships:**
- `file-component` - Associate files with components
- `tag-item` - Tag items

**Example Usage:**
```json
{
  "tool": "associate",
  "relationship": "tag-item",
  "repository": "my-app",
  "branch": "main",
  "source": {
    "id": "comp-auth-service",
    "type": "Component"
  },
  "target": {
    "id": "tag-security-critical",
    "type": "tag"
  }
}
```

### 7. analyze
System analysis tool using graph algorithms.

**Algorithms:**
- `pagerank` - Identify important components
- `shortest-path` - Find path between nodes
- `k-core` - K-core decomposition for cohesion
- `louvain` - Community detection

**Example Usage:**
```json
{
  "tool": "analyze",
  "algorithm": "pagerank",
  "repository": "my-app",
  "branch": "main",
  "projectedGraphName": "component-importance",
  "nodeTableNames": ["Component"],
  "relationshipTableNames": ["DEPENDS_ON"],
  "parameters": {
    "dampingFactor": 0.85,
    "maxIterations": 20
  }
}
```

### 8. detect
Pattern detection tool for structural analysis.

**Patterns:**
- `cycles` - Detect circular dependencies (strongly connected components)
- `islands` - Detect isolated subsystems (weakly connected components)
- `path` - Find path between specific nodes

**Example Usage:**
```json
{
  "tool": "detect",
  "pattern": "cycles",
  "repository": "my-app",
  "branch": "main",
  "projectedGraphName": "cycle-detection",
  "nodeTableNames": ["Component"],
  "relationshipTableNames": ["DEPENDS_ON"]
}
```

### 9. bulk-import
Efficient bulk operations for importing multiple entities.

**Example Usage:**
```json
{
  "tool": "bulk-import",
  "repository": "my-app",
  "branch": "main",
  "entities": [
    {
      "type": "component",
      "id": "comp-service-1",
      "data": {
        "name": "Service 1",
        "kind": "service"
      }
    },
    {
      "type": "component",
      "id": "comp-service-2",
      "data": {
        "name": "Service 2",
        "kind": "service",
        "depends_on": ["comp-service-1"]
      }
    }
  ]
}
```

### 10. semantic-search
**Status:** Future capability (not currently implemented)

Placeholder for advanced semantic and full-text search functionality.

## Migration Guide

### From Legacy Tools to Unified Tools

| Legacy Tool | Unified Tool | Operation/Type |
|------------|--------------|----------------|
| `init-memory-bank` | `memory-bank` | `operation: "init"` |
| `get-metadata` | `memory-bank` | `operation: "get-metadata"` |
| `update-metadata` | `memory-bank` | `operation: "update-metadata"` |
| `add-component` | `entity` | `operation: "create", entityType: "component"` |
| `add-decision` | `entity` | `operation: "create", entityType: "decision"` |
| `add-rule` | `entity` | `operation: "create", entityType: "rule"` |
| `add-file` | `entity` | `operation: "create", entityType: "file"` |
| `add-tag` | `entity` | `operation: "create", entityType: "tag"` |
| `update-context` | `context` | `operation: "update"` |
| `get-context` | `query` | `type: "context"` |
| `get-component-dependencies` | `query` | `type: "dependencies", direction: "outgoing"` |
| `get-component-dependents` | `query` | `type: "dependencies", direction: "incoming"` |
| `get-governing-items-for-component` | `query` | `type: "governance"` |
| `get-item-contextual-history` | `query` | `type: "history"` |
| `get-related-items` | `query` | `type: "relationships"` |
| `find-items-by-tag` | `query` | `type: "tags"` |
| `list-nodes-by-label` | `query` | `type: "entities"` |
| `count-nodes-by-label` | `introspect` | `query: "count"` |
| `get-node-properties` | `introspect` | `query: "properties"` |
| `list-all-indexes` | `introspect` | `query: "indexes"` |
| `list-all-labels` | `introspect` | `query: "labels"` |
| `associate-file-with-component` | `associate` | `relationship: "file-component"` |
| `tag-item` | `associate` | `relationship: "tag-item"` |
| `pagerank` | `analyze` | `algorithm: "pagerank"` |
| `shortest-path` | `analyze` | `algorithm: "shortest-path"` |
| `k-core-decomposition` | `analyze` | `algorithm: "k-core"` |
| `louvain-community-detection` | `analyze` | `algorithm: "louvain"` |
| `strongly-connected-components` | `detect` | `pattern: "cycles"` |
| `weakly-connected-components` | `detect` | `pattern: "islands"` |

## Common Parameters

Most tools share these common parameters:
- `repository` (string, required) - Repository name
- `branch` (string, optional) - Branch name (defaults to "main")
- `clientProjectRoot` (string) - Required only for `memory-bank` init operation

## Best Practices

1. **Initialize First**: Always initialize a memory bank before performing other operations
2. **Use Consistent IDs**: Follow naming conventions (e.g., `comp-*` for components, `dec-YYYYMMDD-*` for decisions)
3. **Specify Dependencies**: When creating components, always specify their dependencies
4. **Query Before Modify**: Use query tools to understand current state before making changes
5. **Leverage Analysis**: Use analyze/detect tools periodically to maintain system health

## Error Handling

All tools return consistent error responses:
```json
{
  "error": {
    "code": -32603,
    "message": "Error description"
  }
}
```

Common error codes:
- `-32602` - Invalid parameters
- `-32603` - Internal error
- `-32000` - Server error

## Progressive Results

Tools that support streaming progress updates:
- `analyze` - All algorithms support progress updates
- `detect` - Pattern detection with progress
- `bulk-import` - Progress updates for large imports
- `query` - Some complex queries support progress

Progress notifications follow the MCP progress notification format.