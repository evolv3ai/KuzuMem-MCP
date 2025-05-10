import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import memoryRoutes from './routes/memory.routes';
import db from './db';
import { MemoryMcpServer } from './mcp';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Routes
app.use('/api/memory', memoryRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Initialize and mount MCP server
const initializeMcpServer = async (): Promise<void> => {
  try {
    const mcpServer = new MemoryMcpServer();
    const mcpRouter = await mcpServer.initialize();
    
    // Mount MCP server at /mcp endpoint
    app.use('/mcp', mcpRouter);
    console.log('MCP server initialized successfully');
  } catch (error) {
    console.error('Failed to initialize MCP server:', error);
  }
};

// Start server
const startServer = async () => {
  try {
    // Run migrations
    await db.migrate.latest();
    
    // Initialize MCP server
    await initializeMcpServer();
    
    app.listen(port, () => {
      console.log(`Memory Bank MCP server running at http://${host}:${port}`);
      console.log(`MCP endpoints available at http://${host}:${port}/mcp`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Export app for testing
export { app, startServer };

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}
