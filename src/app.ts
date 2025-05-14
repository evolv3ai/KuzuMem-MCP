import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// import memoryRoutes from './routes/memory.routes'; // Commented out if not actively used or refactored
// import db from './db'; // Commented out as KuzuDB init is handled by KuzuDBClient
import { MemoryMcpServer } from './mcp';
import path from 'path'; // For resolving project root if needed

// Load environment variables
dotenv.config();

// Determine the project root for this main server instance
const MAIN_SERVER_PROJECT_ROOT = process.env.PROJECT_ROOT_FOR_MAIN_SERVER;
if (!MAIN_SERVER_PROJECT_ROOT) {
  console.error(
    'CRITICAL: PROJECT_ROOT_FOR_MAIN_SERVER environment variable is not set. ' +
      'This server instance needs to know which project root to serve. Exiting.\n' +
      'Please define it in your .env file (e.g., PROJECT_ROOT_FOR_MAIN_SERVER=./default_project_data)',
  );
  process.exit(1);
}

const absoluteMainServerProjectRoot = path.resolve(MAIN_SERVER_PROJECT_ROOT);
console.log(`Main MCP server configured for project root: ${absoluteMainServerProjectRoot}`);
// TODO: Consider ensuring this directory and its .kuzu subfolder exist here, similar to other servers.
// For now, KuzuDBClient called via MemoryService for a specific repo will handle it.

// Create Express app
const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Routes
// app.use('/api/memory', memoryRoutes); // Keep commented if not in use or needs refactor

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Initialize and mount MCP server
const initializeMcpServer = async (): Promise<void> => {
  try {
    // Pass the configured project root to the MemoryMcpServer constructor
    const mcpServer = new MemoryMcpServer(absoluteMainServerProjectRoot);
    const mcpRouter = await mcpServer.initialize();

    app.use('/mcp', mcpRouter); // Standard MCP routes like /mcp/tools/list, /mcp/tools/call
    console.log('Main MCP server (batch per-tool endpoints) initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Main MCP server:', error);
    // Allow server to start but log critical failure of MCP part
  }
};

// Start server
const startServer = async () => {
  try {
    await initializeMcpServer();

    app.listen(port, () => {
      console.log(`Main Memory Bank server (REST-like MCP) running at http://${host}:${port}`);
      console.log(`MCP tool endpoints available under http://${host}:${port}/mcp/tools/...`);
    });
  } catch (error) {
    console.error('Failed to start main server:', error);
    process.exit(1);
  }
};

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

export { app, startServer };

if (require.main === module) {
  startServer();
}
