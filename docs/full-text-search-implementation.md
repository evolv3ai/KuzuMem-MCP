# Full-Text Search for Advanced Memory Bank

This document outlines the implementation plan for incorporating full-text search capabilities into the Advanced Memory Bank MCP server, enabling efficient keyword-based search across memory items with advanced relevance scoring.

## Overview

While the Advanced Memory Bank currently provides graph traversal for relationship-based queries, it lacks robust text search capabilities across the textual content stored in memory items. By implementing full-text search (FTS), we can enable powerful keyword-based queries with relevance scoring to help agents quickly find relevant memories.

## KuzuDB Full-Text Search Extension

KuzuDB provides native support for full-text search through its FTS extension, which offers:

1. Inverted index structures for efficient text search
2. Support for stemming and stopword filtering
3. Okapi BM25 scoring algorithm for relevance ranking
4. Optional conjunctive search mode for more precise matching

This functionality will complement the graph-based querying by providing fast access to textual content, improving the overall utility of the memory bank.

## Implementation Approach

### Current Limitations

The existing implementation has several limitations regarding text search:

- No efficient way to search across textual content in memory items
- No relevance scoring for search results
- Limited filtering capabilities for text-based queries
- No support for language-specific text analysis (stemming, stopwords)

### Solution Architecture

The implementation will leverage KuzuDB's FTS extension to create and query full-text indices on the textual properties of memory items. This will be integrated with the existing branch-isolation mechanism to ensure that searches are confined to the appropriate branch context.

## Modified Schema

No structural schema changes are required for implementing full-text search. Instead, we will create full-text search indices on existing string properties of our memory entities:

- **Context**: `name`, `summary`
- **Component**: `name`, `kind`
- **Decision**: `name`, `context`
- **Rule**: `name`, `content`
- **Metadata**: `name`, `content`

These indices will be created and managed separately from the core schema, similar to how database indices work.

## Implementation Plan

### Phase 1: FTS Extension Setup

1. **Install and Load FTS Extension**
   - Add initialization logic to the database setup process:

     ```sql
     INSTALL FTS;
     LOAD FTS;
     ```

2. **Create FTS Indices**
   - Implement a function to create FTS indices for each entity type:

     ```typescript
     // src/services/fts.service.ts
     
     export async function setupFullTextSearchIndices(
       db: DatabaseConnection,
       stemmer: string = 'english',
       customStopwords?: string[]
     ): Promise<void> {
       // Context indices
       await db.executeQuery(`
         CALL CREATE_FTS_INDEX(
           'Context', 
           'context_text_index', 
           ['name', 'summary'],
           stemmer := '${stemmer}'
         )
       `);
       
       // Component indices
       await db.executeQuery(`
         CALL CREATE_FTS_INDEX(
           'Component', 
           'component_text_index', 
           ['name', 'kind'],
           stemmer := '${stemmer}'
         )
       `);
       
       // Decision indices
       await db.executeQuery(`
         CALL CREATE_FTS_INDEX(
           'Decision', 
           'decision_text_index', 
           ['name', 'context'],
           stemmer := '${stemmer}'
         )
       `);
       
       // Rule indices
       await db.executeQuery(`
         CALL CREATE_FTS_INDEX(
           'Rule', 
           'rule_text_index', 
           ['name', 'content'],
           stemmer := '${stemmer}'
         )
       `);
       
       // Metadata indices
       await db.executeQuery(`
         CALL CREATE_FTS_INDEX(
           'Metadata', 
           'metadata_text_index', 
           ['name', 'content'],
           stemmer := '${stemmer}'
         )
       `);
     }
     ```

### Phase 2: Service Integration

1. **Create a Dedicated FTS Service**
   - Implement a service to manage FTS operations that can be called by the MemoryService:

     ```typescript
     // src/services/fts.service.ts
     
     export class FtsService {
       private static instance: FtsService;
       private db: DatabaseConnection;
       
       private constructor(db: DatabaseConnection) {
         this.db = db;
       }
       
       public static async getInstance(db?: DatabaseConnection): Promise<FtsService> {
         if (!FtsService.instance) {
           if (!db) {
             throw new Error('Database connection required for initialization');
           }
           FtsService.instance = new FtsService(db);
         }
         return FtsService.instance;
       }
       
       /**
        * Creates or updates FTS index for an entity
        */
       async ensureFtsIndex(
         entityType: string,
         properties: string[],
         stemmer: string = 'english'
       ): Promise<void> {
         const indexName = `${entityType.toLowerCase()}_text_index`;
         
         // First check if index exists
         const query = `CALL FTS_SHOW_INDICES() YIELD name WHERE name = '${indexName}'`;
         const result = await this.db.executeQuery(query);
         
         if (result.length === 0) {
           // Create the index if it doesn't exist
           const createQuery = `
             CALL CREATE_FTS_INDEX(
               '${entityType}', 
               '${indexName}', 
               $properties,
               stemmer := '${stemmer}'
             )
           `;
           
           await this.db.executeQuery(createQuery, { properties });
           console.log(`Created FTS index: ${indexName}`);
         }
       }
       
       /**
        * Performs full-text search across memory items
        */
       async fullTextSearch(
         repository: string, 
         branch: string, 
         query: string, 
         entityTypes: string[] = ['Context', 'Component', 'Decision', 'Rule', 'Metadata'], 
         limit: number = 10,
         conjunctive: boolean = false
       ): Promise<any[]> {
         // Validate inputs
         if (!repository || !branch || !query) {
           throw new Error('Repository, branch, and query are required');
         }
         
         // Repository ID with branch
         const repoId = `${repository}:${branch}`;
         
         // Combined results
         let allResults = [];
         
         // Search across each entity type
         for (const entityType of entityTypes) {
           const indexName = `${entityType.toLowerCase()}_text_index`;
           
           try {
             // Query structure that maintains branch isolation
             const queryStr = `
               MATCH (repo:Repository {id: $repoId})
               CALL QUERY_FTS_INDEX(
                 '${entityType}',
                 '${indexName}',
                 $query,
                 conjunctive := $conjunctive
               )
               WITH node, score
               MATCH (repo)-[r]->(node)
               RETURN node, type(r) as relationship, score
               ORDER BY score DESC
               LIMIT $limit
             `;
             
             const params = {
               repoId,
               query,
               conjunctive,
               limit
             };
             
             const results = await this.db.executeQuery(queryStr, params);
             allResults = [...allResults, ...results];
           } catch (error) {
             console.error(`Error searching ${entityType}: ${error.message}`);
             // Continue with other entity types
           }
         }
         
         // Sort by score and limit results
         return allResults
           .sort((a, b) => b.score - a.score)
           .slice(0, limit);
       }
     }
     ```

2. **Integrate FTS with MemoryService**
   - Modify the MemoryService to automatically create and use FTS indices:

     ```typescript
     // src/services/memory.service.ts
     
     import { FtsService } from './fts.service';
     
     export class MemoryService {
       private static instance: MemoryService;
       private db: DatabaseConnection;
       private ftsService: FtsService;
       
       // ... existing code ...
       
       async initialize() {
         // ... existing initialization ...
         
         // Initialize FTS service
         this.ftsService = await FtsService.getInstance(this.db);
       }
       
       /**
        * Add Context with automatic FTS indexing
        */
       async addContext(repository: string, branch: string, context: ContextInput): Promise<Context> {
         // ... existing logic ...
         
         // Create or update the entity
         const result = await this.db.executeQuery(/* existing query */);
         
         // Ensure FTS index exists and is up to date
         await this.ftsService.ensureFtsIndex('Context', ['name', 'summary']);
         
         return result;
       }
       
       /**
        * Add Component with automatic FTS indexing
        */
       async addComponent(repository: string, branch: string, component: ComponentInput): Promise<Component> {
         // ... existing logic ...
         
         // Create or update the entity
         const result = await this.db.executeQuery(/* existing query */);
         
         // Ensure FTS index exists and is up to date
         await this.ftsService.ensureFtsIndex('Component', ['name', 'kind']);
         
         return result;
       }
       
       // Similar modifications for addDecision, addRule, updateMetadata, etc.
       
       /**
        * Search memory items using full-text search
        */
       async searchMemory(
         repository: string,
         branch: string,
         query: string,
         options: {
           entityTypes?: string[];
           limit?: number;
           conjunctive?: boolean;
           includeRelated?: boolean;
           maxHops?: number;
           relationshipTypes?: string[];
         } = {}
       ): Promise<any[]> {
         const {
           entityTypes = ['Context', 'Component', 'Decision', 'Rule', 'Metadata'],
           limit = 10,
           conjunctive = false,
           includeRelated = false,
           maxHops = 2,
           relationshipTypes = []
         } = options;
         
         // Perform basic text search
         const textResults = await this.ftsService.fullTextSearch(
           repository,
           branch,
           query,
           entityTypes,
           limit,
           conjunctive
         );
         
         // Return simple text results if no graph traversal is requested
         if (!includeRelated || maxHops === 0) {
           return textResults;
         }
         
         // Otherwise perform hybrid search with graph traversal
         let allResults = [...textResults];
         const seedNodes = textResults.map(r => r.node.id);
         
         // Skip if no seed nodes
         if (seedNodes.length === 0) {
           return allResults;
         }
         
         // Build relationship clause
         const relClause = relationshipTypes.length > 0
           ? `[r:${relationshipTypes.join('|')}]`
           : '[r]';
         
         // Query for related items
         const queryStr = `
           MATCH (repo:Repository {id: $repoId})
           MATCH (repo)-[]->(seed)
           WHERE id(seed) IN $seedNodes
           MATCH path = (seed)-${relClause}*1..${maxHops}->(related)
           RETURN related as node, length(path) as distance
           ORDER BY distance
           LIMIT $limit
         `;
         
         const params = {
           repoId: `${repository}:${branch}`,
           seedNodes,
           limit
         };
         
         const relatedResults = await this.db.executeQuery(queryStr, params);
         
         // Add related results, avoiding duplicates
         for (const result of relatedResults) {
           const isDuplicate = allResults.some(r => 
             r.node.id === result.node.id
           );
           
           if (!isDuplicate) {
             // Add with a derived score based on distance
             allResults.push({
               ...result,
               score: 1.0 / (1 + result.distance)
             });
           }
         }
         
         // Sort by score and limit
         return allResults
           .sort((a, b) => b.score - a.score)
           .slice(0, limit);
       }
     }
     ```

### Phase 3: MCP Tool Integration

1. **Enhance Existing MCP Tools with Search Capabilities**
   - Instead of creating separate tools, update the existing `mcp_get_related_items` tool to support text search:

     ```typescript
     // src/mcp/tools/get-related-items.tool.ts
     
     import { McpTool } from '../types';
     import { MemoryService } from '../../services/memory.service';
     
     export const getRelatedItemsTool: McpTool = {
       name: 'mcp_get_related_items',
       description: 'Get related memory items via graph traversal and search by text queries',
       parameters: {
         repository: {
           type: 'string',
           description: 'Repository name'
         },
         branch: {
           type: 'string',
           description: 'Repository branch (defaults to main)',
           default: 'main'
         },
         // Original parameters for graph-based retrieval
         startItemId: {
           type: 'string',
           description: 'ID of the memory item to start traversal from. Optional if textQuery is provided.'
         },
         depth: {
           type: 'integer',
           description: 'Maximum number of relationship hops to traverse',
           default: 1
         },
         relationshipFilter: {
           type: 'string',
           description: 'Comma-separated list of relationship types to include',
         },
         targetNodeTypeFilter: {
           type: 'string',
           description: 'Comma-separated list of target node types to include',
         },
         // New parameters for text search
         textQuery: {
           type: 'string',
           description: 'Text to search for in memory items. If provided, text search is used before graph traversal.'
         },
         conjunctive: {
           type: 'boolean',
           description: 'For text search: require all words to be present in results',
           default: false
         },
         limit: {
           type: 'integer',
           description: 'Maximum number of results to return',
           default: 10
         }
       },
       handler: async (args, memoryService) => {
         const { 
           repository, 
           branch, 
           startItemId, 
           depth, 
           relationshipFilter, 
           targetNodeTypeFilter,
           textQuery,
           conjunctive,
           limit 
         } = args;
         
         try {
           // If text query is provided, use search as starting point
           if (textQuery) {
             const options = {
               entityTypes: targetNodeTypeFilter ? targetNodeTypeFilter.split(',') : undefined,
               limit,
               conjunctive,
               includeRelated: !!startItemId || depth > 0,
               maxHops: depth,
               relationshipTypes: relationshipFilter ? relationshipFilter.split(',') : undefined
             };
             
             const results = await memoryService.searchMemory(
               repository,
               branch,
               textQuery,
               options
             );
             
             return {
               query: textQuery,
               results: results.map(r => ({
                 type: r.node.labels[0],
                 id: r.node.properties.yaml_id,
                 name: r.node.properties.name,
                 relevance: r.score !== undefined ? r.score : null,
                 distance: r.distance !== undefined ? r.distance : null,
                 content: r.node.properties.summary || r.node.properties.context || r.node.properties.content
               }))
             };
           } 
           
           // If no text query, use the original graph traversal implementation
           else if (startItemId) {
             // Original implementation for graph-based retrieval
             // ...
             return await originalGraphTraversalImplementation();
           }
           
           else {
             return { error: "Either startItemId or textQuery must be provided" };
           }
         } catch (error) {
           return { error: error.message };
         }
       }
     };
     ```

2. **Add Text Search to Memory Management Tools**
   - Update the initialization process in `init-memory-bank` to create FTS indices automatically:

     ```typescript
     // src/mcp/tools/init-memory-bank.tool.ts
     
     export const initMemoryBankTool: McpTool = {
       name: 'init-memory-bank',
       description: 'Initialize a new memory bank for a repository with full text search capability',
       parameters: {
         // Existing parameters
         repository: {
           type: 'string',
           description: 'Repository name to initialize'
         },
         branch: {
           type: 'string',
           description: 'Branch name for repository isolation',
           default: 'main'
         },
         // New parameters for FTS
         setupFts: {
           type: 'boolean',
           description: 'Enable full-text search for this repository',
           default: true
         },
         stemmer: {
           type: 'string',
           enum: ['english', 'porter', 'none'],
           description: 'Stemming algorithm for text search',
           default: 'english'
         }
       },
       handler: async (args, memoryService) => {
         const { repository, branch, setupFts, stemmer } = args;
         
         try {
           // Initialize the memory bank
           const result = await memoryService.initMemoryBank(repository, branch);
           
           // Set up FTS if requested
           if (setupFts) {
             await memoryService.setupFullTextSearch(repository, branch, {
               stemmer: stemmer || 'english',
               entityTypes: ['Context', 'Component', 'Decision', 'Rule', 'Metadata']
             });
           }
           
           return {
             success: true,
             message: `Memory bank initialized for ${repository}:${branch} with FTS ${setupFts ? 'enabled' : 'disabled'}`,
             ...result
           };
         } catch (error) {
           return { error: error.message };
         }
       }
     };
     ```

3. **Make Search a Core Feature of Existing Components**
   - Add search support to component retrieval tools:

     ```typescript
     // src/mcp/tools/get-component.tool.ts
     
     export const getComponentsTool: McpTool = {
       name: 'get-components',
       description: 'Get components from memory bank with graph traversal or text search',
       parameters: {
         repository: {
           type: 'string',
           description: 'Repository name'
         },
         branch: {
           type: 'string',
           description: 'Repository branch',
           default: 'main'
         },
         // Original parameters
         componentId: {
           type: 'string',
           description: 'Component ID to retrieve. Optional if textQuery is provided.'
         },
         // New parameters for text search
         textQuery: {
           type: 'string',
           description: 'Text to search for in component names and descriptions'
         },
         includeRelated: {
           type: 'boolean',
           description: 'Include related components in search results',
           default: false
         }
       },
       handler: async (args, memoryService) => {
         const { repository, branch, componentId, textQuery, includeRelated } = args;
         
         try {
           // Text search flow
           if (textQuery) {
             return await memoryService.searchMemory(repository, branch, textQuery, {
               entityTypes: ['Component'],
               includeRelated,
               relationshipTypes: ['DEPENDS_ON']
             });
           }
           
           // Original implementation for direct component retrieval
           else if (componentId) {
             // Original component retrieval logic
             // ...
           }
           
           else {
             return { error: "Either componentId or textQuery must be provided" };
           }
         } catch (error) {
           return { error: error.message };
         }
       }
     };
     ```

### Phase 4: CLI and API Updates

1. **CLI Command Implementation**
   - Add commands for FTS index management:

     ```typescript
     // src/cli/commands/fts.ts
     
     import { Command } from 'commander';
     import { MemoryService } from '../../services/memory.service';
     
     export function registerFtsCommands(program: Command) {
       const ftsCmd = program.command('fts')
         .description('Full-text search operations');
       
       ftsCmd
         .command('create-indices')
         .description('Create full-text search indices for memory entities')
         .option('-r, --repository <name>', 'Repository name')
         .option('-b, --branch <name>', 'Branch name', 'main')
         .option('-s, --stemmer <algorithm>', 'Stemming algorithm', 'english')
         .option('-t, --types <types>', 'Entity types (comma-separated)')
         .action(async (options) => {
           // Implementation
         });
       
       ftsCmd
         .command('search')
         .description('Search memory items using full-text search')
         .option('-r, --repository <name>', 'Repository name')
         .option('-b, --branch <name>', 'Branch name', 'main')
         .option('-q, --query <query>', 'Search query')
         .option('-t, --types <types>', 'Entity types (comma-separated)')
         .option('-c, --conjunctive', 'Require all words to match', false)
         .option('-l, --limit <number>', 'Maximum results', '10')
         .action(async (options) => {
           // Implementation
         });
       
       // Additional commands
     }
     ```

2. **API Route Implementation**
   - Add endpoints for FTS operations:

     ```typescript
     // src/api/routes/fts.ts
     
     import { Router } from 'express';
     import { MemoryService } from '../../services/memory.service';
     
     export function registerFtsRoutes(router: Router) {
       // Get memory service instance
       const memoryService = await MemoryService.getInstance();
       
       router.post('/text-search', async (req, res) => {
         const { repository, branch, query, entityTypes, conjunctive, limit } = req.body;
         
         try {
           const results = await memoryService.fullTextSearch(
             repository, 
             branch || 'main', 
             query, 
             entityTypes, 
             limit || 10,
             conjunctive || false
           );
           
           res.json({ success: true, results });
         } catch (error) {
           res.status(500).json({ success: false, error: error.message });
         }
       });
       
       // Additional routes
     }
     ```

### Phase 5: Integration with Memory Service Lifecycle

1. **Index Management During Repository Initialization**
   - Update repository initialization to create FTS indices:

     ```typescript
     // src/services/memory.service.ts
     
     async initMemoryBank(repository: string, branch: string = 'main'): Promise<void> {
       // Existing initialization code
       
       // Create full-text search indices
       await this.createFtsIndices(repository, branch);
     }
     
     async createFtsIndices(
       repository: string, 
       branch: string, 
       entityTypes: string[] = ['Context', 'Component', 'Decision', 'Rule', 'Metadata'],
       stemmer: string = 'english'
     ): Promise<void> {
       // Implementation to create FTS indices for the specified entity types
     }
     ```

2. **Index Maintenance for CRUD Operations**
   - FTS indices automatically update when memory items are changed, so no explicit maintenance code is needed beyond index creation and deletion

## Testing Strategy

1. **Unit Tests**
   - Test FTS query generation
   - Test result transformation and scoring
   - Test hybrid search algorithm

2. **Integration Tests**
   - Test creating FTS indices
   - Test searching with various query types
   - Test searching across branches with branch isolation

3. **Performance Tests**
   - Benchmark search performance with various index configurations
   - Test with increasing volumes of memory items
   - Compare performance of text search vs. graph traversal

## Performance Considerations

1. **Index Size**
   - Monitor the size of FTS indices as memory items grow
   - Consider selective indexing strategies for very large repositories

2. **Query Optimization**
   - Use conjunctive mode for more precise searches
   - Limit the scope of searches to specific entity types when possible
   - Use hybrid search judiciously as it requires both text search and graph traversal

3. **Stemming and Stopwords**
   - Choose appropriate stemming algorithm based on the primary language used
   - Consider custom stopword lists for domain-specific terminology

## Conclusion

Implementing full-text search capabilities in the Advanced Memory Bank will significantly enhance the ability of AI agents to find relevant information quickly. By integrating KuzuDB's FTS extension with our existing architecture, we can provide powerful text search functionality while maintaining branch isolation and the benefits of graph-based relationships.

The combination of full-text search with graph traversal creates a comprehensive memory retrieval system that can find information based on both textual content and relationship context, making the memory bank more effective for complex AI agent tasks.
