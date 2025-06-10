# 🧠 KuzuMem-MCP

> **Enhance AI coding assistants with persistent, graph-based knowledge**

The KuzuMem-MCP server provides a structured approach to storing and retrieving repository knowledge, enabling AI coding assistants to maintain context across sessions and branches. Recently consolidated from 29 individual tools to 11 unified tools for improved maintainability and user experience.

## 🎯 Purpose & Goals

This project addresses several key challenges in AI-assisted development:

- **Maintain persistent knowledge** across coding sessions
- **Support branch-based knowledge organization** for development workflows
- **Identify relationships** between components, decisions, and rules
- **Provide graph-based memory storage** for enhanced context retrieval
- **Enable AI tools** to understand project architecture
- **Client isolation** for supporting multiple client projects with dedicated memory banks
- **Unified tool interface** for simplified integration and usage

## ✨ Key Benefits

### 📚 Knowledge Persistence

This memory bank enables AI assistants to:

- Retain architectural decisions and their context
- Track component relationships across your codebase
- Build knowledge incrementally over multiple sessions

### 🌐 Graph-Based Storage

Using **KùzuDB** as a graph database provides:

- Relationship-aware queries between components
- Context retrieval across connected entities
- Structural representation of system architecture

### 🔀 Branch Isolation

The implementation supports branch-based workflows:

- Separate memory contexts for each branch
- Branch-specific development knowledge
- Clean context switching when changing branches

### 🧰 Unified Tool Architecture

The recent consolidation provides:

- Reduced complexity from 29 to 11 tools
- Consistent parameter patterns across all tools
- Simplified learning curve for new users
- Better maintainability and testing

### 🏢 Client Project Isolation

The enhanced architecture now supports:

- Per-client database isolation for multi-project support
- Dedicated memory banks stored within each client's project root
- Lazy database initialization that only happens when explicitly requested
- Improved database path handling with proper error messages

## 🔍 Advanced Graph Queries & Traversals

The graph-based architecture enables powerful queries that would be difficult or impossible with traditional databases:

### 1. Impact Analysis

```bash
# Find all components that would be affected by changing the Authentication service
$ curl -X POST http://localhost:3000/tools/query \
  -H "Content-Type: application/json" \
  -d '{
    "type": "dependencies",
    "clientProjectRoot": "/path/to/project", 
    "repository": "my-app", 
    "branch": "main", 
    "componentId": "comp-AuthService",
    "direction": "dependents"
  }'

# Result shows not just direct users of the Auth service, but the entire dependency chain
{
  "type": "dependencies",
  "componentId": "comp-AuthService",
  "direction": "dependents",
  "components": [
    {"id": "comp-AdminPanel", "name": "Admin Panel", "depends_on": ["comp-AdminAPI"]},
    {"id": "comp-UserProfile", "name": "User Profile", "depends_on": ["comp-AuthService"]},
    {"id": "comp-PaymentService", "name": "Payment Service", "depends_on": ["comp-AuthService"]}
  ]
}
```

### 2. Architectural Decision Context

```bash
# Find all decisions and rules affecting the UserProfile component
$ curl -X POST http://localhost:3000/tools/query \
  -H "Content-Type: application/json" \
  -d '{
    "type": "governance",
    "clientProjectRoot": "/path/to/project",
    "repository": "my-app", 
    "branch": "main", 
    "componentId": "comp-UserProfile"
  }'

# Results include decisions, rules and when/why they were made
{
  "type": "governance",
  "componentId": "comp-UserProfile",
  "decisions": [
    {"id": "dec-20250315-GDPR", "name": "GDPR Compliance Strategy", "date": "2025-03-15", "context": "EU regulations required ..."},
    {"id": "dec-20250401-Caching", "name": "Profile Data Caching Policy", "date": "2025-04-01", "context": "Performance issues in production..."}
  ],
  "rules": [
    {"id": "rule-security-pii", "name": "PII Data Handling", "content": "All personally identifiable information must be..."},
    {"id": "rule-frontend-state", "name": "Frontend State Management", "content": "User state should be managed using..."}
  ]
}
```

### 3. Knowledge Graph Exploration

```bash
# Find the shortest relationship path between two components
$ curl -X POST http://localhost:3000/tools/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "type": "shortest-path",
    "repository": "my-app", 
    "branch": "main", 
    "projectedGraphName": "component-paths",
    "nodeTableNames": ["Component"],
    "relationshipTableNames": ["DEPENDS_ON"],
    "startNodeId": "comp-AdminPanel", 
    "endNodeId": "comp-DataStore"
  }'

# Results show how components are connected through the system
{
  "type": "shortest-path",
  "status": "complete",
  "pathFound": true,
  "path": ["comp-AdminPanel", "comp-AdminAPI", "comp-DataAccess", "comp-DataStore"],
  "pathLength": 4
}
```

### 4. Architectural Health Analysis

```bash
# Identify critical components using PageRank algorithm
$ curl -X POST http://localhost:3000/tools/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pagerank",
    "repository": "my-app", 
    "branch": "main",
    "projectedGraphName": "component-importance",
    "nodeTableNames": ["Component"],
    "relationshipTableNames": ["DEPENDS_ON"]
  }'

# Results highlight components that are most fundamental to the system
{
  "type": "pagerank",
  "status": "complete",
  "nodes": [
    {"id": "comp-DataStore", "pagerank": 0.89},
    {"id": "comp-AuthService", "pagerank": 0.76},
    {"id": "comp-APIGateway", "pagerank": 0.73}
  ]
}
```

### 5. System Structure Discovery

```bash
# Detect natural system boundaries using community detection
$ curl -X POST http://localhost:3000/tools/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "type": "louvain",
    "repository": "my-app", 
    "branch": "main",
    "projectedGraphName": "system-modules",
    "nodeTableNames": ["Component"],
    "relationshipTableNames": ["DEPENDS_ON"]
  }'

# Results group components into natural subsystems
{
  "type": "louvain",
  "status": "complete",
  "nodes": [
    {"id": "comp-AuthService", "communityId": 0},
    {"id": "comp-UserProfile", "communityId": 0},
    {"id": "comp-PermissionManager", "communityId": 0},
    {"id": "comp-DataStore", "communityId": 1},
    {"id": "comp-DataAccess", "communityId": 1},
    {"id": "comp-CacheLayer", "communityId": 1}
  ]
}
```

### 6. Architectural Weakness Detection

```bash
# Find circular dependencies that may indicate design problems
$ curl -X POST http://localhost:3000/tools/detect \
  -H "Content-Type: application/json" \
  -d '{
    "type": "strongly-connected",
    "repository": "my-app", 
    "branch": "main",
    "projectedGraphName": "circular-deps",
    "nodeTableNames": ["Component"],
    "relationshipTableNames": ["DEPENDS_ON"]
  }'

# Results show components with circular dependencies
{
  "type": "strongly-connected",
  "status": "complete",
  "components": [
    {
      "componentId": 0,
      "nodes": ["comp-UserService", "comp-NotificationService", "comp-UserPreferences"]
    }
  ],
  "totalComponents": 1
}
```

These examples demonstrate how the graph-based architecture enables complex queries about component relationships, architectural decisions, and system structure that would be difficult or impossible with traditional databases. AI assistants can use these insights to provide more informed guidance about code changes, architectural evolution, and potential design weaknesses.

### Key Schema Design Elements

1. **Branch-Aware Repository Nodes**

   - Repository nodes use a synthetic primary key (`id = name + ':' + branch`)
   - This enables complete isolation of memory between branches
   - All operations filter by both repository name and branch

2. **Rich Relationship Types**

   - **HAS\_\* relationships** - Connect repositories to memory entities
   - **DEPENDS_ON** - Track component dependencies (self-referential)
   - **CONTEXT_OF\*** - Link context to components, decisions, and rules
   - **DECISION_ON** - Connect decisions to affected components

3. **Graph Traversal Capabilities**
   - **Multi-hop queries** - Find indirect relationships between components
   - **Ancestor/descendant tracking** - Trace component dependencies or dependents
   - **Path finding** - Discover relationships between seemingly unrelated components
   - **Relationship analysis** - Identify critical components using graph algorithms

This graph structure enables the system to answer complex questions that would be difficult with a traditional database, such as "What components might be affected if I change this service?" or "What context led to this architectural decision?"

## 💻 MCP Integration

This server implements Model Context Protocol standards:

- **Full tool schema definitions** for IDE auto-discovery
- **Unified tool interface** with consistent parameter patterns
- **Multiple transport protocols** (HTTP, HTTP Streaming, stdio)
- **Progressive result streaming** for long-running operations
- **Error handling and status reporting**
- **Separation of protocol and business logic**

## 🚀 Technical Features

- **🧵 Thread-Safe Singleton Pattern** - Ensures each resource is instantiated once
- **📂 Distributed Memory Structure** - Follows memory bank specification
- **🔍 Repository & Branch Filtering** - Operations isolated by repository and branch
- **⚡ Asynchronous Operations** - Uses async/await for performance
- **🔌 Multiple Access Methods** - REST API, CLI, and MCP integration
- **📊 KùzuDB Backend** - Graph database for relationship queries
- **🧩 Modular Architecture** - Clean separation between layers
- **🔄 JSON-RPC Communication** - Standard protocol support
- **🗺️ Graph Traversal Tools** - Path finding and dependency analysis
- **🔐 Client Project Isolation** - Each client project gets its own memory bank
- **🎯 Unified Tool Architecture** - 11 consolidated tools from original 29

## 📅 Feature Timeline

### Spring 2025 - KùzuDB Migration

- ✅ **Graph Database Migration** - Transitioned from SQLite to KùzuDB
- ✅ **Branch Isolation** - Implemented repository synthetic IDs (`name + ':' + branch`)
- ✅ **Relationship Modeling** - Created node and relationship tables in graph structure
- ✅ **Cypher Query Support** - Replaced SQL queries with Cypher for graph traversal
- ✅ **Service/Repository Refactoring** - Updated all layers to support branch awareness
- ✅ **Graph Traversal Tools** - Added component dependency and relationship tools
- ✅ **Client Project Isolation** - Implemented per-client memory banks
- ✅ **Repository Factory Pattern** - Centralized repository creation with proper caching
- ✅ **Repository Provider** - Added intermediary between services and repositories
- ✅ **Lazy Database Initialization** - Databases only created when explicitly requested
- ✅ **Improved Error Handling** - Better error messages for database path issues

### Fall 2025 - Tool Consolidation

- ✅ **Tool Consolidation** - Reduced from 29 individual tools to 11 unified tools
- ✅ **Unified Parameter Patterns** - Consistent interface across all tools
- ✅ **Memory Operations Refactoring** - Removed Zod dependencies from core operations
- ✅ **E2E Testing Infrastructure** - Comprehensive tests for stdio and HTTP streaming
- ✅ **TypeScript Compilation** - All compilation errors resolved
- ✅ **Documentation Updates** - Basic documentation for unified tools

## 💡 Use Cases

- **Project Knowledge Continuity** - Maintain context across development sessions
- **Architecture Understanding** - Query component dependencies and relationships
- **Decision History** - Track why implementation choices were made
- **Impact Assessment** - Identify affected components when making changes
- **Onboarding** - Help new team members understand system structure
- **Multi-Project Support** - Maintain separate memory banks for different projects
- **Code Review Assistance** - Use governance queries to ensure compliance with rules

## 🔧 Installation & Usage

```bash
# Clone the repository
git clone git@github.com:Jakedismo/KuzuMem-MCP.git
cd kuzumem-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Configuration

Create a `.env` file with:

```env
# KùzuDB Configuration
DB_FILENAME=memory-bank.kuzu

# Server Configuration
PORT=3000
HTTP_STREAM_PORT=3001
HOST=localhost
DEBUG=1
```

### Server Options

- **HTTP Server:** `npm start`
- **HTTP Streaming:** `npx ts-node src/mcp-httpstream-server.ts`
- **stdio Server:** `npx ts-node src/mcp-stdio-server.ts`

### MCP Tools

The server provides 11 unified tools for repository operations, memory management, and graph traversal. See [README.md](../README.md) for the complete tool list.

## 🏗️ Architecture

This project follows a multi-layer architecture:

- **Database Layer:**
  - KùzuDB graph database with Cypher queries
  - RepositoryFactory for centralized repository creation
  - RepositoryProvider for client-specific repository management

- **Repository Layer:**
  - Thread-safe singleton repositories for each memory type
  - Client-aware repository instances

- **Memory Operations Layer:**
  - Business logic for memory operations
  - Client project root validation
  - Refactored to use TypeScript types instead of Zod schemas

- **Service Layer:**
  - Core orchestration through MemoryService
  - Client project awareness for database operations

- **MCP Layer:**
  - Unified tool definitions, handlers, and server implementations
  - Consistent parameter patterns across all tools
  - Client project root propagation

- **CLI Layer:**
  - Command-line interface for direct interaction

## 🙏 Acknowledgements

- **[KùzuDB](https://kuzudb.com/)** - Embedded property graph database
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe programming language
- **[Node.js](https://nodejs.org/)** - JavaScript runtime
- **[Express](https://expressjs.com/)** - Web framework
- **[Model Context Protocol](https://modelcontextprotocol.io/introduction)** - Agent-tool communication standard
- **[Commander.js](https://github.com/tj/commander.js/)** - Command-line application framework

## 📄 License

Apache-2.0
