import { Router, Request, Response, NextFunction } from 'express';
import { MemoryController } from '../controllers/memory.controller';

const router = Router();
let controllerInstance: MemoryController | null = null;

// Middleware to ensure controller is initialized
const withController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!controllerInstance) {
      controllerInstance = await MemoryController.getInstance();
    }
    (req as any).memoryController = controllerInstance;
    next();
  } catch (error) {
    console.error('Error initializing memory controller:', error);
    res.status(500).json({ success: false, error: 'Server initialization error' });
  }
};

// Apply middleware to all routes
router.use(withController);

// Initialize memory bank
router.post('/repositories/:repository/init', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.initMemoryBank(req, res);
});

// Metadata routes
router.get('/repositories/:repository/metadata', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.getMetadata(req, res);
});

router.put('/repositories/:repository/metadata', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.updateMetadata(req, res);
});

// Context routes
router.get('/repositories/:repository/contexts/today', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.getTodayContext(req, res);
});

router.put('/repositories/:repository/contexts/today', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.updateTodayContext(req, res);
});

router.get('/repositories/:repository/contexts', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.getLatestContexts(req, res);
});

// Component routes
router.put('/repositories/:repository/components/:id', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.upsertComponent(req, res);
});

router.get('/repositories/:repository/components', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.getActiveComponents(req, res);
});

// Decision routes
router.put('/repositories/:repository/decisions/:id', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.upsertDecision(req, res);
});

router.get('/repositories/:repository/decisions', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.getDecisionsByDateRange(req, res);
});

// Rule routes
router.put('/repositories/:repository/rules/:id', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.upsertRule(req, res);
});

router.get('/repositories/:repository/rules', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.getActiveRules(req, res);
});

// Export/Import routes
router.get('/repositories/:repository/export', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.exportMemoryBank(req, res);
});

router.post('/repositories/:repository/import', (req: Request, res: Response) => {
  const controller = (req as any).memoryController;
  return controller.importMemoryBank(req, res);
});

export default router;
