# Advanced Memory Bank MCP Tool

A TypeScript implementation of a distributed memory bank as an MCP (Model Context Protocol) tool, storing memories in a **KùzuDB graph database** with repository and branch filtering capabilities. Branch isolation enables using a centralized memory bank for all repositories, while still allowing each repository to have its own branch-specific memories. Fully compliant with MCP specification for seamless integration with IDEs and AI agents.

## Features

- **Thread-Safe Singleton Pattern** - Ensures each resource is instantiated only once, with proper thread safety
- **Distributed YAML Structure** - Follows the advanced memory bank specification
- **Repository & Branch Filtering** - All operations are isolated by repository name and branch
- **Asynchronous Operations** - Uses async/await for better performance
- **Both API & CLI** - Access via REST API (MCP-compliant POST endpoints) or command line
- **KùzuDB Backend** - Utilizes KùzuDB for graph-based memory storage and querying.
- **Fully MCP Compliant** - All tools follow the Model Context Protocol for IDE integration
- **Modular Architecture** - Clear separation between MCP servers, service layer, memory operations, and repositories.
- **MCP/JSON-RPC Communication** - Supports HTTP, HTTP Streaming, and stdio communication for versatile integration
- **New Graph & Traversal Tools** - Includes tools for dependency analysis, pathfinding, and (placeholders for) graph algorithms.

## Documentation

This README provides basic setup and usage information. For detailed documentation on architecture, advanced usage patterns, and graph database capabilities, please see [Extended Documentation](docs/README2.md).

## Installation

```bash
# Clone the repository
git clone https://github.com/solita-internal/advanced-memory-tool-mcp
cd advanced-memory-tool-mcp

# Install dependencies
npm install

# Build the project
npm run build

# KùzuDB setup is handled internally by the application.
# Ensure KùzuDB is accessible if run as a separate server, or it will use an in-process/on-disk file.
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

- **Main HTTP MCP Server (for REST API & some MCP integrations):**

  ```bash
  npm start
  ```

- **HTTP Streaming MCP Server (for MCP clients wanting SSE):**

  ```bash
  npx ts-node src/mcp-httpstream-server.ts
  ```

- **stdio MCP Server (for direct IDE/Agent integration):**

  ```bash
  npx ts-node src/mcp-stdio-server.ts
  ```

## MCP Server Implementation

This project implements the Model Context Protocol specification with three server types, all refactored to use a shared tool handling mechanism:

### HTTP Server (`src/mcp/server.ts`)

The standard server exposes MCP tool operations via dedicated POST endpoints (e.g., `/tools/init-memory-bank`, `/tools/get-component-dependencies`). It also serves general MCP metadata at `/server` and `/tools` (for tool listing).

### HTTP Streaming Server (`src/mcp-httpstream-server.ts`)

Implements the MCP protocol with HTTP streaming support via a unified `/mcp` endpoint, following the TypeScript SDK approach. Enables real-time feedback and progressive results for MCP clients that support it.

### stdio Server (`src/mcp-stdio-server.ts`)

A stdio-based implementation that follows JSON-RPC 2.0 for direct integration with AI tools and IDEs. This server was refactored to use a centralized tool handler for improved modularity.

All server implementations support these MCP capabilities:

- `initialize` - Protocol handshake and capability discovery.
- `tools/list` - Discovery of available tools with full schema definitions (see `src/mcp/tools/index.ts` for the complete list).
- `tools/call` (for stdio and http-stream unified endpoint) - Execution of any listed tool.
- Dedicated HTTP POST endpoints for each tool (e.g., `/tools/<tool-name>`) in the main HTTP server.

### Debug Logging

Set the `DEBUG` environment variable (0-4) to control log verbosity for the MCP servers.

### Using with Coding IDEs (Example: Windsurf)

Register the `mcp-stdio-server.ts` with your IDE. Example configuration:

```json
{
  "mcpServers": {
    "advanced-memory-bank-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "ts-node",
        "/absolute_path/to/advanced-memory-tool/src/mcp-stdio-server.ts" // or "/absolute_path/to/advanced-memory-tool/src/index.ts" or "/absolute_path/to/advanced-memory-tool/src/mcp-http-stream-server.ts"
      ],
      "env": {
        "DB_FILENAME": "./memory-bank.kuzu",
        "DEBUG": "1"
      },
      "transportType": "stdio" // or "http" or "http-stream"
    }
  }
}
```

### Agent Rules for IDE Integration

Custom rules in the `rules/` directory guide AI agents on leveraging the memory bank effectively.

### Using the CLI

The CLI allows interaction with the memory bank. **Note**: CLI commands call `MemoryService` methods directly; ensure `branch` options are used where applicable if not defaulting to "main".

```bash
# Initialize a memory bank for a repository (defaults to main branch)
npm run cli init my-repo
# To specify a branch with tools that now require it via MemoryService:
# (CLI needs updates to pass branch to all relevant service calls if not using default)

# Example: Add a component (branch defaults to main in CLI definition)
npm run cli add-component my-repo comp-AuthService -n "AuthService" -k "service" -b "feature-branch"

# Other commands: export, import, add-context, add-decision, add-rule (see below)
```

(Existing CLI commands like `export`, `import`, `add-context`, `add-decision`, `add-rule` are available. Their internal calls to `MemoryService` have been updated.)

### Using the API (HTTP MCP Server - `src/mcp/server.ts`)

The primary way to interact with tools is via specific POST endpoints on the HTTP MCP server (default port 3000).

**Base URL**: `http://localhost:3000/tools`

**Common Tool Parameters (in JSON request body)**:

- `repository`: string (repository name)
- `branch`: string (optional, defaults to "main" in most service calls)

**Tool Endpoints (POST requests):**

- `/init-memory-bank` - Body: `{ "repository": "repo-name", "branch": "main" }`
- `/get-metadata` - Body: `{ "repository": "repo-name", "branch": "main" }`
- `/update-metadata` - Body: `{ "repository": "repo-name", "branch": "main", "metadata": { ... } }`
- `/get-context` - Body: `{ "repository": "repo-name", "branch": "main", "latest": true/false, "limit": 10 }`
- `/update-context` - Body: `{ "repository": "repo-name", "branch": "main", "summary": "...", ... }`
- `/add-component` - Body: `{ "repository": "repo-name", "branch": "main", "id": "yaml_id", "name": "...", ... }`
- `/add-decision` - Body: `{ "repository": "repo-name", "branch": "main", "id": "yaml_id", "name": "...", ... }`
- `/add-rule` - Body: `{ "repository": "repo-name", "branch": "main", "id": "yaml_id", "name": "...", ... }`

- **New Traversal & Graph Tools:**
  - `/get-component-dependencies` - Body: `{ "repository", "branch"?, "componentId", "depth"? }`
  - `/get-component-dependents` - Body: `{ "repository", "branch"?, "componentId", "depth"? }`
  - `/get-item-contextual-history` - Body: `{ "repository", "branch"?, "itemId", "itemType": ("Component"|"Decision"|"Rule") }`
  - `/get-governing-items-for-component` - Body: `{ "repository", "branch"?, "componentId" }`
  - `/get-related-items` - Body: `{ "repository", "branch"?, "itemId", "params": { "relationshipTypes"?, "depth"?, "direction"? } }`
  - `/shortest-path` - Body: `{ "repository", "branch"?, "startNodeId", "endNodeId", "params": { "relationshipTypes"?, "direction"? } }`
  - `/k-core-decomposition` - Body: `{ "repository", "branch"?, "k"? }`
  - `/louvain-community-detection` - Body: `{ "repository", "branch"? }`
  - `/pagerank` - Body: `{ "repository", "branch"?, "dampingFactor"?, "iterations"? }`
  - `/strongly-connected-components` - Body: `{ "repository", "branch"? }`
  - `/weakly-connected-components` - Body: `{ "repository", "branch"? }`

(Note: The API layer previously mentioned in the README for direct entity manipulation like `/api/memory/repositories/:repository/components/:id` might be superseded or coexist with these MCP tool endpoints. The focus here is on MCP tool interaction.)

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
- `YamlService` - Serialization/deserialization of YAML content.

### MCP Layer (`src/mcp/`)

- **Tool Definitions (`src/mcp/tools/`)**: Modular tool definitions with full MCP schema compatibility. Includes new graph and traversal tools.
- **Tool Handlers (`src/mcp/tool-handlers.ts`)**: Centralized logic for executing any defined MCP tool, shared by different server implementations.
- **Server Implementations**:
  - `src/mcp/server.ts`: Express-based HTTP server with dedicated POST endpoints per tool.
  - `src/mcp-httpstream-server.ts`: HTTP streaming server with a unified `/mcp` endpoint.
  - `src/mcp-stdio-server.ts`: Stdio-based server.
- **Types (`src/mcp/types/`)**: Shared MCP type definitions.

### CLI Layer

Commander-based CLI with async operation support, interacting with `MemoryService`.

## KùzuDB Graph Schema

The memory bank now uses a graph structure in KùzuDB. Refer to `graph-schema.md` for the detailed node and relationship definitions, including a Mermaid diagram.

Key aspects:

- **Nodes**: `Repository`, `Metadata`, `Context`, `Component`, `Decision`, `Rule`.
- **Relationships**: `HAS_METADATA`, `HAS_CONTEXT`, `HAS_COMPONENT`, `HAS_DECISION`, `HAS_RULE`, `DEPENDS_ON`, `CONTEXT_OF`, `CONTEXT_OF_DECISION`, `CONTEXT_OF_RULE`, `DECISION_ON`.
- `Repository` nodes use a synthetic primary key: `name + ':' + branch` for branch isolation.

## License

MIT

## Contributing

Please read the contributing guidelines before submitting a pull request.

## Future Improvements

- Enhance CLI to support branch selection for all relevant commands more explicitly.
- **Variable naming convention updates, some of the used table variables are based on legacy YAML-file/SQLite based version**
- **Add Full-Text Search (FTS) Capabilities** - Planned implementation to enable efficient keyword-based search across all memory items using KùzuDB's FTS extension.
- **Vector Embeddings Support** - Under consideration pending clear use cases; would enable semantic similarity search and NLP-based memory retrieval using KùzuDB's vector capabilities.
