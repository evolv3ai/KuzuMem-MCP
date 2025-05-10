import express, { Request, Response } from 'express';
import { MemoryController } from '../controllers/memory.controller';
import { MemoryService } from '../services/memory.service';
import { MEMORY_BANK_MCP_SERVER, MEMORY_BANK_MCP_TOOLS } from './';

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
    
    // MCP Tool-specific endpoints
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
      const { repository } = req.body;
      
      if (!repository) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameter: repository" 
        });
        return;
      }
      
      await this.memoryService.initMemoryBank(repository);
      
      res.json({
        success: true,
        message: `Memory bank initialized for repository: ${repository}`
      });
    } catch (error) {
      console.error('Error initializing memory bank:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to initialize memory bank" 
      });
    }
  };

  /**
   * Handle get metadata tool
   */
  private handleGetMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.body;
      
      if (!repository) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameter: repository" 
        });
        return;
      }
      
      const metadata = await this.memoryService.getMetadata(repository);
      
      if (!metadata) {
        res.status(404).json({ 
          success: false, 
          error: "Metadata not found" 
        });
        return;
      }
      
      res.json({
        success: true,
        metadata
      });
    } catch (error) {
      console.error('Error getting metadata:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get metadata" 
      });
    }
  };

  /**
   * Handle update metadata tool
   */
  private handleUpdateMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, metadata } = req.body;
      
      if (!repository || !metadata) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameters: repository and metadata" 
        });
        return;
      }
      
      const updatedMetadata = await this.memoryService.updateMetadata(repository, metadata);
      
      if (!updatedMetadata) {
        res.status(404).json({ 
          success: false, 
          error: "Failed to update metadata" 
        });
        return;
      }
      
      res.json({
        success: true,
        metadata: updatedMetadata
      });
    } catch (error) {
      console.error('Error updating metadata:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to update metadata" 
      });
    }
  };

  /**
   * Handle get context tool
   */
  private handleGetContext = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, latest, limit } = req.body;
      
      if (!repository) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameter: repository" 
        });
        return;
      }
      
      if (latest) {
        const context = await this.memoryService.getTodayContext(repository);
        
        if (!context) {
          res.status(404).json({ 
            success: false, 
            error: "Context not found" 
          });
          return;
        }
        
        res.json({
          success: true,
          context: [context]
        });
      } else {
        const limitNum = limit ? parseInt(limit.toString()) : 10;
        const contexts = await this.memoryService.getLatestContexts(repository, limitNum);
        
        res.json({
          success: true,
          context: contexts
        });
      }
    } catch (error) {
      console.error('Error getting context:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get context" 
      });
    }
  };

  /**
   * Handle update context tool
   */
  private handleUpdateContext = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, agent, issue, summary, decision, observation } = req.body;
      
      if (!repository) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameter: repository" 
        });
        return;
      }
      
      // Get current context
      const context = await this.memoryService.getTodayContext(repository);
      
      if (!context) {
        res.status(404).json({ 
          success: false, 
          error: "Context not found" 
        });
        return;
      }
      
      // Create update object
      const update: any = {};
      
      if (agent) update.agent = agent;
      if (issue) update.related_issue = issue;
      if (summary) update.summary = summary;
      
      if (decision) {
        update.decisions = [...(context.decisions || []), decision];
      }
      
      if (observation) {
        update.observations = [...(context.observations || []), observation];
      }
      
      const updatedContext = await this.memoryService.updateTodayContext(repository, update);
      
      if (!updatedContext) {
        res.status(404).json({ 
          success: false, 
          error: "Failed to update context" 
        });
        return;
      }
      
      res.json({
        success: true,
        context: updatedContext
      });
    } catch (error) {
      console.error('Error updating context:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to update context" 
      });
    }
  };

  /**
   * Handle add component tool
   */
  private handleAddComponent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, id, name, kind, depends_on, status } = req.body;
      
      if (!repository || !id || !name) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameters: repository, id, and name" 
        });
        return;
      }
      
      const component = {
        name,
        kind,
        depends_on,
        status: status || 'active'
      };
      
      const result = await this.memoryService.upsertComponent(repository, id, component);
      
      if (!result) {
        res.status(404).json({ 
          success: false, 
          error: "Failed to add component" 
        });
        return;
      }
      
      res.json({
        success: true,
        component: result
      });
    } catch (error) {
      console.error('Error adding component:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to add component" 
      });
    }
  };

  /**
   * Handle add decision tool
   */
  private handleAddDecision = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, id, name, context, date } = req.body;
      
      if (!repository || !id || !name || !date) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameters: repository, id, name, and date" 
        });
        return;
      }
      
      const decision = {
        name,
        context,
        date
      };
      
      const result = await this.memoryService.upsertDecision(repository, id, decision);
      
      if (!result) {
        res.status(404).json({ 
          success: false, 
          error: "Failed to add decision" 
        });
        return;
      }
      
      res.json({
        success: true,
        decision: result
      });
    } catch (error) {
      console.error('Error adding decision:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to add decision" 
      });
    }
  };

  /**
   * Handle add rule tool
   */
  private handleAddRule = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, id, name, created, triggers, content, status } = req.body;
      
      if (!repository || !id || !name || !created) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameters: repository, id, name, and created" 
        });
        return;
      }
      
      const rule = {
        name,
        created,
        triggers,
        content,
        status: status || 'active'
      };
      
      const result = await this.memoryService.upsertRule(repository, id, rule);
      
      if (!result) {
        res.status(404).json({ 
          success: false, 
          error: "Failed to add rule" 
        });
        return;
      }
      
      res.json({
        success: true,
        rule: result
      });
    } catch (error) {
      console.error('Error adding rule:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to add rule" 
      });
    }
  };

  /**
   * Handle export memory bank tool
   */
  private handleExportMemoryBank = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.body;
      
      if (!repository) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameter: repository" 
        });
        return;
      }
      
      const files = await this.memoryService.exportMemoryBank(repository);
      
      res.json({
        success: true,
        files
      });
    } catch (error) {
      console.error('Error exporting memory bank:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to export memory bank" 
      });
    }
  };

  /**
   * Handle import memory bank tool
   */
  private handleImportMemoryBank = async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, content, type, id } = req.body;
      
      if (!repository || !content || !type || !id) {
        res.status(400).json({ 
          success: false, 
          error: "Missing required parameters: repository, content, type, and id" 
        });
        return;
      }
      
      // Validate memory type
      if (!['metadata', 'context', 'component', 'decision', 'rule'].includes(type)) {
        res.status(400).json({ 
          success: false, 
          error: "Invalid memory type. Must be one of: metadata, context, component, decision, rule" 
        });
        return;
      }
      
      const memoryType = type as 'metadata' | 'context' | 'component' | 'decision' | 'rule';
      const success = await this.memoryService.importMemoryBank(repository, content, memoryType, id);
      
      if (!success) {
        res.status(400).json({ 
          success: false, 
          error: "Failed to import memory bank" 
        });
        return;
      }
      
      res.json({
        success: true,
        message: "Memory bank imported successfully"
      });
    } catch (error) {
      console.error('Error importing memory bank:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to import memory bank" 
      });
    }
  };
}
