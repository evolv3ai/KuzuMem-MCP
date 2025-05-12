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

  constructor() {}

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

  /**
   * Handle init memory bank tool
   */
  private handleInitMemoryBank = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // { repository, branch? }

      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      // Ensure branch default, as shared handler might expect it or rely on MemoryService default
      toolArgs.branch = toolArgs.branch || 'main';

      const result = await toolHandlers['init-memory-bank'](toolArgs, this.memoryService);

      // Assuming shared handler returns an object like { success: true, message: ... } or throws error
      res.json(result);
    } catch (error: any) {
      console.error('Error in init-memory-bank tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to initialize memory bank',
      });
    }
  };

  /**
   * Handle get metadata tool
   */
  private handleGetMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // { repository, branch? }

      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';

      // The shared 'get-metadata' handler returns the metadata object directly or throws.
      // It might also return null if the underlying service method returns null for not found.
      const metadata = await toolHandlers['get-metadata'](toolArgs, this.memoryService);

      if (metadata === null || metadata === undefined) {
        // Check for null or undefined specifically
        res.status(404).json({
          success: false,
          error: `Metadata not found for repository '${toolArgs.repository}' (branch: ${toolArgs.branch})`,
        });
        return;
      }

      res.json({
        success: true,
        metadata, // The shared handler is expected to return the metadata object itself
      });
    } catch (error: any) {
      console.error('Error in get-metadata tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get metadata',
      });
    }
  };

  /**
   * Handle update metadata tool
   */
  private handleUpdateMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // { repository, metadata, branch? }

      if (!toolArgs.repository || !toolArgs.metadata) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository and metadata',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';

      // Assuming shared 'update-metadata' handler will return the updated metadata object or null/undefined on failure.
      const updatedMetadata = await toolHandlers['update-metadata'](toolArgs, this.memoryService);

      if (updatedMetadata === null || updatedMetadata === undefined) {
        res.status(404).json({
          // Or 500 if it implies a failure beyond 'not found'
          success: false,
          error: `Failed to update metadata for repository '${toolArgs.repository}' (branch: ${toolArgs.branch})`,
        });
        return;
      }

      res.json({
        success: true,
        metadata: updatedMetadata, // Return the actual updated metadata object
      });
    } catch (error: any) {
      console.error('Error in update-metadata tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update metadata',
      });
    }
  };

  /**
   * Handle get context tool
   */
  private handleGetContext = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // { repository, latest?, limit?, branch? }

      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      // latest defaults to false if not provided, limit defaults in shared handler if applicable

      const contexts = (await toolHandlers['get-context'](toolArgs, this.memoryService)) as any;

      if (toolArgs.latest === true && (!contexts || contexts.length === 0)) {
        res.status(404).json({
          success: false,
          error: `Context not found for repository '${toolArgs.repository}' (branch: ${toolArgs.branch})`,
        });
        return;
      }

      res.json({
        success: true,
        context: contexts, // Shared handler returns an array for both cases
      });
    } catch (error: any) {
      console.error('Error in get-context tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get context',
      });
    }
  };

  /**
   * Handle update context tool
   */
  private handleUpdateContext = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body;
      // { repository, agent?, issue?, summary?, decision?, observation?, branch? }

      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      // Other fields (agent, issue, etc.) are optional and handled by the shared handler / service layer

      // Shared handler 'update-context' is expected to call MemoryService.updateContext
      // which handles merging and returns the updated Context | null.
      const updatedContext = await toolHandlers['update-context'](toolArgs, this.memoryService);

      if (!updatedContext) {
        // This could be due to repository not found, or other update failure if service returns null
        res.status(404).json({
          // Or 500 depending on expected failure modes from service
          success: false,
          error: `Failed to update context for repository '${toolArgs.repository}' (branch: ${toolArgs.branch})`,
        });
        return;
      }

      res.json({
        success: true,
        context: updatedContext,
      });
    } catch (error: any) {
      console.error('Error in update-context tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update context',
      });
    }
  };

  /**
   * Handle add component tool
   */
  private handleAddComponent = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        repository,
        id,
        name,
        kind,
        depends_on,
        status,
        branch = 'main',
        ...otherComponentData
      } = req.body;

      if (!repository || !id || !name) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository, id, and name',
        });
        return;
      }

      const toolArgs = {
        repository,
        branch,
        yaml_id: id,
        name,
        kind,
        depends_on,
        status: status || 'active',
        ...otherComponentData,
      };

      const resultComponent = await toolHandlers['add-component'](toolArgs, this.memoryService);

      if (!resultComponent) {
        res.status(404).json({
          success: false,
          error: `Failed to add component for repository '${repository}' (branch: ${branch})`,
        });
        return;
      }

      res.json({
        success: true,
        component: resultComponent,
      });
    } catch (error: any) {
      console.error('Error in add-component tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to add component',
      });
    }
  };

  /**
   * Handle add decision tool
   */
  private handleAddDecision = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        repository,
        id,
        name,
        context,
        date,
        branch = 'main',
        ...otherDecisionData
      } = req.body;

      if (!repository || !id || !name || !date) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository, id, name, and date',
        });
        return;
      }

      const toolArgs = {
        repository,
        branch,
        yaml_id: id,
        name,
        context,
        date,
        ...otherDecisionData,
      };

      // Shared handler 'add-decision' should return the created/updated Decision object or null
      const resultDecision = await toolHandlers['add-decision'](toolArgs, this.memoryService);

      if (!resultDecision) {
        res.status(404).json({
          // Or 500
          success: false,
          error: `Failed to add decision for repository '${repository}' (branch: ${branch})`,
        });
        return;
      }

      res.json({
        success: true,
        decision: resultDecision,
      });
    } catch (error: any) {
      console.error('Error in add-decision tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to add decision',
      });
    }
  };

  /**
   * Handle add rule tool
   */
  private handleAddRule = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        repository,
        id, // yaml_id
        name,
        created,
        triggers,
        content,
        status,
        branch = 'main',
        ...otherRuleData
      } = req.body;

      if (!repository || !id || !name || !created) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository, id, name, and created',
        });
        return;
      }

      const toolArgs = {
        repository,
        branch,
        yaml_id: id,
        name,
        created,
        triggers,
        content,
        status: status || 'active',
        ...otherRuleData,
      };

      // Shared handler 'add-rule' should return the created/updated Rule object or null
      const resultRule = await toolHandlers['add-rule'](toolArgs, this.memoryService);

      if (!resultRule) {
        res.status(404).json({
          // Or 500
          success: false,
          error: `Failed to add rule for repository '${repository}' (branch: ${branch})`,
        });
        return;
      }

      res.json({
        success: true,
        rule: resultRule,
      });
    } catch (error: any) {
      console.error('Error in add-rule tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to add rule',
      });
    }
  };

  /**
   * Handle export memory bank tool
   */
  private handleExportMemoryBank = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // { repository, branch? }

      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';

      // Shared handler 'export-memory-bank' returns an object like
      // { success: true, message: string, data: Record<string, string> } or throws.
      // The original HTTP response directly used the 'files' property from MemoryService.
      // We expect the shared handler's 'data' field to be this files record.
      const result = (await toolHandlers['export-memory-bank'](
        toolArgs,
        this.memoryService,
      )) as any;

      // Assuming result has a structure like { data: files } if successful,
      // or shared handler throws on error from service.
      // If the shared handler formats success differently (e.g. no 'data' field), this needs adjustment.
      // Based on tool-handlers.ts for export-memory-bank: it returns { success, message, data: resultFromService }
      if (result && result.success && result.data) {
        res.json({
          success: true,
          files: result.data, // Use the data field from shared handler result
        });
      } else {
        // This case might be hit if shared handler returns a success=false or unexpected structure
        // Or if it doesn't throw but indicates failure in its return object.
        console.error(
          'Export memory bank failed or returned unexpected structure from shared handler:',
          result,
        );
        res.status(500).json({
          success: false,
          error:
            result?.message || 'Failed to export memory bank due to unexpected handler response',
        });
      }
    } catch (error: any) {
      console.error('Error in export-memory-bank tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to export memory bank',
      });
    }
  };

  /**
   * Handle import memory bank tool
   */
  private handleImportMemoryBank = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body;
      // { repository, content, type, id, branch? }

      if (!toolArgs.repository || !toolArgs.content || !toolArgs.type || !toolArgs.id) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository, content, type, and id',
        });
        return;
      }

      // Validate memory type (this is specific to the string input from HTTP)
      const validTypes = ['metadata', 'context', 'component', 'decision', 'rule'];
      if (!validTypes.includes(toolArgs.type)) {
        res.status(400).json({
          success: false,
          error: `Invalid memory type '${toolArgs.type}'. Must be one of: ${validTypes.join(', ')}`,
        });
        return;
      }

      // The shared handler expects 'type' to be of MemoryType (enum or validated string literal union)
      // The toolArgs.type is already validated above to be one of the expected strings.
      // The shared handler will receive this string, and its internal call to MemoryService.importMemoryBank
      // also takes this string type.
      toolArgs.branch = toolArgs.branch || 'main';

      const result = (await toolHandlers['import-memory-bank'](
        toolArgs,
        this.memoryService,
      )) as any;

      // Shared handler is expected to return { success: boolean, message?: string } or throw an error.
      if (result && result.success) {
        res.json({
          success: true,
          message:
            result.message ||
            `Memory bank imported successfully for repository '${toolArgs.repository}' (branch: ${toolArgs.branch})`,
        });
      } else {
        res.status(400).json({
          // Or 500 if the failure is not a client error
          success: false,
          error:
            result?.message ||
            `Failed to import memory bank for repository '${toolArgs.repository}' (branch: ${toolArgs.branch})`,
        });
      }
    } catch (error: any) {
      console.error('Error in import-memory-bank tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to import memory bank',
      });
    }
  };

  // Add handlers for Basic Traversal Tools

  private handleGetComponentDependencies = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, componentId, branch?, depth? }
      if (!toolArgs.repository || !toolArgs.componentId) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository and componentId',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['get-component-dependencies'](toolArgs, this.memoryService);
      res.json({ success: true, data: result }); // Shared handler returns data directly or throws
    } catch (error: any) {
      console.error('Error in get-component-dependencies tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get component dependencies',
      });
    }
  };

  private handleGetComponentDependents = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, componentId, branch?, depth? }
      if (!toolArgs.repository || !toolArgs.componentId) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository and componentId',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['get-component-dependents'](toolArgs, this.memoryService);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in get-component-dependents tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get component dependents',
      });
    }
  };

  private handleGetItemContextualHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, itemId, branch? }
      if (!toolArgs.repository || !toolArgs.itemId) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository and itemId',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['get-item-contextual-history'](
        toolArgs,
        this.memoryService,
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in get-item-contextual-history tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get item contextual history',
      });
    }
  };

  private handleGetGoverningItemsForComponent = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, componentId, branch? }
      if (!toolArgs.repository || !toolArgs.componentId) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository and componentId',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['get-governing-items-for-component'](
        toolArgs,
        this.memoryService,
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in get-governing-items-for-component tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get governing items',
      });
    }
  };

  private handleGetRelatedItems = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, itemId, branch?, relationshipTypes?, depth?, direction? }
      if (!toolArgs.repository || !toolArgs.itemId) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository and itemId',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['get-related-items'](toolArgs, this.memoryService);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in get-related-items tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get related items',
      });
    }
  };

  // Add handlers for Graph Algorithm Tools

  private handleKCoreDecomposition = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, branch?, k? }
      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['k-core-decomposition'](toolArgs, this.memoryService);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in k-core-decomposition tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to perform k-core decomposition',
      });
    }
  };

  private handleLouvainCommunityDetection = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, branch? }
      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['louvain-community-detection'](
        toolArgs,
        this.memoryService,
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in louvain-community-detection tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to perform Louvain community detection',
      });
    }
  };

  private handlePageRank = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, branch?, dampingFactor?, iterations? }
      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['pagerank'](toolArgs, this.memoryService);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in pagerank tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to calculate PageRank',
      });
    }
  };

  private handleStronglyConnectedComponents = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, branch? }
      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['strongly-connected-components'](
        toolArgs,
        this.memoryService,
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in strongly-connected-components tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to find strongly connected components',
      });
    }
  };

  private handleWeaklyConnectedComponents = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, branch? }
      if (!toolArgs.repository) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameter: repository',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['weakly-connected-components'](
        toolArgs,
        this.memoryService,
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in weakly-connected-components tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to find weakly connected components',
      });
    }
  };

  private handleShortestPath = async (req: Request, res: Response): Promise<void> => {
    try {
      const toolArgs = req.body; // Expects { repository, startNodeId, endNodeId, branch?, relationshipTypes?, direction?, algorithm? }
      if (!toolArgs.repository || !toolArgs.startNodeId || !toolArgs.endNodeId) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: repository, startNodeId, and endNodeId',
        });
        return;
      }
      toolArgs.branch = toolArgs.branch || 'main';
      const result = await toolHandlers['shortest-path'](toolArgs, this.memoryService);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Error in shortest-path tool (HTTP):', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to find shortest path',
      });
    }
  };
}
