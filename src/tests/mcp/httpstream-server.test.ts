import request from 'supertest';
import { Response } from 'superagent';
import express from 'express';
import { MemoryService } from '../../services/memory.service';

// Import app directly, but export the raw app before listen() is called
import { app, configureServer } from '../../mcp-httpstream-server';

// Mock the MemoryService
jest.mock('../../services/memory.service', () => {
  const mockInstance = {
    initMemoryBank: jest.fn().mockResolvedValue(true),
    getMetadata: jest
      .fn()
      .mockResolvedValue({ id: "meta", project: { name: "TestProject" } }),
    updateMetadata: jest
      .fn()
      .mockResolvedValue({ id: "meta", project: { name: "UpdatedProject" } }),
    getTodayContext: jest
      .fn()
      .mockResolvedValue({ id: "ctx-2025-05-10", summary: "Test context" }),
    getLatestContexts: jest
      .fn()
      .mockResolvedValue([{ id: "ctx-2025-05-10", summary: "Test context" }]),
    updateTodayContext: jest
      .fn()
      .mockResolvedValue({ id: "ctx-2025-05-10", summary: "Updated context" }),
    upsertComponent: jest
      .fn()
      .mockResolvedValue({ id: "comp-test", name: "TestComponent" }),
    upsertDecision: jest
      .fn()
      .mockResolvedValue({ id: "dec-test", name: "TestDecision" }),
    upsertRule: jest
      .fn()
      .mockResolvedValue({ id: "rule-test", name: "TestRule" }),
    exportMemoryBank: jest
      .fn()
      .mockResolvedValue({
        metadata: "yaml content",
        contexts: ["yaml content"],
      }),
    importMemoryBank: jest.fn().mockResolvedValue(true),
  };

  return {
    MemoryService: {
      getInstance: jest.fn().mockResolvedValue(mockInstance),
    },
  };
});

// Mock the MemoryController
jest.mock('../../controllers/memory.controller', () => {
  return {
    MemoryController: {
      getInstance: jest.fn().mockResolvedValue({}),
    },
  };
});

// Extend Response type to include text property
interface StreamResponse extends Response {
  text: string;
}

// Helper to collect streaming responses
const collectStreamEvents = async (response: Response) => {
  const events: any[] = [];
  let startEvent = false;
  let resultEvent = false;
  let errorEvent = false;

  return new Promise((resolve, reject) => {
    response.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n\n");
      for (const line of lines) {
        if (line.trim() === "") continue;

        // Parse the event type and data
        const eventMatch = line.match(/event: (\w+)\ndata: (.+)/);
        if (eventMatch) {
          const [, eventType, eventData] = eventMatch;
          const parsedData = JSON.parse(eventData);
          events.push({ type: eventType, data: parsedData });

          if (eventType === "start") startEvent = true;
          if (eventType === "result") resultEvent = true;
          if (eventType === "error") errorEvent = true;
        }
      }
    });

    response.on("end", () => {
      resolve({
        events,
        hasStartEvent: startEvent,
        hasResultEvent: resultEvent,
        hasErrorEvent: errorEvent,
      });
    });

    response.on("error", (err: Error) => {
      reject(err);
    });
  });
};

describe("MCP HTTP Streaming Server", () => {
  let testApp: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    testApp = express();
    await configureServer(testApp);
  });

  describe('MCP /mcp Endpoint (JSON-RPC 2.0)', () => {
    test('POST /mcp (init-memory-bank) returns success', async () => {
      const response = await request(testApp)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send({
          jsonrpc: '2.0',
          method: 'init-memory-bank',
          params: { repository: 'test-repo' },
          id: 1
        });
      expect(response.status).toBe(200);
      expect(response.body.result).toEqual({ success: true, message: 'Memory bank initialized' });
      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(1);
      expect((await MemoryService.getInstance()).initMemoryBank).toHaveBeenCalledWith('test-repo');
    });

    test('POST /mcp (get-metadata) returns metadata', async () => {
      const response = await request(testApp)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send({
          jsonrpc: '2.0',
          method: 'get-metadata',
          params: { repository: 'test-repo' },
          id: 2
        });
      expect(response.status).toBe(200);
      expect(response.body.result).toEqual({ id: 'meta', project: { name: 'TestProject' } });
      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(2);
      expect((await MemoryService.getInstance()).getMetadata).toHaveBeenCalledWith('test-repo');
    });

    test('POST /mcp (missing repository param) returns error', async () => {
      const response = await request(testApp)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send({
          jsonrpc: '2.0',
          method: 'init-memory-bank',
          params: {},
          id: 3
        });
      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toMatch(/Missing repository parameter/);
      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(3);
    });

    test('POST /mcp (unknown method) returns error', async () => {
      const response = await request(testApp)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send({
          jsonrpc: '2.0',
          method: 'unknown-method',
          params: {},
          id: 4
        });
      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toMatch(/Method not implemented/);
      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(4);
    });

    test('POST /mcp batch returns array of results', async () => {
      const batch = [
        { jsonrpc: '2.0', method: 'init-memory-bank', params: { repository: 'test-repo' }, id: 10 },
        { jsonrpc: '2.0', method: 'get-metadata', params: { repository: 'test-repo' }, id: 11 }
      ];
      const response = await request(testApp)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(batch);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].result).toBeDefined();
      expect(response.body[1].result).toBeDefined();
    });
  });

  describe('MCP /mcp Endpoint (SSE Streaming)', () => {
    test('POST /mcp with Accept: text/event-stream streams JSON-RPC results', async () => {
      const response = await request(testApp)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'get-metadata',
          params: { repository: 'test-repo' },
          id: 20
        });
      expect(response.status).toBe(200);
      // Should contain event: result and JSON-RPC payload
      expect(response.text).toContain('event: result');
      expect(response.text).toContain('jsonrpc');
      expect(response.text).toContain('id');
      expect(response.text).toContain('TestProject');
    });

    test('POST /mcp with Accept: text/event-stream and error returns error event', async () => {
      const response = await request(testApp)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'init-memory-bank',
          params: {}, // missing repository
          id: 21
        });
      expect(response.status).toBe(200);
      expect(response.text).toContain('event: result');
      expect(response.text).toContain('error');
      expect(response.text).toContain('Missing repository parameter');
    });
  });

  describe('Other endpoints', () => {
    test('GET /health returns ok', async () => {
      const response = await request(testApp).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    test('GET /invalid-endpoint returns 404', async () => {
      const response = await request(testApp).get('/invalid-endpoint');
      expect(response.status).toBe(404);
    });
  });
});
