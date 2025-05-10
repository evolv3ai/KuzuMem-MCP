import request from 'supertest';
import express from 'express';
import { MemoryMcpServer } from '../../mcp';
import { MEMORY_BANK_MCP_SERVER, MEMORY_BANK_MCP_TOOLS } from '../../mcp/tools';
import { MemoryService } from '../../services/memory.service';

// Mock the MemoryService
jest.mock('../../services/memory.service', () => {
  const mockInstance = {
    initMemoryBank: jest.fn().mockResolvedValue(true),
    getMetadata: jest.fn().mockResolvedValue({ id: 'meta', project: { name: 'TestProject' } }),
    updateMetadata: jest.fn().mockResolvedValue({ id: 'meta', project: { name: 'UpdatedProject' } }),
    getTodayContext: jest.fn().mockResolvedValue({ id: 'ctx-2025-05-10', summary: 'Test context' }),
    getLatestContexts: jest.fn().mockResolvedValue([{ id: 'ctx-2025-05-10', summary: 'Test context' }]),
    updateTodayContext: jest.fn().mockResolvedValue({ id: 'ctx-2025-05-10', summary: 'Updated context' }),
    upsertComponent: jest.fn().mockResolvedValue({ id: 'comp-test', name: 'TestComponent' }),
    upsertDecision: jest.fn().mockResolvedValue({ id: 'dec-test', name: 'TestDecision' }),
    upsertRule: jest.fn().mockResolvedValue({ id: 'rule-test', name: 'TestRule' }),
    exportMemoryBank: jest.fn().mockResolvedValue({ metadata: 'yaml content', contexts: ['yaml content'] }),
    importMemoryBank: jest.fn().mockResolvedValue(true)
  };

  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue(mockInstance)
    }
  };
});

// Mock the MemoryController
jest.mock('../../controllers/memory.controller', () => {
  return {
    MemoryController: {
      getInstance: jest.fn().mockResolvedValue({})
    }
  };
});

describe('MemoryMcpServer', () => {
  let app: express.Application;
  let server: MemoryMcpServer;
  
  beforeEach(async () => {
    // Set up a clean Express app for each test
    app = express();
    server = new MemoryMcpServer();
    const router = await server.initialize();
    app.use('/mcp', express.json(), router);
  });

  describe('Server Metadata Endpoints', () => {
    test('GET /mcp/server should return server info', async () => {
      const response = await request(app).get('/mcp/server');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual(MEMORY_BANK_MCP_SERVER);
    });

    test('GET /mcp/tools should return tools info', async () => {
      const response = await request(app).get('/mcp/tools');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual(MEMORY_BANK_MCP_TOOLS);
    });
  });

  describe('Memory Bank Operations', () => {
    test('POST /mcp/tools/init-memory-bank should initialize a memory bank', async () => {
      const response = await request(app)
        .post('/mcp/tools/init-memory-bank')
        .send({ repository: 'test-repo' });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(MemoryService.getInstance).toHaveBeenCalled();
      expect((await MemoryService.getInstance()).initMemoryBank).toHaveBeenCalledWith('test-repo');
    });

    test('POST /mcp/tools/init-memory-bank should return 400 if repository is missing', async () => {
      const response = await request(app)
        .post('/mcp/tools/init-memory-bank')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Metadata Operations', () => {
    test('POST /mcp/tools/get-metadata should get metadata', async () => {
      const response = await request(app)
        .post('/mcp/tools/get-metadata')
        .send({ repository: 'test-repo' });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.metadata).toBeDefined();
      expect((await MemoryService.getInstance()).getMetadata).toHaveBeenCalledWith('test-repo');
    });

    test('POST /mcp/tools/update-metadata should update metadata', async () => {
      const response = await request(app)
        .post('/mcp/tools/update-metadata')
        .send({ 
          repository: 'test-repo', 
          metadata: { project: { name: 'UpdatedProject' } }
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.metadata).toBeDefined();
      expect((await MemoryService.getInstance()).updateMetadata).toHaveBeenCalledWith(
        'test-repo', 
        { project: { name: 'UpdatedProject' } }
      );
    });
  });

  describe('Context Operations', () => {
    test('POST /mcp/tools/get-context with latest=true should get today\'s context', async () => {
      const response = await request(app)
        .post('/mcp/tools/get-context')
        .send({ repository: 'test-repo', latest: true });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.context).toHaveLength(1);
      expect((await MemoryService.getInstance()).getTodayContext).toHaveBeenCalledWith('test-repo');
    });

    test('POST /mcp/tools/get-context with latest=false should get latest contexts', async () => {
      const response = await request(app)
        .post('/mcp/tools/get-context')
        .send({ repository: 'test-repo', latest: false, limit: 5 });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.context).toBeDefined();
      expect((await MemoryService.getInstance()).getLatestContexts).toHaveBeenCalledWith('test-repo', 5);
    });

    test('POST /mcp/tools/update-context should update context', async () => {
      const response = await request(app)
        .post('/mcp/tools/update-context')
        .send({ 
          repository: 'test-repo', 
          summary: 'Updated context',
          agent: 'test-agent',
          issue: 'test-issue',
          decision: 'test-decision',
          observation: 'test-observation'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.context).toBeDefined();
      expect((await MemoryService.getInstance()).getTodayContext).toHaveBeenCalledWith('test-repo');
      expect((await MemoryService.getInstance()).updateTodayContext).toHaveBeenCalled();
    });
  });

  describe('Component Operations', () => {
    test('POST /mcp/tools/add-component should add a component', async () => {
      const response = await request(app)
        .post('/mcp/tools/add-component')
        .send({ 
          repository: 'test-repo', 
          id: 'comp-test',
          name: 'TestComponent',
          kind: 'service',
          depends_on: ['comp-dependency']
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.component).toBeDefined();
      expect((await MemoryService.getInstance()).upsertComponent).toHaveBeenCalled();
    });
  });

  describe('Decision Operations', () => {
    test('POST /mcp/tools/add-decision should add a decision', async () => {
      const response = await request(app)
        .post('/mcp/tools/add-decision')
        .send({ 
          repository: 'test-repo', 
          id: 'dec-test',
          name: 'TestDecision',
          context: 'Test decision context',
          date: '2025-05-10'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.decision).toBeDefined();
      expect((await MemoryService.getInstance()).upsertDecision).toHaveBeenCalled();
    });
  });

  describe('Rule Operations', () => {
    test('POST /mcp/tools/add-rule should add a rule', async () => {
      const response = await request(app)
        .post('/mcp/tools/add-rule')
        .send({ 
          repository: 'test-repo', 
          id: 'rule-test',
          name: 'TestRule',
          created: '2025-05-10',
          content: 'Test rule content',
          triggers: ['trigger1', 'trigger2']
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.rule).toBeDefined();
      expect((await MemoryService.getInstance()).upsertRule).toHaveBeenCalled();
    });
  });

  describe('Export/Import Operations', () => {
    test('POST /mcp/tools/export-memory-bank should export a memory bank', async () => {
      const response = await request(app)
        .post('/mcp/tools/export-memory-bank')
        .send({ repository: 'test-repo' });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.files).toBeDefined();
      expect((await MemoryService.getInstance()).exportMemoryBank).toHaveBeenCalledWith('test-repo');
    });

    test('POST /mcp/tools/import-memory-bank should import memory bank content', async () => {
      const response = await request(app)
        .post('/mcp/tools/import-memory-bank')
        .send({ 
          repository: 'test-repo',
          type: 'metadata',
          id: 'meta',
          content: 'yaml content'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect((await MemoryService.getInstance()).importMemoryBank).toHaveBeenCalledWith(
        'test-repo', 
        'yaml content', 
        'metadata', 
        'meta'
      );
    });

    test('POST /mcp/tools/import-memory-bank should return 400 for invalid memory type', async () => {
      const response = await request(app)
        .post('/mcp/tools/import-memory-bank')
        .send({ 
          repository: 'test-repo',
          type: 'invalid-type',
          id: 'meta',
          content: 'yaml content'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
