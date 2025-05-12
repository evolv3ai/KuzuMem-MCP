# KuzuMem-MCP

A TypeScript implementation of a distributed memory bank as an MCP (Model Context Protocol) tool, storing memories in a **KùzuDB graph database** with repository and branch filtering capabilities. Branch isolation is achieved by using a graph-unique identifier for entities, enabling a centralized memory bank while allowing repository-specific and branch-specific views. Fully compliant with MCP specification for seamless integration with IDEs and AI agents.

## Why it's not using the official TypeScript MCP SDK?

The official TypeScript MCP SDK is a great project and we will use it in the future. However, we are using a custom implementation for the following reasons:

- To learn the intricacies of the MCP Protocol
- To have a more flexible and custom implementation
- Wanted to start small with CLI and HTTP server implementation and then add more features later

## Features

- **Thread-Safe Singleton Pattern** - Ensures each resource is instantiated only once, with proper thread safety
- **Distributed Graph Structure** - Follows the advanced memory bank specification using a KùzuDB graph.
- **Repository & Branch Awareness** - All operations are contextualized by repository name and branch, with entities uniquely identified by a composite key (`repositoryName:branchName:itemId`).
- **Asynchronous Operations** - Uses async/await for better performance
- **Multiple Access Interfaces** - Access via a RESTful HTTP API, a CLI, and multiple MCP server implementations.
- **KùzuDB Backend** - Utilizes KùzuDB for graph-based memory storage and querying.
- **Fully MCP Compliant** - All tools follow the Model Context Protocol for client integration.
- **Modular Architecture** - Clear separation between MCP servers, service layer, memory operations, and repositories.
- **MCP/JSON-RPC Communication** - Supports:
  - HTTP with per-tool batch-oriented endpoints (`src/mcp/server.ts` via `src/app.ts` at `/mcp/tools/...`).
  - HTTP Streaming (SSE) via a unified `/mcp` endpoint for progressive results (`src/mcp-httpstream-server.ts`).
  - Stdio for direct IDE/Agent integration, supporting both batch and progressive results (`src/mcp-stdio-server.ts`).
- **Progressive Results Streaming** - Supports `tools/progress` notifications for long-running graph operations over Stdio and HTTP Streaming.
- **Graph & Traversal Tools** - Includes tools for dependency analysis, pathfinding, and graph algorithms.

## Documentation

This README provides basic setup and usage information. For detailed documentation on architecture, advanced usage patterns, and graph database capabilities, please see [Extended Documentation](docs/README2.md) and [Graph Schema](docs/graph-schema.md).
For details on tools supporting progressive results, see [MCP Tools Streaming Support](src/mcp/tools/README.md).

## Installation

```bash
# Clone the repository
git clone https://github.com/solita-internal/kuzumem-mcp
cd kuzumem-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# KùzuDB Configuration (for on-disk database)
DB_FILENAME=./memory-bank.kuzu   # Path to the KùzuDB database folder

# Server Configuration
PORT=3000                       # For the main HTTP MCP server and REST API
HTTP_STREAM_PORT=3001           # For the MCP HTTP Streaming Server
HOST=localhost

# Debug Logging for MCP Servers (0=Error, 1=Warn, 2=Info, 3=Debug, 4=Trace)
DEBUG=1
```

## Usage

### Starting the Servers

- **Main HTTP Server (for REST API & Batch MCP via per-tool endpoints):** (`src/app.ts` which uses `src/mcp/server.ts` for `/mcp/tools/...`)

  ```bash
  npm start
  ```

- **HTTP Streaming MCP Server (for MCP clients wanting SSE via unified `/mcp`):** (`src/mcp-httpstream-server.ts`)

  ```bash
  npx ts-node src/mcp-httpstream-server.ts
  ```

- **stdio MCP Server (for direct IDE/Agent integration, supports streaming):** (`src/mcp-stdio-server.ts`)

  ```bash
  npx ts-node src/mcp-stdio-server.ts
  ```

## MCP Server Implementation

All server implementations support these MCP capabilities:

- `initialize` - Protocol handshake and capability discovery.
- `tools/list` - Discovery of available tools with full schema definitions.
- `tools/call` (for stdio and the http-stream unified `/mcp` endpoint) - Execution of any listed tool, with support for `tools/progress` streaming from graph operations.
- Dedicated HTTP POST endpoints for each tool (e.g., `/mcp/tools/<tool-name>`) in the main HTTP server (`src/app.ts` via `src/mcp/server.ts`) which are batch-oriented.

### Using the CLI

The CLI allows interaction with the memory bank. **Note**: CLI commands generally require `repository` and `id` (logical item ID) arguments, and often a `branch` option.

```bash
# Initialize a memory bank for a repository (defaults to main branch)
npm run cli init my-repo

# Example: Add a component
npm run cli add-component my-repo comp-AuthService -n "AuthService" -k "service" -b "feature-branch"
```

### Using the API (HTTP MCP Server - `src/mcp/server.ts`)

The primary way to interact with tools is via specific POST endpoints on the HTTP MCP server (default port 3000).

**Base URL**: `http://localhost:3000/tools`

**Common Tool Parameters (in JSON request body)**:

- `repository`: string (repository name, e.g., "my-project")
- `branch`: string (optional, defaults to "main"; specifies the branch context for the item)
- `id`: string (the logical/user-defined ID for the item, e.g., "comp-auth", "my-rule-001")

**Tool Endpoints (POST requests):**

- `/init-memory-bank` - Body: `{ "repository": "repo-name", "branch": "main" }`
- `/get-metadata` - Body: `{ "repository": "repo-name", "branch": "main" }` (Metadata logical ID is implicitly "meta")
- `/update-metadata` - Body: `{ "repository": "repo-name", "branch": "main", "metadata": { "project": { "name": "New Name" } } }`
- `/get-context` - Body: `{ "repository": "repo-name", "branch": "main", "latest": true/false, "limit": 10 }`
- `/update-context` - Body: `{ "repository": "repo-name", "branch": "main", "id": "context-YYYY-MM-DD", "summary": "...", ... }`
- `/add-component` - Body: `{ "repository": "repo-name", "branch": "main", "id": "your-component-id", "name": "...", ... }`
- `/add-decision` - Body: `{ "repository": "repo-name", "branch": "main", "id": "your-decision-id", "name": "...", ... }`
- `/add-rule` - Body: `{ "repository": "repo-name", "branch": "main", "id": "your-rule-id", "name": "...", ... }`

- **Traversal & Graph Tools (parameters like `componentId`, `itemId`, `startNodeId` refer to the logical `id`):**
  - `/get-component-dependencies` - Body: `{ "repository", "branch"?, "componentId" }`
  - `/get-component-dependents` - Body: `{ "repository", "branch"?, "componentId" }`
  - `/get-item-contextual-history` - Body: `{ "repository", "branch"?, "itemId", "itemType": ("Component"|"Decision"|"Rule") }`
  - `/get-governing-items-for-component` - Body: `{ "repository", "branch"?, "componentId" }`
  - `/get-related-items` - Body: `{ "repository", "branch"?, "startItemId", "params": { "relationshipTypes"?, "depth"?, "direction"? } }`
  - `/shortest-path` - Body: `{ "repository", "branch"?, "startNodeId", "endNodeId", "params": { "relationshipTypes"?, "direction"? } }`
  - `/k-core-decomposition` - Body: `{ "repository", "branch"?, "k"? }`
  - `/louvain-community-detection` - Body: `{ "repository", "branch"? }`
  - `/pagerank` - Body: `{ "repository", "branch"?, "dampingFactor"?, "iterations"? }`
  - `/strongly-connected-components` - Body: `{ "repository", "branch"? }`
  - `/weakly-connected-components` - Body: `{ "repository", "branch"? }`

## Architecture

This project follows a clean architecture with separation of concerns:

### Database Layer

- Uses **KùzuDB**, an embedded graph database.
- Interaction via the `KuzuDBClient` which executes **Cypher** queries.

### Repository Layer

Thread-safe singleton repositories for each memory type and core graph entities:

- `RepositoryRepository` (for `Repository` nodes)
- `MetadataRepository`
- `ContextRepository`
- `ComponentRepository` (also handles component-centric graph queries like dependencies, dependents, related items, shortest path, and placeholders for graph algorithms)
- `DecisionRepository`
- `RuleRepository`

### Memory Operations Layer (`src/services/memory-operations/`)

A new layer introduced to encapsulate specific business logic for groups of operations, called by `MemoryService`.

- `metadata.ops.ts`
- `context.ops.ts`
- `component.ops.ts` (includes new traversal ops)
- `decision.ops.ts`
- `rule.ops.ts`
- `import-export.ops.ts`
- `graph.ops.ts` (for graph algorithms and generic traversals)

### Service Layer

- `MemoryService` - Core business logic, now acts as an orchestrator, delegating to Memory Operations Layer functions. Manages repository instances.

### MCP Layer (`src/mcp/`)

- **Tool Definitions (`src/mcp/tools/`)**: Modular tool definitions ([see details](src/mcp/tools/README.md)) with full MCP schema compatibility. Includes new graph and traversal tools.
- **Tool Handlers (`src/mcp/tool-handlers.ts`)**: Centralized logic for executing any defined MCP tool, shared by different server implementations.
- **Streaming Support Infrastructure (`src/mcp/streaming/`, `src/mcp/services/tool-execution.service.ts`)**:
  - `progress-handler.ts`: Defines `ProgressHandler` and `ProgressTransport` interfaces for managing streaming.
  - `stdio-transport.ts`: Implements `ProgressTransport` for stdio.
  - `http-transport.ts`: Implements `ProgressTransport` for HTTP SSE.
  - `tool-execution.service.ts`: Orchestrates tool calls with progress handling.
  - `operations/`: Directory containing Operation Classes for streamable tools.
- **Server Implementations**:
  - `src/mcp/server.ts` (`MemoryMcpServer`): Provides MCP via Express.js with dedicated batch-oriented POST endpoints per tool (typically mounted under `/mcp/tools/...` by `src/app.ts`).
  - `src/mcp-httpstream-server.ts`: Standalone HTTP server with a unified `/mcp` endpoint supporting Server-Sent Events (SSE) for streaming `tools/progress` and final responses.
  - `src/mcp-stdio-server.ts`: Stdio-based server supporting both batch and streaming (`tools/progress`) responses for `tools/call`.
- **Types (`src/mcp/types/`)**: Shared MCP type definitions (e.g., `McpTool`, `ToolHandler`).

### CLI Layer

Commander-based CLI with async operation support, interacting with `MemoryService`.

## KùzuDB Graph Schema

The memory bank uses a graph structure in KùzuDB. Refer to [Graph Schema](docs/graph-schema.md) for the detailed node and relationship definitions.

Key aspects:

- **Nodes**: `Repository`, `Metadata`, `Context`, `Component`, `Decision`, `Rule`.
- **Primary Keys**: `Repository` nodes use `id` (format: `name:branch`). Other entities (`Metadata`, `Context`, `Component`, `Decision`, `Rule`) use a `graph_unique_id` (format: `repositoryName:itemBranch:logicalId`) as their `PRIMARY KEY` to ensure uniqueness across repositories and branches. They also store their logical `id` and `branch` as separate properties.
- **Relationships**: Various `HAS_...` and semantic relationships like `DEPENDS_ON`, `CONTEXT_OF`, etc., link these nodes.

## License

MIT

## Contributing

Please read the contributing guidelines before submitting a pull request.

## Future Improvements

- **Enhance CLI** to support branch selection for all relevant commands more explicitly.
- **Refine Graph Algorithm Streaming**: Further refactor `MemoryService` and Kùzu calls within Operation Classes to provide more granular progress for algorithms where KùzuDB allows iterative result yielding.
- **Add Full-Text Search (FTS) Capabilities** - Planned implementation to enable efficient keyword-based search across all memory items using KùzuDB's FTS extension.
- **Vector Embeddings Support** - Planned implementation; would enable semantic similarity search and NLP-based memory retrieval using KùzuDB's vector capabilities.
- **Official TypeScript MCP SDK Migration** - Consider migrating to the official TypeScript MCP SDK to benefit from the latest features and community support, now that foundational understanding of the protocol is established.
