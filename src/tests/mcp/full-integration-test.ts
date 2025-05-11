import express from 'express';
import { MemoryMcpServer } from '../../mcp';
import { KuzuDBClient } from '../../db/kuzu';

/**
 * KuzuDB-based full integration test for MCP server
 */
async function testMcpWithKuzuDb() {
  try {
    console.log('🔍 Ensuring KuzuDB is initialized...');

    // Optionally seed KuzuDB with test data here using Cypher queries
    // Example:
    // await KuzuDBClient.executeQuery('CREATE (r:Repository {name: "test-repo", branch: "main"})');

    // Create Express app
    const app = express();
    const port = process.env.PORT || 4000;

    // Parse JSON request body
    app.use(express.json());

    // Initialize MCP server (KuzuDB is now the backend)
    console.log('🚀 Initializing MCP server (KuzuDB backend)...');
    const mcpServer = new MemoryMcpServer();
    const mcpRouter = await mcpServer.initialize();

    console.log('✅ MCP server initialized successfully');

    // Mount MCP endpoints at /mcp
    app.use('/mcp', mcpRouter);

    // Add a simple health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'MCP Server is running with KuzuDB integration',
      });
    });

    // Start server
    const server = app.listen(port, () => {
      console.log(
        `\n✅ KuzuDB Full Integration MCP Test Server running at http://localhost:${port}`,
      );
      console.log('\nAvailable endpoints:');
      console.log('  GET  /health            - Health check');
      console.log('  GET  /mcp/server        - Get MCP server metadata');
      console.log('  GET  /mcp/tools         - Get MCP tools definitions');
      console.log('\nTest MCP endpoints with curl:');
      console.log(`  curl http://localhost:${port}/mcp/server`);
      console.log(`  curl http://localhost:${port}/mcp/tools`);
      console.log(
        `  curl -X POST http://localhost:${port}/mcp/tools/init-memory-bank -H "Content-Type: application/json" -d '{"repository": "test-repo", "branch": "main"}'`,
      );
      console.log(
        `  curl -X POST http://localhost:${port}/mcp/tools/get-metadata -H "Content-Type: application/json" -d '{"repository": "test-repo", "branch": "main"}'`,
      );
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down MCP test server');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start integration test:', error);
    process.exit(1);
  }
}

// Start the test
// You can add seeding logic above if needed for integration tests
testMcpWithKuzuDb().catch(console.error);
