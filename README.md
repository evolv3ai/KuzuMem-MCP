# KuzuMem-MCP

A TypeScript implementation of a distributed memory bank as an MCP (Model Context Protocol) tool, storing memories in a **KùzuDB graph database** with repository and branch filtering capabilities. Branch isolation is achieved by using a graph-unique identifier for entities, enabling a centralized memory bank while allowing repository-specific and branch-specific views. Fully compliant with MCP specification for seamless integration with IDEs and AI agents.

## Key Features

- **🧠 AI-Powered Memory Optimization** - Advanced reasoning models (OpenAI o1/o3, Claude) with MCP sampling for intelligent memory management
- **🛡️ Production-Ready Safety** - Automatic snapshot system with guaranteed rollback capabilities
- **🎯 Context-Aware Intelligence** - MCP sampling analyzes actual memory state for adaptive optimization strategies
- **🔧 Unified Tool Architecture** - 12 consolidated tools covering all memory bank operations
- **🧵 Thread-Safe Singleton Pattern** - Ensures each resource is instantiated only once, with proper thread safety
- **📊 Distributed Graph Structure** - Follows the advanced memory bank specification using a KùzuDB graph
- **🌿 Repository & Branch Awareness** - All operations are contextualized by repository name and branch
- **⚡ Asynchronous Operations** - Uses async/await for better performance
- **🔌 Multiple Access Interfaces** - Access via CLI and multiple MCP server implementations
- **💾 KùzuDB Backend** - Utilizes KùzuDB for graph-based memory storage and querying
- **✅ Fully MCP Compliant** - All tools follow the Model Context Protocol for client integration
- **📡 Progressive Results Streaming** - Supports streaming for long-running graph operations
- **🏠 Client Project Root Isolation** - Each client project gets its own isolated database instance
- **🧠 High-Reasoning Analysis** - Leverages OpenAI HIGH reasoning and Anthropic extended thinking for memory optimization
- **🗑️ Safe Bulk Operations** - Advanced bulk deletion with dependency validation and dry-run capabilities

## Unified Tools

The system currently broadcasts **12** unified tools that consolidate all memory bank operations:

1. **memory-bank** - Initialize and manage memory bank metadata
2. **entity** - Create, update, delete, and retrieve all entity types (components, decisions, rules, files, tags)
3. **introspect** - Explore graph schema and metadata
4. **context** - Manage work session context
5. **query** - Unified search across contexts, entities, relationships, dependencies, governance, history, and tags
6. **associate** - Create relationships between entities
7. **analyze** - Run graph algorithms (PageRank, K-Core, Louvain, Shortest Path)
8. **detect** - Detect patterns (strongly/weakly connected components)
9. **bulk-import** - Efficient bulk entity import
10. **search** - Full-text search across all entity types with KuzuDB FTS integration
11. **delete** - Safe deletion of entities with dependency validation and bulk operations
12. **memory-optimizer** - 🧠 **AI-powered core memory optimization with MCP sampling, snapshots, and rollback**

For detailed tool documentation, see [Unified Tools Documentation](docs/unified-tools.md).

## Documentation

- [Extended Documentation](docs/README2.md) - Architecture and advanced usage patterns
- [Graph Schema](docs/schema_evolution.md) - Database schema details

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

Create a `.env` file in the root directory (copy from `.env.example`):

```env
# Database Configuration
DB_FILENAME="memory-bank.kuzu"

# Server Configuration
HTTP_STREAM_PORT=3001
HOST=localhost

# Debug Logging (0=Error, 1=Warn, 2=Info, 3=Debug, 4=Trace)
DEBUG=1

# Core Memory Optimization Agent - AI Provider Configuration
# Required for memory optimization features
OPENAI_API_KEY=sk-your-openai-api-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here

# Optional: Custom API endpoints
# OPENAI_BASE_URL=https://api.openai.com/v1
# ANTHROPIC_BASE_URL=https://api.anthropic.com
```

### Core Memory Optimization Setup

The Core Memory Optimization Agent requires API keys for high-reasoning models:

- **OpenAI**: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Anthropic**: Get your API key from [Anthropic Console](https://console.anthropic.com/)

**Supported Models:**

- **OpenAI**: `o3`, `o1-mini` (with HIGH reasoning, 32,768 tokens)
- **Anthropic**: `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022` (with extended thinking, 2,048 tokens)

For detailed setup instructions, see [Core Memory Optimization Setup Guide](CORE_MEMORY_OPTIMIZATION_SETUP.md).

Add to your IDE's MCP configuration:

```json
{
  "mcpServers": {
    "KuzuMem-MCP": {
      "command": "npx",
      "args": ["-y", "ts-node", "/absolute/path/to/kuzumem-mcp/src/mcp-stdio-server.ts"],
      "env": {
        "PORT": "3000",
        "HOST": "localhost",
        "DB_FILENAME": "memory-bank.kuzu",
        "HTTP_STREAM_PORT": "3001"
      }
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

## 🧠 Core Memory Optimization Agent

The **Core Memory Optimization Agent** provides AI-powered memory graph optimization with advanced reasoning capabilities and production-ready safety features:

### Features

- **🧠 High-Reasoning Analysis**: Uses OpenAI o1/o3 (HIGH reasoning) or Claude (extended thinking) for intelligent memory analysis
- **🎯 MCP Sampling**: Context-aware prompts that adapt to actual memory state and project characteristics
- **🛡️ Automatic Snapshots**: Production-ready safety with automatic backup before optimization
- **🔄 Guaranteed Rollback**: Complete state restoration with transactional safety
- **⚖️ Safe Optimization**: Conservative, balanced, and aggressive strategies with safety validation
- **🔍 Stale Entity Detection**: Identifies outdated entities based on age and usage patterns
- **🔗 Redundancy Removal**: Finds and consolidates duplicate or redundant entities
- **📊 Dependency Optimization**: Optimizes relationship chains while preserving integrity
- **👀 Dry-Run Mode**: Preview optimizations without making changes
- **📈 Project Intelligence**: Automatic project maturity, activity, and complexity analysis

### Quick Start

#### 1. Analyze Memory Graph (with MCP Sampling)

```json
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-app",
  "branch": "main",
  "llmProvider": "openai",
  "model": "o1-mini",
  "strategy": "conservative",
  "enableMCPSampling": true,
  "samplingStrategy": "representative"
}
```

#### 2. Preview Optimization (Dry Run)

```json
{
  "tool": "memory-optimizer",
  "operation": "optimize",
  "repository": "my-app",
  "branch": "main",
  "dryRun": true,
  "strategy": "conservative"
}
```

#### 3. Execute Optimization (with Automatic Snapshot)

```json
{
  "tool": "memory-optimizer",
  "operation": "optimize",
  "repository": "my-app",
  "branch": "main",
  "dryRun": false,
  "confirm": true,
  "strategy": "conservative"
}
```

#### 4. List Available Snapshots

```json
{
  "tool": "memory-optimizer",
  "operation": "list-snapshots",
  "repository": "my-app",
  "branch": "main"
}
```

#### 5. Rollback to Previous State

```json
{
  "tool": "memory-optimizer",
  "operation": "rollback",
  "repository": "my-app",
  "branch": "main",
  "snapshotId": "snapshot-1703123456789-xyz789"
}
```

### Optimization Strategies

- **Conservative**: Max 5 deletions, 6-month stale threshold (recommended for production)
- **Balanced**: Max 20 deletions, 3-month stale threshold (recommended for development)
- **Aggressive**: Max 50 deletions, 1-month stale threshold (use with caution)

### MCP Sampling Strategies

- **Representative**: Balanced sample across all entity types (default)
- **Problematic**: Focus on stale, disconnected, or deprecated entities
- **Recent**: Sample newly created entities (< 30 days) for safety analysis
- **Diverse**: Ensure representation from all entity types for complex systems

### Safety Features

- **🛡️ Automatic Snapshots**: Created before every optimization (unless dry-run)
- **🔄 Transactional Rollback**: Complete state restoration with database consistency
- **✅ Validation System**: Snapshot integrity checks before rollback operations
- **📊 Context-Aware Safety**: Activity-level and complexity-based safety measures

For complete setup and usage instructions, see:

- [Core Memory Optimization Setup Guide](CORE_MEMORY_OPTIMIZATION_SETUP.md)
- [Snapshot System Usage Guide](SNAPSHOT_SYSTEM_USAGE.md)
- [MCP Sampling Usage Guide](MCP_SAMPLING_USAGE.md)

## Testing

```bash
# Run unit tests
npm test

# Run E2E tests (requires API keys)
npm run test:e2e

# Run specific E2E tests
npm run test:e2e:stdio
npm run test:e2e:httpstream

# Run memory optimizer E2E tests
npm run test:e2e -- --testNamePattern="Memory Optimizer E2E Tests"

# Run all tests
npm run test:all
```

### E2E Test Requirements

For memory optimizer E2E tests, set environment variables:

```bash
export OPENAI_API_KEY="your-actual-openai-api-key"
export ANTHROPIC_API_KEY="your-actual-anthropic-api-key"
```

**Note**: All core functionality is operational with comprehensive E2E test coverage for both stdio and HTTP stream protocols.

## Architecture

KuzuMem-MCP follows **official MCP TypeScript SDK patterns** with clean architecture:

```text
┌─────────────────────────────────────────────────────────────┐
│                    MCP Protocol Layer                       │
├─────────────────────────────────────────────────────────────┤
│     HTTP Stream Server     │      Stdio Server             │
│   (StreamableHTTPTransport) │   (StdioTransport)            │
├─────────────────────────────────────────────────────────────┤
│                    Tool Handlers                            │
├─────────────────────────────────────────────────────────────┤
│                   Memory Service                            │
├─────────────────────────────────────────────────────────────┤
│                   Repository Layer                          │
├─────────────────────────────────────────────────────────────┤
│                    KuzuDB Client                            │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **MCP Servers**: Official SDK implementations using `McpServer` with HTTP Stream and Stdio transports
- **Tool Handlers**: Business logic for each MCP tool with simplified context handling
- **Memory Service**: Core orchestration and repository management
- **Repository Layer**: Thread-safe singletons for each entity type
- **Database Layer**: KùzuDB embedded graph database

### Official SDK Compliance

✅ **Session Management**: Uses built-in SDK session handling
✅ **Tool Registration**: Uses official `tool()` method with Zod validation
✅ **Transport Handling**: Leverages SDK transport implementations
✅ **Error Handling**: Follows SDK error patterns and best practices

For detailed architecture information, see [Extended Documentation](docs/README2.md).

## Agent Development Loop (Rules-Enforced)

When both the repository-level "Always-Applied Workspace Rules" (`project_config_updated.md`) and the short-term workflow rules (`workflow_state_updated.mdc`) are active, every IDE or AI agent that communicates with **KuzuMem-MCP** must follow the five-phase finite-state loop below. Each transition is observable via the unified `context` tool and is backed by mandatory MCP calls that keep the graph database in sync and governance rules enforced.

1. **ANALYZE** – Pull the latest context, inspect 1-hop neighbourhood, and optionally execute a PageRank analysis. Produce a high-level problem statement.
2. **BLUEPRINT** – Draft a numbered implementation plan and persist it as a `Decision` entity (`status: proposed`, tag `architecture`). Wait for explicit user approval.
3. **CONSTRUCT** – Execute plan steps, apply code edits, and immediately mirror changes through `entity`, `associate`, and `context` tool calls while honouring dependency & tagging rules.
4. **VALIDATE** – Run the full test & linter suite. If green, update the `Decision` to `implemented`; if red, log context and loop back to CONSTRUCT.
5. **ROLLBACK** – Automatically triggered on unrecoverable errors, reverting partial work before returning to ANALYZE.

### Phase Diagram

```mermaid
stateDiagram-v2
    [*] --> ANALYZE
    ANALYZE --> BLUEPRINT: blueprint drafted
    BLUEPRINT --> CONSTRUCT: approved
    CONSTRUCT --> VALIDATE: steps complete
    VALIDATE --> DONE: tests pass
    VALIDATE --> CONSTRUCT: tests fail
    CONSTRUCT --> ROLLBACK: unrecoverable error
    ROLLBACK --> ANALYZE
```

## License

Apache-2.0

## Contributing

Contributions are welcome! Please ensure:

- All tests pass (or create issues for failing tests)
- Code follows the existing style
- New features include tests
- Documentation is updated

## Future Improvements

- **Vector Embeddings** - Semantic similarity search (pending KuzuDB vector column updates)
- **Advanced Graph Algorithms** - Additional analysis capabilities
- **Graph Schema Updates** - Based on how well the automated development loop works, the graph schema may need to be updated to support new features
- **Complete Semantic Search** - Implementation of the semantic-search tool (currently placeholder - KuzuDB Vector Indexes are immutable and would make developing this feature difficult since updating memories wouldn't update the vector indexes)

## MCP Review

This MCP is verified by MCP Review

<https://mcpreview.com/mcp-servers/Jakedismo/KuzuMem-MCP>

## Automatic Codereviews with Codrabbit

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Jakedismo/KuzuMem-MCP?utm_source=oss&utm_medium=github&utm_campaign=Jakedismo%2FKuzuMem-MCP&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
