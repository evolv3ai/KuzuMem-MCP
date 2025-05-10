import { Request, Response } from 'express';
import { MemoryService } from '../services/memory.service';
import { 
  metadataSchema, 
  contextSchema,
  componentSchema,
  decisionSchema,
  ruleSchema
} from '../types';
import { z } from 'zod';
import { Mutex } from '../utils/mutex';

/**
 * Controller for memory bank operations
 * Implements the singleton pattern as per best practices
 */
export class MemoryController {
  private static instance: MemoryController;
  private static lock = new Mutex();
  private memoryService!: MemoryService;

  private constructor() {}
  
  /**
   * Initialize the controller with memory service
   * Uses proper lazy initialization
   */
  private async initialize(): Promise<void> {
    this.memoryService = await MemoryService.getInstance();
  }

  static async getInstance(): Promise<MemoryController> {
    // Acquire lock for thread safety
    const release = await MemoryController.lock.acquire();
    
    try {
      if (!MemoryController.instance) {
        MemoryController.instance = new MemoryController();
        await MemoryController.instance.initialize();
      }
      
      return MemoryController.instance;
    } finally {
      // Always release the lock
      release();
    }
  }

  /**
   * Async handler wrapper to properly handle Express middleware async functions
   */
  private asyncHandler = (fn: (req: Request, res: Response, next?: any) => Promise<void>) => {
    return (req: Request, res: Response, next?: any) => {
      Promise.resolve(fn(req, res, next)).catch(err => {
        console.error('Error in controller method:', err);
        res.status(500).json({ error: 'Internal server error' });
      });
    };
  };

  /**
   * Initialize a memory bank for a repository
   */
  initMemoryBank = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      await this.memoryService.initMemoryBank(repository);
      
      res.status(200).json({ message: 'Memory bank initialized successfully' });
    } catch (error) {
      console.error('Error initializing memory bank:', error);
      res.status(500).json({ error: 'Failed to initialize memory bank' });
    }
  });

  /**
   * Get metadata for a repository
   */
  getMetadata = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const metadata = await this.memoryService.getMetadata(repository);
      
      if (!metadata) {
        res.status(404).json({ error: 'Metadata not found' });
        return;
      }
      
      res.status(200).json(metadata);
    } catch (error) {
      console.error('Error getting metadata:', error);
      res.status(500).json({ error: 'Failed to get metadata' });
    }
  });

  /**
   * Update metadata for a repository
   */
  updateMetadata = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      const metadataContent = req.body;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const result = metadataSchema.safeParse(metadataContent);
      
      if (!result.success) {
        res.status(400).json({ 
          error: 'Invalid metadata format',
          details: result.error.format() 
        });
        return;
      }
      
      const updatedMetadata = await this.memoryService.updateMetadata(
        repository, 
        metadataContent.content
      );
      
      if (!updatedMetadata) {
        res.status(404).json({ error: 'Metadata not found' });
        return;
      }
      
      res.status(200).json(updatedMetadata);
    } catch (error) {
      console.error('Error updating metadata:', error);
      res.status(500).json({ error: 'Failed to update metadata' });
    }
  });

  /**
   * Get today's context
   */
  getTodayContext = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const context = await this.memoryService.getTodayContext(repository);
      
      if (!context) {
        res.status(404).json({ error: 'Context not found' });
        return;
      }
      
      res.status(200).json(context);
    } catch (error) {
      console.error('Error getting today context:', error);
      res.status(500).json({ error: 'Failed to get today context' });
    }
  });

  /**
   * Update today's context
   */
  updateTodayContext = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      const contextUpdate = req.body;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const result = contextSchema.partial().safeParse(contextUpdate);
      
      if (!result.success) {
        res.status(400).json({ 
          error: 'Invalid context format',
          details: result.error.format() 
        });
        return;
      }
      
      const updatedContext = await this.memoryService.updateTodayContext(
        repository, 
        contextUpdate
      );
      
      if (!updatedContext) {
        res.status(404).json({ error: 'Context not found' });
        return;
      }
      
      res.status(200).json(updatedContext);
    } catch (error) {
      console.error('Error updating today context:', error);
      res.status(500).json({ error: 'Failed to update today context' });
    }
  });

  /**
   * Get latest contexts
   */
  getLatestContexts = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      const { limit } = req.query;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const limitNum = limit ? parseInt(limit as string) : 10;
      
      const contexts = await this.memoryService.getLatestContexts(repository, limitNum);
      
      res.status(200).json(contexts);
    } catch (error) {
      console.error('Error getting latest contexts:', error);
      res.status(500).json({ error: 'Failed to get latest contexts' });
    }
  });

  /**
   * Create or update a component
   */
  upsertComponent = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, id } = req.params;
      const component = req.body;
      
      if (!repository || !id) {
        res.status(400).json({ error: 'Repository name and component ID are required' });
        return;
      }
      
      const result = componentSchema.omit({ yaml_id: true }).safeParse(component);
      
      if (!result.success) {
        res.status(400).json({ 
          error: 'Invalid component format',
          details: result.error.format() 
        });
        return;
      }
      
      const updatedComponent = await this.memoryService.upsertComponent(
        repository, 
        id,
        component
      );
      
      if (!updatedComponent) {
        res.status(404).json({ error: 'Failed to create or update component' });
        return;
      }
      
      res.status(200).json(updatedComponent);
    } catch (error) {
      console.error('Error upserting component:', error);
      res.status(500).json({ error: 'Failed to create or update component' });
    }
  });

  /**
   * Get active components
   */
  getActiveComponents = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const components = await this.memoryService.getActiveComponents(repository);
      
      res.status(200).json(components);
    } catch (error) {
      console.error('Error getting active components:', error);
      res.status(500).json({ error: 'Failed to get active components' });
    }
  });

  /**
   * Create or update a decision
   */
  upsertDecision = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, id } = req.params;
      const decision = req.body;
      
      if (!repository || !id) {
        res.status(400).json({ error: 'Repository name and decision ID are required' });
        return;
      }
      
      const result = decisionSchema.omit({ yaml_id: true }).safeParse(decision);
      
      if (!result.success) {
        res.status(400).json({ 
          error: 'Invalid decision format',
          details: result.error.format() 
        });
        return;
      }
      
      const updatedDecision = await this.memoryService.upsertDecision(
        repository, 
        id,
        decision
      );
      
      if (!updatedDecision) {
        res.status(404).json({ error: 'Failed to create or update decision' });
        return;
      }
      
      res.status(200).json(updatedDecision);
    } catch (error) {
      console.error('Error upserting decision:', error);
      res.status(500).json({ error: 'Failed to create or update decision' });
    }
  });

  /**
   * Get decisions by date range
   */
  getDecisionsByDateRange = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      const { startDate, endDate } = req.query;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Start date and end date are required' });
        return;
      }
      
      const decisions = await this.memoryService.getDecisionsByDateRange(
        repository, 
        startDate as string,
        endDate as string
      );
      
      res.status(200).json(decisions);
    } catch (error) {
      console.error('Error getting decisions by date range:', error);
      res.status(500).json({ error: 'Failed to get decisions by date range' });
    }
  });

  /**
   * Create or update a rule
   */
  upsertRule = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository, id } = req.params;
      const rule = req.body;
      
      if (!repository || !id) {
        res.status(400).json({ error: 'Repository name and rule ID are required' });
        return;
      }
      
      const result = ruleSchema.omit({ yaml_id: true }).safeParse(rule);
      
      if (!result.success) {
        res.status(400).json({ 
          error: 'Invalid rule format',
          details: result.error.format() 
        });
        return;
      }
      
      const updatedRule = await this.memoryService.upsertRule(
        repository, 
        id,
        rule
      );
      
      if (!updatedRule) {
        res.status(404).json({ error: 'Failed to create or update rule' });
        return;
      }
      
      res.status(200).json(updatedRule);
    } catch (error) {
      console.error('Error upserting rule:', error);
      res.status(500).json({ error: 'Failed to create or update rule' });
    }
  });

  /**
   * Get active rules
   */
  getActiveRules = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const rules = await this.memoryService.getActiveRules(repository);
      
      res.status(200).json(rules);
    } catch (error) {
      console.error('Error getting active rules:', error);
      res.status(500).json({ error: 'Failed to get active rules' });
    }
  });

  /**
   * Export memory bank
   */
  exportMemoryBank = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      const files = await this.memoryService.exportMemoryBank(repository);
      
      res.status(200).json(files);
    } catch (error) {
      console.error('Error exporting memory bank:', error);
      res.status(500).json({ error: 'Failed to export memory bank' });
    }
  });

  /**
   * Import memory bank
   */
  importMemoryBank = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { repository } = req.params;
      const { content, type, id } = req.body;
      
      if (!repository) {
        res.status(400).json({ error: 'Repository name is required' });
        return;
      }
      
      if (!content || !type || !id) {
        res.status(400).json({ 
          error: 'Content, memory type, and ID are required' 
        });
        return;
      }
      
      const typeSchema = z.enum(['metadata', 'context', 'component', 'decision', 'rule']);
      const typeResult = typeSchema.safeParse(type);
      
      if (!typeResult.success) {
        res.status(400).json({ 
          error: 'Invalid memory type. Must be one of: metadata, context, component, decision, rule' 
        });
        return;
      }
      
      const success = await this.memoryService.importMemoryBank(
        repository, 
        content,
        type,
        id
      );
      
      if (!success) {
        res.status(400).json({ error: 'Failed to import memory bank' });
        return;
      }
      
      res.status(200).json({ message: 'Memory bank imported successfully' });
    } catch (error) {
      console.error('Error importing memory bank:', error);
      res.status(500).json({ error: 'Failed to import memory bank' });
    }
  });
}
