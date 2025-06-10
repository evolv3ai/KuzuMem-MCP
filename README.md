# KuzuMem-MCP

A TypeScript implementation of a distributed memory bank as an MCP (Model Context Protocol) tool, storing memories in a **KùzuDB graph database** with repository and branch filtering capabilities. Branch isolation is achieved by using a graph-unique identifier for entities, enabling a centralized memory bank while allowing repository-specific and branch-specific views. Fully compliant with MCP specification for seamless integration with IDEs and AI agents.

## 🎉 Recent Updates

**Tool Consolidation Complete** - Successfully consolidated from 29 individual tools to 11 unified tools, reducing complexity while maintaining all functionality. All TypeScript compilation errors resolved and the project builds successfully.

## Key Features

- **Unified Tool Architecture** - 11 consolidated tools covering all memory bank operations
- **Thread-Safe Singleton Pattern** - Ensures each resource is instantiated only once, with proper thread safety
- **Distributed Graph Structure** - Follows the advanced memory bank specification using a KùzuDB graph
- **Repository & Branch Awareness** - All operations are contextualized by repository name and branch
- **Asynchronous Operations** - Uses async/await for better performance
- **Multiple Access Interfaces** - Access via CLI and multiple MCP server implementations
- **KùzuDB Backend** - Utilizes KùzuDB for graph-based memory storage and querying
- **Fully MCP Compliant** - All tools follow the Model Context Protocol for client integration
- **Progressive Results Streaming** - Supports streaming for long-running graph operations
- **Client Project Root Isolation** - Each client project gets its own isolated database instance

## Unified Tools

The system provides 11 unified tools that consolidate all memory bank operations:

1. **memory-bank** - Initialize and manage memory bank metadata
2. **entity** - Create, update, delete, and retrieve all entity types (components, decisions, rules, files, tags)
3. **introspect** - Explore graph schema and metadata
4. **context** - Manage work session context
5. **query** - Unified search across contexts, entities, relationships, dependencies, governance, history, and tags
6. **associate** - Create relationships between entities
7. **analyze** - Run graph algorithms (PageRank, K-Core, Louvain, Shortest Path)
8. **detect** - Detect patterns (strongly/weakly connected components)
9. **bulk-import** - Efficient bulk entity import
10. **search** - Standard search capabilities
11. **semantic-search** - Future semantic search capability (placeholder)

For detailed tool documentation, see [Unified Tools Documentation](docs/unified-tools.md).

## Documentation

- [Unified Tools Documentation](docs/unified-tools.md) - Complete guide to all unified tools with examples
- [Extended Documentation](docs/README2.md) - Architecture and advanced usage patterns
- [Graph Schema](docs/graph-schema.md) - Database schema details
- [MCP Tools Streaming Support](src/mcp/tools/README.md) - Progressive results documentation
- [Tool Consolidation Summary](docs/tool_consolidation_summary.md) - Migration from 29 to 11 tools

## Installation

```bash
# Clone the repository
git clone git@github.com:Jakedismo/KuzuMem-MCP.git
cd kuzumem-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_FILENAME="memory-bank.kuzu" 

# Server Configuration
HTTP_STREAM_PORT=3001
HOST=localhost

# Debug Logging (0=Error, 1=Warn, 2=Info, 3=Debug, 4=Trace)
DEBUG=1
```

Add to your IDE's MCP configuration:

```json
{
  "mcpServers": {
    "KuzuMem-MCP": {
      "command": "npx",
      "args": [
        "-y",
        "ts-node",
        "/path/to/kuzumem-mcp/src/mcp-stdio-server.ts"
      ],
      "env": {
        "HOST": "localhost",
        "DB_FILENAME": "memory-bank.kuzu",
        "HTTP_STREAM_PORT": "3001"
      },
      "protocol": "stdio"
    }
  }
}
```

## Quick Start

### 1. Initialize Memory Bank

```json
{
  "tool": "memory-bank",
  "operation": "init",
  "clientProjectRoot": "/path/to/your/project",
  "repository": "my-app",
  "branch": "main"
}
```

### 2. Create Entities

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

### 3. Query Dependencies

```json
{
  "tool": "query",
  "type": "dependencies",
  "repository": "my-app",
  "branch": "main",
  "componentId": "comp-auth-service",
  "direction": "dependencies"
}
```

### 4. Run Analysis

```json
{
  "tool": "analyze",
  "type": "pagerank",
  "repository": "my-app",
  "branch": "main",
  "projectedGraphName": "component-importance",
  "nodeTableNames": ["Component"],
  "relationshipTableNames": ["DEPENDS_ON"]
}
```

## Testing

```bash
# Run unit tests
npm test

# Run E2E tests
npm run test:e2e

# Run specific E2E test
npm run test:e2e:stdio
npm run test:e2e:httpstream

# Run all tests
npm run test:all
```

**Note**: Some tests may fail due to the recent refactoring, but the project builds successfully and core functionality is operational.

## Architecture

The project follows clean architecture with clear separation of concerns:

- **Database Layer** - KùzuDB embedded graph database
- **Repository Layer** - Thread-safe singletons for each entity type
- **Memory Operations Layer** - Business logic for memory operations (refactored to remove Zod dependencies)
- **Service Layer** - Core orchestration and repository management
- **MCP Layer** - Unified tool definitions, handlers, and server implementations
- **CLI Layer** - Command-line interface

For detailed architecture information, see [Extended Documentation](docs/README2.md).

## Project Status

### ✅ Completed
- Tool consolidation from 29 to 11 unified tools
- All TypeScript compilation errors resolved
- E2E testing infrastructure implemented
- Basic documentation updated
- Memory operations refactored to remove Zod dependencies
- Legacy tool compatibility layer removed

### 🚧 In Progress
- Extended documentation updates
- Test suite stabilization
- Performance optimization

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (or create issues for failing tests)
- Code follows the existing style
- New features include tests
- Documentation is updated

## Migration from Legacy Tools

If you're migrating from the legacy tool structure (29 individual tools), see the [Migration Guide](docs/unified-tools.md#migration-guide) for mapping old tool names to new unified tools.

## Future Improvements

- **Full-Text Search** - Native keyword-based search using KùzuDB's FTS extension
- **Vector Embeddings** - Semantic similarity search (pending KuzuDB vector column updates)
- **Enhanced CLI** - More intuitive command-line interface
- **Advanced Graph Algorithms** - Additional analysis capabilities
- **Complete Semantic Search** - Implementation of the semantic-search tool (currently placeholder)
