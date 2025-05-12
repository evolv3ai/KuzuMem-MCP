import request from 'supertest'; // For HTTP requests
import EventSource from 'eventsource'; // Assuming installed
import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { MEMORY_BANK_MCP_TOOLS } from '../../mcp/tools'; // Adjust path as needed
import { McpTool } from '../../mcp'; // Adjust path
import { Component, Decision, Rule, Context, Metadata, ComponentStatus } from '../../types'; // Adjust path
import { setupTestDB, cleanupTestDB } from '../utils/test-db-setup'; // Removed dbPath import

// Increase Jest timeout
jest.setTimeout(90000);

const STREAM_PORT = process.env.HTTP_STREAM_PORT || 3001;
const STREAM_HOST = process.env.HOST || 'localhost';
const BASE_URL = `http://${STREAM_HOST}:${STREAM_PORT}`;

// Interface for the resolved value of collectStreamEvents
interface CollectedSseEvents {
  events: any[];
  progressEventsCount: number;
  finalResponseEvent: any | null;
  errorEvent: any | null;
  connectionError?: Error;
}

// Copied from httpstream-streaming-implementation.md guide
const collectStreamEvents = async (sseResponseEmitter: any): Promise<CollectedSseEvents> => {
  const events: any[] = [];
  let progressEventsCount = 0;
  let finalResponseEvent: any = null;
  let errorEvent: any = null;

  return new Promise<CollectedSseEvents>((resolve, reject) => {
    // Specify Promise return type here
    let buffer = '';
    const processBuffer = () => {
      let eolIndex;
      while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
        const message = buffer.substring(0, eolIndex);
        buffer = buffer.substring(eolIndex + 2);
        if (message.trim() === '') {
          continue;
        }

        const lines = message.split('\n');
        let eventType = 'message'; // Default SSE event type
        let eventDataString = '';
        let eventId = null;

        lines.forEach((line) => {
          if (line.startsWith('event:')) {
            eventType = line.substring('event:'.length).trim();
          } else if (line.startsWith('data:')) {
            eventDataString = line.substring('data:'.length).trim();
          } else if (line.startsWith('id:')) {
            eventId = line.substring('id:'.length).trim();
          }
        });

        try {
          const parsedData = JSON.parse(eventDataString);
          const eventPayload = { type: eventType, id: eventId, data: parsedData };
          events.push(eventPayload);
          if (eventType === 'mcpNotification' && parsedData.method === 'tools/progress') {
            progressEventsCount++;
          }
          if (eventType === 'mcpResponse') {
            finalResponseEvent = eventPayload;
          }
          if (eventType === 'error') {
            // General SSE error or specific error event
            errorEvent = eventPayload;
          }
        } catch (e) {
          console.error('Failed to parse SSE event data:', eventDataString, e);
        }
      }
    };

    if (sseResponseEmitter.on) {
      // typical for superagent response stream or EventSource
      sseResponseEmitter.on('data', (chunk: Buffer | string) => {
        buffer += chunk.toString();
        processBuffer();
      });
      sseResponseEmitter.on('end', () => {
        if (buffer.length > 0) {
          processBuffer();
        } // Process any remaining buffer
        resolve({ events, progressEventsCount, finalResponseEvent, errorEvent });
      });
      sseResponseEmitter.on('error', (err: Error) => {
        if (!errorEvent) {
          errorEvent = { type: 'connection_error', data: err };
        }
        reject({
          events,
          progressEventsCount,
          finalResponseEvent,
          errorEvent,
          connectionError: err,
        });
      });
    } else {
      return reject(new Error('Provided sseResponseEmitter does not have .on method for events'));
    }
  });
};

describe('MCP HTTP Stream Server E2E Tests', () => {
  let serverProcess: ChildProcess;
  let dbPathForTest: string; // Will be set by setupTestDB return value
  const testRepository = 'e2e-httpstream-repo'; // Specific repo for these tests
  const testBranch = 'main';
  let testComponentId: string | null = null;
  let dependentComponentId: string;

  const startHttpStreamServer = (envVars: Record<string, string> = {}): Promise<void> => {
    return new Promise((resolve, reject) => {
      const serverFilePath = path.resolve(__dirname, '../../mcp-httpstream-server.ts');
      // Use STREAM_PORT for the PORT env var for this server
      const defaultEnv = {
        PORT: String(STREAM_PORT),
        DEBUG: '1',
        DB_FILENAME: dbPathForTest,
        ...envVars,
      };

      serverProcess = spawn('npx', ['ts-node', serverFilePath], {
        env: { ...process.env, ...defaultEnv },
        shell: true,
        detached: false, // Changed to false for simpler process killing
      });

      let output = '';
      let resolved = false;
      serverProcess.stdout?.on('data', (data) => {
        const sData = data.toString();
        output += sData;
        if (
          !resolved &&
          sData.includes(
            `MCP HTTP Streaming Server running at http://${STREAM_HOST}:${STREAM_PORT}`,
          )
        ) {
          console.log('HTTP Stream Server ready.');
          resolved = true;
          resolve();
        }
      });
      serverProcess.stderr?.on('data', (data) => {
        const sData = data.toString();
        output += sData;
        console.error(`HTTPSTREAM_SERVER_STDERR: ${sData}`);
        if (!resolved && (sData.includes('EADDRINUSE') || sData.toLowerCase().includes('error'))) {
          // If an error occurs before resolving, reject to prevent test timeout
          // resolved = true; // prevent multiple rejects
          // reject(new Error(`Server failed to start: ${sData.substring(0,300)}`));
        }
      });
      serverProcess.on('error', (err) => {
        console.error('Failed to start HTTP Stream server process:', err);
        if (!resolved) {
          reject(err);
        }
      });
      serverProcess.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
          console.warn(
            `HTTP Stream Server process exited unexpectedly with code ${code}, signal ${signal}. Output:\n${output}`,
          );
        }
      });
    });
  };

  beforeAll(async () => {
    dbPathForTest = await setupTestDB('httpstream_e2e_test.kuzu');
    await startHttpStreamServer();

    const repository = testRepository; // Use the suite-defined testRepository
    const branch = testBranch;

    console.log(`HTTP Stream E2E: Initializing memory bank for ${repository}...`);
    const initPayload = {
      jsonrpc: '2.0',
      id: 'init_e2e_http',
      method: 'tools/call',
      params: { name: 'init-memory-bank', arguments: { repository, branch } },
    };
    let httpResponse = await request(BASE_URL)
      .post('/mcp')
      .set('Origin', 'http://localhost')
      .send(initPayload)
      .expect(200);
    expect(httpResponse.body.id).toBe('init_e2e_http');
    expect(httpResponse.body.result?.success).toBe(true);
    console.log('HTTP Stream E2E: Memory bank initialized.');

    // --- BEGIN FULL DATA SEEDING (adapted from stdio tests) ---
    console.log('HTTP Stream E2E: Seeding database with initial data...');

    // Seed Components
    const componentsToSeed = [
      {
        id: 'comp-seed-001',
        name: 'Seeded Component Alpha',
        kind: 'library',
        status: 'active' as ComponentStatus,
      },
      {
        id: 'comp-seed-002',
        name: 'Seeded Component Beta',
        kind: 'service',
        status: 'active' as ComponentStatus,
        depends_on: ['comp-seed-001'],
      },
      {
        id: 'comp-seed-003',
        name: 'Seeded Component Gamma',
        kind: 'API',
        status: 'planned' as ComponentStatus,
      },
      {
        id: 'comp-seed-004',
        name: 'Seeded Component Delta',
        kind: 'database',
        status: 'deprecated' as ComponentStatus,
      },
      {
        id: 'comp-seed-005',
        name: 'Seeded Component Epsilon',
        kind: 'UI',
        status: 'active' as ComponentStatus,
      },
    ];
    testComponentId = componentsToSeed[0].id; // Save one for later tests if needed
    dependentComponentId = componentsToSeed[1].id; // Save one for later tests if needed

    for (const comp of componentsToSeed) {
      const addCompPayload = {
        jsonrpc: '2.0',
        id: `add_comp_${comp.id}`,
        method: 'tools/call',
        params: { name: 'add-component', arguments: { repository, branch, ...comp } },
      };
      httpResponse = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(addCompPayload)
        .expect(200);
      expect(httpResponse.body.result?.success).toBe(true);
    }
    console.log(`${componentsToSeed.length} components seeded for HTTP E2E.`);

    // Seed Contexts
    const contextsToSeed = [
      {
        summary: 'Initial context for seeding via HTTP',
        agent: 'seed-script-http',
        decisions: ['DEC-SEED-001'],
        observations: ['OBS-SEED-001'],
      },
      {
        summary: 'Another seeded context entry via HTTP',
        agent: 'seed-script-http',
        decisions: ['DEC-SEED-002'],
        observations: ['OBS-SEED-002', 'OBS-SEED-003'],
      },
    ];
    for (const ctxData of contextsToSeed) {
      const updateCtxPayload = {
        jsonrpc: '2.0',
        id: `update_ctx_${crypto.randomUUID()}`,
        method: 'tools/call',
        params: { name: 'update-context', arguments: { repository, branch, ...ctxData } },
      };
      httpResponse = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(updateCtxPayload)
        .expect(200);
      expect(httpResponse.body.result?.success).toBe(true);
    }
    console.log(`${contextsToSeed.length} context entries updated/seeded for HTTP E2E.`);

    // Seed Decisions
    const decisionsToSeed = [
      {
        id: 'dec-seed-001',
        name: 'Seeded HTTP Decision Alpha',
        date: '2023-01-01',
        context: 'Regarding initial HTTP setup',
      },
      {
        id: 'dec-seed-002',
        name: 'Seeded HTTP Decision Beta',
        date: '2023-01-15',
        context: 'HTTP Architectural choice',
      },
    ];
    for (const dec of decisionsToSeed) {
      const addDecPayload = {
        jsonrpc: '2.0',
        id: `add_dec_${dec.id}`,
        method: 'tools/call',
        params: { name: 'add-decision', arguments: { repository, branch, ...dec } },
      };
      httpResponse = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(addDecPayload)
        .expect(200);
      expect(httpResponse.body.result?.success).toBe(true);
    }
    console.log(`${decisionsToSeed.length} decisions seeded for HTTP E2E.`);

    // Seed Rules
    const rulesToSeed = [
      {
        id: 'rule-seed-001',
        name: 'Seeded HTTP Rule Alpha',
        created: '2023-01-05',
        content: 'Standard HTTP linting',
        status: 'active' as const,
      },
      {
        id: 'rule-seed-002',
        name: 'Seeded HTTP Rule Beta',
        created: '2023-01-20',
        content: 'HTTP Security check',
        status: 'active' as const,
        triggers: ['commit', 'push'],
      },
    ];
    for (const rule of rulesToSeed) {
      const addRulePayload = {
        jsonrpc: '2.0',
        id: `add_rule_${rule.id}`,
        method: 'tools/call',
        params: { name: 'add-rule', arguments: { repository, branch, ...rule } },
      };
      httpResponse = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(addRulePayload)
        .expect(200);
      expect(httpResponse.body.result?.success).toBe(true);
    }
    console.log(`${rulesToSeed.length} rules seeded for HTTP E2E.`);
    console.log('HTTP Stream E2E: Database seeding complete.');
    // --- END DATA SEEDING ---
  }, 120000);

  afterAll(async () => {
    if (serverProcess && serverProcess.pid && !serverProcess.killed) {
      console.log('Stopping HTTP Stream server...');
      serverProcess.kill();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    // Pass the specific path to cleanupTestDB
    if (dbPathForTest) {
      await cleanupTestDB(dbPathForTest);
    }
  });

  it('T_HTTPSTREAM_001: /initialize should return server capabilities', async () => {
    const response = await request(BASE_URL)
      .post('/initialize')
      .set('Origin', 'http://localhost')
      .send({ protocolVersion: '0.1' })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.result).toBeDefined();
    expect(response.body.result.capabilities.tools).toEqual({ list: true, call: true });
    expect(response.body.result.serverInfo.name).toBe('KuzuMem-MCP');
  });

  it('T_HTTPSTREAM_002: /tools/list should return list of tools', async () => {
    const response = await request(BASE_URL)
      .get('/tools/list')
      .set('Origin', 'http://localhost')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(Array.isArray(response.body.tools)).toBe(true);
    expect(response.body.tools.length).toBe(MEMORY_BANK_MCP_TOOLS.length);
    expect(response.body.tools[0]).toHaveProperty('name');
    expect(response.body.tools[0]).toHaveProperty('inputSchema');
  });

  it('T_HTTPSTREAM_003: /mcp tools/call (JSON) should execute a batch tool', async () => {
    const repoName = 'e2e-httpstream-repo';
    const metadataContent = {
      id: 'meta',
      project: {
        name: repoName,
        created: new Date().toISOString().split('T')[0],
        description: 'Test E2E HTTP',
      },
      tech_stack: { language: 'TypeScript' },
      architecture: 'test-driven',
      memory_spec_version: '3.0.0',
    };
    const response = await request(BASE_URL)
      .post('/mcp')
      .set('Origin', 'http://localhost')
      .send({
        jsonrpc: '2.0',
        id: 'update_meta_http',
        method: 'tools/call',
        params: {
          name: 'update-metadata',
          arguments: { repository: repoName, branch: 'main', metadata: metadataContent },
        },
      })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.id).toBe('update_meta_http');
    expect(response.body.result).toBeDefined();
    expect(response.body.result.success).toBe(true);
  });

  it('T_HTTPSTREAM_004: /mcp tools/call (SSE) should stream progress for get-component-dependencies', (done) => {
    // Ensure dependentComponentId and testComponentId are seeded from beforeAll
    expect(dependentComponentId).toBeDefined();
    expect(testComponentId).toBeDefined();

    const toolArgs = {
      repository: testRepository,
      branch: testBranch,
      componentId: dependentComponentId,
      depth: 1, // Keep depth 1 for simpler expected output for now
    };
    const payload = {
      jsonrpc: '2.0',
      id: 'sse_get_deps_http',
      method: 'tools/call',
      params: { name: 'get-component-dependencies', arguments: toolArgs },
    };

    const sseRequest = request(BASE_URL)
      .post('/mcp')
      .set('Origin', 'http://localhost') // As required by server
      .set('Accept', 'text/event-stream')
      .send(payload);

    // Pipe the response stream to collectStreamEvents
    // supertest .agent() might be needed if BASE_URL is tricky or cookies/session needed later
    // For now, direct request should pipe correctly.
    sseRequest
      .expect(200) // Expect initial 200 OK for SSE stream connection
      .parse(async (res: any, callback: any) => {
        // superagent/supertest response object `res` is a stream here for SSE
        // We need to collect events from it.
        // The `collectStreamEvents` function is designed to work with such a stream emitter.
        try {
          // Use the defined interface for the destructured result
          const {
            events,
            progressEventsCount,
            finalResponseEvent,
            errorEvent,
          }: CollectedSseEvents = await collectStreamEvents(res);

          // Basic checks
          expect(errorEvent).toBeNull(); // Should be no protocol/transport errors
          expect(progressEventsCount).toBeGreaterThanOrEqual(2); // At least init and in_progress
          expect(finalResponseEvent).toBeDefined();
          expect(finalResponseEvent.data.id).toBe('sse_get_deps_http');

          // Check for initializing progress event
          const initProgress = events.find(
            (ev: any) =>
              ev.type === 'mcpNotification' &&
              ev.data.method === 'tools/progress' &&
              !ev.data.params.isFinal &&
              JSON.parse(ev.data.params.content[0].text).status === 'initializing',
          );
          expect(initProgress).toBeDefined();

          // Check for an in_progress event with dependencies
          const inProgress = events.find(
            (ev: any) =>
              ev.type === 'mcpNotification' &&
              ev.data.method === 'tools/progress' &&
              !ev.data.params.isFinal &&
              JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
          );
          expect(inProgress).toBeDefined();
          const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
          expect(Array.isArray(inProgressContent.dependencies)).toBe(true);
          // For depth 1, this should find testComponentId
          expect(
            inProgressContent.dependencies.some((c: Component) => c.id === testComponentId),
          ).toBe(true);

          // Check for the final progress event (isFinal: true)
          const finalProgress = events.find(
            (ev: any) =>
              ev.type === 'mcpNotification' &&
              ev.data.method === 'tools/progress' &&
              ev.data.params.isFinal === true,
          );
          expect(finalProgress).toBeDefined();
          const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
          expect(finalProgressContent.status).toBe('complete');
          expect(Array.isArray(finalProgressContent.dependencies)).toBe(true);
          expect(
            finalProgressContent.dependencies.some((c: Component) => c.id === testComponentId),
          ).toBe(true);

          // Check the final mcpResponse event
          expect(finalResponseEvent.data.result).toBeDefined();
          expect(finalResponseEvent.data.result.status).toBe('complete');
          expect(Array.isArray(finalResponseEvent.data.result.dependencies)).toBe(true);
          expect(
            finalResponseEvent.data.result.dependencies.some(
              (c: Component) => c.id === testComponentId,
            ),
          ).toBe(true);

          callback(null, null); // Indicate to supertest parser that we are done
        } catch (assertionError) {
          callback(assertionError, null);
        }
      })
      .end(done); // Use Jest's done callback for async test completion
  });
});
