import express from 'express';
import { MemoryMcpServer } from '../../mcp';

/**
 * Test script for MCP server
 * This script sets up a minimal Express server that only hosts the MCP endpoints
 * for easier testing and debugging
 */
async function startTestServer() {
  try {
    // Create Express app
    const app = express();
    const port = process.env.PORT || 4000;
    
    // Parse JSON request body
    app.use(express.json());
    
    // Initialize MCP server
    const mcpServer = new MemoryMcpServer();
    const mcpRouter = await mcpServer.initialize();
    
    // Mount MCP endpoints at /mcp
    app.use('/mcp', mcpRouter);
    
    // Add a simple health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'MCP Server is running'
      });
    });
    
    // Start server
    const server = app.listen(port, () => {
      console.log(`✅ MCP Test Server running at http://localhost:${port}`);
      console.log('\nAvailable endpoints:');
      console.log('  GET  /health            - Health check');
      console.log('  GET  /mcp/server        - Get MCP server metadata');
      console.log('  GET  /mcp/tools         - Get MCP tools definitions');
      console.log('\nTest MCP endpoints with curl:');
      console.log(`  curl http://localhost:${port}/mcp/server`);
      console.log(`  curl http://localhost:${port}/mcp/tools`);
      console.log(`  curl -X POST http://localhost:${port}/mcp/tools/init-memory-bank -H "Content-Type: application/json" -d '{"repository": "test-repo"}'`);
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
    console.error('Failed to start MCP test server:', error);
    process.exit(1);
  }
}

// Start the test server
startTestServer().catch(console.error);
