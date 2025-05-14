import express, { Request, Response } from 'express';
import { MemoryController } from '../controllers/memory.controller';
import { MemoryService } from '../services/memory.service';
import { MEMORY_BANK_MCP_SERVER, MEMORY_BANK_MCP_TOOLS } from './';
import { toolHandlers } from './tool-handlers'; // Import shared tool handlers

/**
 * MCP Server implementation for Memory Bank
 * Following the Model Context Protocol specification
 */
export class MemoryMcpServer {
  private memoryService!: MemoryService;
  private memoryController!: MemoryController;
  private router = express.Router();
  private clientProjectRoot: string; // To be set by app.ts

  constructor(clientProjectRoot: string) {
    // Accept clientProjectRoot
    if (!clientProjectRoot) {
      throw new Error('MemoryMcpServer requires a clientProjectRoot to be defined.');
    }
    this.clientProjectRoot = clientProjectRoot;
    console.log(`MemoryMcpServer instance configured for project root: ${this.clientProjectRoot}`);
  }

  /**
   * Initialize the MCP server
   */
  async initialize(): Promise<express.Router> {
    // Initialize dependencies
    this.memoryService = await MemoryService.getInstance();
    this.memoryController = await MemoryController.getInstance();

    // Setup MCP endpoints
    this.setupEndpoints();

    return this.router;
  }

  /**
   * Setup MCP endpoints following the protocol specification
   */
  private setupEndpoints(): void {
    // Register server metadata endpoint
    this.router.get('/server', this.getServerInfo);

    // Register tool endpoints
    this.router.get('/tools', this.getToolsInfo);

    // MCP Tool-specific endpoints (all handlers are defined as class properties)
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

    // Add routes for Basic Traversal Tools
    this.router.post('/tools/get-component-dependencies', this.handleGetComponentDependencies);
    this.router.post('/tools/get-component-dependents', this.handleGetComponentDependents);
    this.router.post('/tools/get-item-contextual-history', this.handleGetItemContextualHistory);
    this.router.post(
      '/tools/get-governing-items-for-component',
      this.handleGetGoverningItemsForComponent,
    );
    this.router.post('/tools/get-related-items', this.handleGetRelatedItems);

    // Add routes for Graph Algorithm Tools
    this.router.post('/tools/k-core-decomposition', this.handleKCoreDecomposition);
    this.router.post('/tools/louvain-community-detection', this.handleLouvainCommunityDetection);
    this.router.post('/tools/pagerank', this.handlePageRank);
    this.router.post(
      '/tools/strongly-connected-components',
      this.handleStronglyConnectedComponents,
    );
    this.router.post('/tools/weakly-connected-components', this.handleWeaklyConnectedComponents);
    this.router.post('/tools/shortest-path', this.handleShortestPath);
  }

  /**
   * Get server information
   */
  private getServerInfo = async (req: Request, res: Response): Promise<void> => {
    res.json(MEMORY_BANK_MCP_SERVER);
  };

  /**
   * Get tools information
   */
  private getToolsInfo = async (req: Request, res: Response): Promise<void> => {
    res.json(MEMORY_BANK_MCP_TOOLS);
  };

  // Generic handler to reduce repetition for simple tool calls
  private async handleGenericToolCall(
    req: Request,
    res: Response,
    toolName: keyof typeof toolHandlers,
  ) {
    try {
      const toolArgs = req.body;
      // Ensure repositoryName is used if present, otherwise fallback to repository for backward compat with older clients
      // For init-memory-bank, clientProjectRoot MUST be in toolArgs and repository is logical name
      if (toolName === 'init-memory-bank') {
        if (!toolArgs.clientProjectRoot) {
          res
            .status(400)
            .json({ success: false, error: 'Missing required tool argument: clientProjectRoot' });
          return;
        }
        if (!toolArgs.repository) {
          res.status(400).json({
            success: false,
            error: 'Missing required tool argument: repository (logical name)',
          });
          return;
        }
        // clientProjectRoot for init-memory-bank comes from its own args, not this.clientProjectRoot
      } else {
        // For other tools, repositoryName is expected in toolArgs, clientProjectRoot is from this server instance
        if (!toolArgs.repositoryName && !toolArgs.repository) {
          // Check for logical repo name
          res.status(400).json({
            success: false,
            error: `Missing required tool argument: repositoryName (or repository) for tool ${String(toolName)}`,
          });
          return;
        }
        // Ensure toolArgs uses repositoryName consistently for MemoryService calls via handlers
        if (toolArgs.repository && !toolArgs.repositoryName) {
          toolArgs.repositoryName = toolArgs.repository;
        }
      }

      const result = await toolHandlers[toolName](
        toolArgs,
        this.memoryService,
        undefined, // No progress handler for these batch endpoints
        // For init-memory-bank, toolArgs.clientProjectRoot is used by the handler itself.
        // For others, this.clientProjectRoot is the context.
        toolName === 'init-memory-bank' ? undefined : this.clientProjectRoot,
      );
      res.json(result);
    } catch (error: any) {
      console.error(`Error in ${String(toolName)} tool (HTTP):`, error.message);
      res
        .status(500)
        .json({ success: false, error: error.message || `Failed to execute ${String(toolName)}` });
    }
  }

  // Specific handlers now mostly delegate to handleGenericToolCall
  private handleInitMemoryBank = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'init-memory-bank');
  };

  private handleGetMetadata = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'get-metadata');
  };

  private handleUpdateMetadata = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'update-metadata');
  };

  private handleGetContext = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'get-context');
  };

  private handleUpdateContext = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'update-context');
  };

  private handleAddComponent = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'add-component');
  };

  private handleAddDecision = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'add-decision');
  };

  private handleAddRule = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'add-rule');
  };

  private handleGetComponentDependencies = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'get-component-dependencies');
  };

  private handleGetComponentDependents = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'get-component-dependents');
  };

  private handleGetItemContextualHistory = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'get-item-contextual-history');
  };

  private handleGetGoverningItemsForComponent = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'get-governing-items-for-component');
  };

  private handleGetRelatedItems = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'get-related-items');
  };

  private handleKCoreDecomposition = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'k-core-decomposition');
  };

  private handleLouvainCommunityDetection = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'louvain-community-detection');
  };

  private handlePageRank = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'pagerank');
  };

  private handleStronglyConnectedComponents = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'strongly-connected-components');
  };

  private handleWeaklyConnectedComponents = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'weakly-connected-components');
  };

  private handleShortestPath = async (req: Request, res: Response): Promise<void> => {
    await this.handleGenericToolCall(req, res, 'shortest-path');
  };

  // handleExportMemoryBank and handleImportMemoryBank would need similar refactoring if kept
  private handleExportMemoryBank = async (req: Request, res: Response): Promise<void> => {
    // This handler needs to be updated to use clientProjectRoot if it becomes context-dependent
    // For now, assuming it might operate on a pre-defined path or use toolArgs differently.
    // Consider if it needs this.clientProjectRoot or takes a specific path from toolArgs.
    console.warn(
      'handleExportMemoryBank in MemoryMcpServer is not yet refactored for clientProjectRoot.',
    );
    res.status(501).json({ error: 'Not yet refactored for multi-project support' });
  };

  private handleImportMemoryBank = async (req: Request, res: Response): Promise<void> => {
    console.warn(
      'handleImportMemoryBank in MemoryMcpServer is not yet refactored for clientProjectRoot.',
    );
    res.status(501).json({ error: 'Not yet refactored for multi-project support' });
  };
}
