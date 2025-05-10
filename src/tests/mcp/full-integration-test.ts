import express from 'express';
import { MemoryMcpServer } from '../../mcp';
import db from '../../db';

/**
 * Test script for MCP server with full database integration
 */
async function testMcpWithDatabase() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Check if database tables exist and their structure
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('📊 Existing database tables:', tables.map((t: any) => t.name).join(', '));
    
    // Create Express app
    const app = express();
    const port = process.env.PORT || 4000;
    
    // Parse JSON request body
    app.use(express.json());
    
    // Initialize MCP server
    console.log('🚀 Initializing MCP server...');
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
        message: 'MCP Server is running with database integration'
      });
    });
    
    // Start server
    const server = app.listen(port, () => {
      console.log(`\n✅ Full Integration MCP Test Server running at http://localhost:${port}`);
      console.log('\nAvailable endpoints:');
      console.log('  GET  /health            - Health check');
      console.log('  GET  /mcp/server        - Get MCP server metadata');
      console.log('  GET  /mcp/tools         - Get MCP tools definitions');
      console.log('\nTest MCP endpoints with curl:');
      console.log(`  curl http://localhost:${port}/mcp/server`);
      console.log(`  curl http://localhost:${port}/mcp/tools`);
      console.log(`  curl -X POST http://localhost:${port}/mcp/tools/init-memory-bank -H "Content-Type: application/json" -d '{"repository": "test-repo"}'`);
      console.log(`  curl -X POST http://localhost:${port}/mcp/tools/get-metadata -H "Content-Type: application/json" -d '{"repository": "test-repo"}'`);
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
testMcpWithDatabase().catch(console.error);
