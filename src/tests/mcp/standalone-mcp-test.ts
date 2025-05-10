import express from 'express';
import { Request, Response } from 'express';
import { MEMORY_BANK_MCP_SERVER, MEMORY_BANK_MCP_TOOLS } from '../../mcp';

/**
 * Test script for MCP server that doesn't require database connections
 * This creates a standalone test server to validate the MCP endpoints structure
 */
class StandaloneMcpServer {
  private router = express.Router();

  constructor() {
    this.setupEndpoints();
  }

  initialize(): express.Router {
    return this.router;
  }

  private setupEndpoints(): void {
    // Register server metadata endpoint
    this.router.get('/server', this.getServerInfo);
    
    // Register tool endpoints
    this.router.get('/tools', this.getToolsInfo);
    
    // MCP Tool-specific endpoints - all returning mock responses
    this.router.post('/tools/init-memory-bank', this.handleInitMemoryBank);
    this.router.post('/tools/get-metadata', this.handleGetMetadata);
    this.router.post('/tools/update-metadata', this.handleUpdateMetadata);
    this.router.post('/tools/get-context', this.handleGetContext);
    this.router.post('/tools/update-context', this.handleUpdateContext);
    this.router.post('/tools/add-component', this.handleAddComponent);
    this.router.post('/tools/add-decision', this.handleAddDecision);
    this.router.post('/tools/add-rule', this.handleAddRule);
    this.router.post('/tools/export-memory-bank', this.handleExportMemoryBank);
    this.router.post('/tools/import-memory-bank', this.handleImportMemoryBank);
  }

  private getServerInfo = (req: Request, res: Response): void => {
    res.json(MEMORY_BANK_MCP_SERVER);
  };

  private getToolsInfo = (req: Request, res: Response): void => {
    res.json(MEMORY_BANK_MCP_TOOLS);
  };

  // Mock handlers that return success responses without database interaction
  private handleInitMemoryBank = (req: Request, res: Response): void => {
    const { repository } = req.body;
    
    if (!repository) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameter: repository" 
      });
      return;
    }
    
    res.json({
      success: true,
      message: `Memory bank initialized for repository: ${repository}`
    });
  };

  private handleGetMetadata = (req: Request, res: Response): void => {
    const { repository } = req.body;
    
    if (!repository) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameter: repository" 
      });
      return;
    }
    
    res.json({
      success: true,
      metadata: {
        id: 'meta',
        project: {
          name: 'Test Project',
          created: '2025-05-10'
        },
        tech_stack: {
          language: 'TypeScript',
          framework: 'Express',
          datastore: 'SQLite'
        }
      }
    });
  };

  private handleUpdateMetadata = (req: Request, res: Response): void => {
    const { repository, metadata } = req.body;
    
    if (!repository || !metadata) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameters" 
      });
      return;
    }
    
    res.json({
      success: true,
      metadata: {
        ...metadata,
        id: 'meta'
      }
    });
  };

  private handleGetContext = (req: Request, res: Response): void => {
    const { repository, latest } = req.body;
    
    if (!repository) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameter: repository" 
      });
      return;
    }
    
    const context = {
      id: 'ctx-2025-05-10',
      iso_date: '2025-05-10T08:00:00Z',
      agent: 'test-agent',
      summary: 'Test context summary',
      decisions: ['Test decision'],
      observations: ['Test observation']
    };
    
    res.json({
      success: true,
      context: latest ? [context] : [context, {...context, id: 'ctx-2025-05-09'}]
    });
  };

  private handleUpdateContext = (req: Request, res: Response): void => {
    const { repository } = req.body;
    
    if (!repository) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameter: repository" 
      });
      return;
    }
    
    res.json({
      success: true,
      context: {
        id: 'ctx-2025-05-10',
        iso_date: '2025-05-10T08:00:00Z',
        agent: req.body.agent || 'test-agent',
        summary: req.body.summary || 'Updated context summary',
        decisions: req.body.decision ? ['Test decision', req.body.decision] : ['Test decision'],
        observations: req.body.observation ? ['Test observation', req.body.observation] : ['Test observation']
      }
    });
  };

  private handleAddComponent = (req: Request, res: Response): void => {
    const { repository, id, name } = req.body;
    
    if (!repository || !id || !name) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameters" 
      });
      return;
    }
    
    res.json({
      success: true,
      component: {
        id,
        name,
        kind: req.body.kind || 'service',
        depends_on: req.body.depends_on || [],
        status: req.body.status || 'active'
      }
    });
  };

  private handleAddDecision = (req: Request, res: Response): void => {
    const { repository, id, name, date } = req.body;
    
    if (!repository || !id || !name || !date) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameters" 
      });
      return;
    }
    
    res.json({
      success: true,
      decision: {
        id,
        name,
        context: req.body.context || '',
        date
      }
    });
  };

  private handleAddRule = (req: Request, res: Response): void => {
    const { repository, id, name, created } = req.body;
    
    if (!repository || !id || !name || !created) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameters" 
      });
      return;
    }
    
    res.json({
      success: true,
      rule: {
        id,
        name,
        created,
        triggers: req.body.triggers || [],
        content: req.body.content || '',
        status: req.body.status || 'active'
      }
    });
  };

  private handleExportMemoryBank = (req: Request, res: Response): void => {
    const { repository } = req.body;
    
    if (!repository) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameter: repository" 
      });
      return;
    }
    
    res.json({
      success: true,
      files: {
        metadata: '--- !Metadata\nid: meta\nproject:\n  name: Test Project\n  created: 2025-05-10',
        contexts: ['--- !Context\nid: ctx-2025-05-10\niso_date: 2025-05-10T08:00:00Z'],
        components: ['--- !Component\nid: comp-test\nname: Test Component'],
        decisions: ['--- !Decision\nid: dec-test\nname: Test Decision\ndate: 2025-05-10'],
        rules: ['--- !Rule\nid: rule-test\nname: Test Rule\ncreated: 2025-05-10']
      }
    });
  };

  private handleImportMemoryBank = (req: Request, res: Response): void => {
    const { repository, content, type, id } = req.body;
    
    if (!repository || !content || !type || !id) {
      res.status(400).json({ 
        success: false, 
        error: "Missing required parameters" 
      });
      return;
    }
    
    if (!['metadata', 'context', 'component', 'decision', 'rule'].includes(type)) {
      res.status(400).json({ 
        success: false, 
        error: "Invalid memory type" 
      });
      return;
    }
    
    res.json({
      success: true,
      message: "Memory bank imported successfully"
    });
  };
}

/**
 * Start a test server with the standalone MCP server
 */
async function startStandaloneServer() {
  try {
    // Create Express app
    const app = express();
    const port = process.env.PORT || 4000;
    
    // Parse JSON request body
    app.use(express.json());
    
    // Initialize MCP server
    const mcpServer = new StandaloneMcpServer();
    const mcpRouter = mcpServer.initialize();
    
    // Mount MCP endpoints at /mcp
    app.use('/mcp', mcpRouter);
    
    // Add a simple health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'MCP Test Server is running'
      });
    });
    
    // Start server
    const server = app.listen(port, () => {
      console.log(`✅ Standalone MCP Test Server running at http://localhost:${port}`);
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

// Start the standalone server
startStandaloneServer().catch(console.error);
