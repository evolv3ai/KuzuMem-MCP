import request from 'supertest'; // For HTTP requests
import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { MEMORY_BANK_MCP_TOOLS } from '../../mcp/tools'; // Adjust path as needed
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

  // Share these across describe blocks if tests depend on IDs created in earlier blocks
  let sharedTestComponentId: string | null = null;
  let sharedDependentComponentId: string | null = null;
  let sharedTestDecisionId: string | null = null;
  let sharedTestRuleId: string | null = null;

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

  describe('Entity CRUD via /mcp (JSON)', () => {
    it('T_HTTPSTREAM_CRUD_add-component: should add a primary component', async () => {
      sharedTestComponentId = `e2e-http-crud-comp-${Date.now()}`;
      const compArgs = {
        repository: testRepository,
        branch: testBranch,
        id: sharedTestComponentId,
        name: 'HTTP CRUD Primary',
        kind: 'module',
        status: 'active' as ComponentStatus,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_comp_crud',
        method: 'tools/call',
        params: { name: 'add-component', arguments: compArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);
      expect(response.body.result?.success).toBe(true);
    });

    it('T_HTTPSTREAM_CRUD_add-component-dependent: should add a dependent component', async () => {
      expect(sharedTestComponentId).not.toBeNull();
      sharedDependentComponentId = `e2e-http-crud-dep-${Date.now()}`;
      const compArgs = {
        repository: testRepository,
        branch: testBranch,
        id: sharedDependentComponentId,
        name: 'HTTP CRUD Dependent',
        kind: 'service',
        status: 'active' as ComponentStatus,
        depends_on: [sharedTestComponentId!],
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_dep_crud',
        method: 'tools/call',
        params: { name: 'add-component', arguments: compArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);
      expect(response.body.result?.success).toBe(true);
    });

    it('T_HTTPSTREAM_CRUD_add-decision: should add a decision', async () => {
      sharedTestDecisionId = `e2e-http-crud-dec-${Date.now()}`;
      const decisionArgs = {
        repository: testRepository,
        branch: testBranch,
        id: sharedTestDecisionId,
        name: 'HTTP CRUD Decision',
        date: '2024-01-01',
        context: 'Test decision',
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_dec_crud',
        method: 'tools/call',
        params: { name: 'add-decision', arguments: decisionArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);
      expect(response.body.result?.success).toBe(true);
    });

    it('T_HTTPSTREAM_CRUD_add-rule: should add a rule', async () => {
      sharedTestRuleId = `e2e-http-crud-rule-${Date.now()}`;
      const ruleArgs = {
        repository: testRepository,
        branch: testBranch,
        id: sharedTestRuleId,
        name: 'HTTP CRUD Rule',
        created: '2024-01-01',
        content: 'Test rule',
        status: 'active' as const,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_rule_crud',
        method: 'tools/call',
        params: { name: 'add-rule', arguments: ruleArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);
      expect(response.body.result?.success).toBe(true);
    });
  });

  describe('Traversal and Graph Tools via /mcp (JSON responses)', () => {
    // Assumes components from CRUD tests or beforeAll are available (sharedTestComponentId, sharedDependentComponentId)
    it('T_HTTPSTREAM_JSON_get-component-dependencies: should retrieve dependencies', async () => {
      expect(sharedDependentComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        componentId: sharedDependentComponentId,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_deps_json',
        method: 'tools/call',
        params: { name: 'get-component-dependencies', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('get_deps_json');
      const resultWrapper = response.body.result;
      expect(resultWrapper.status).toBe('complete');
      expect(Array.isArray(resultWrapper.dependencies)).toBe(true);
      expect(
        resultWrapper.dependencies.some((c: Component) => c.id === sharedTestComponentId),
      ).toBe(true);
    });

    it('T_HTTPSTREAM_JSON_shortest-path: should find a shortest path', async () => {
      expect(sharedTestComponentId).toBeDefined();
      expect(sharedDependentComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        startNodeId: sharedDependentComponentId,
        endNodeId: sharedTestComponentId!,
        relationshipTypes: ['DEPENDS_ON'],
        direction: 'OUTGOING',
        // No projection params needed if default graph works for this simple path
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sp_json',
        method: 'tools/call',
        params: { name: 'shortest-path', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('sp_json');
      const resultWrapper = response.body.result;
      expect(resultWrapper.status).toBe('complete');
      expect(resultWrapper.pathFound).toBe(true);
      expect(Array.isArray(resultWrapper.path)).toBe(true);
      expect(resultWrapper.path.length).toBeGreaterThanOrEqual(1); // Path of at least start node if depends_on points to itself or direct
      expect(resultWrapper.path[0].id).toBe(sharedDependentComponentId);
      // For direct dependency, path length is 1 (edge), 2 nodes
      if (resultWrapper.path.length >= 2) {
        expect(resultWrapper.path[resultWrapper.path.length - 1].id).toBe(sharedTestComponentId);
      }
    });

    it('T_HTTPSTREAM_JSON_get-component-dependents: should retrieve dependents', async () => {
      expect(sharedTestComponentId).toBeDefined();
      expect(sharedDependentComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        componentId: sharedTestComponentId!,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_dependents_json',
        method: 'tools/call',
        params: { name: 'get-component-dependents', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('get_dependents_json');
      const resultWrapper = response.body.result;
      expect(resultWrapper.status).toBe('complete');
      expect(Array.isArray(resultWrapper.dependents)).toBe(true);
      // Check if the dependent component we created is listed
      expect(
        resultWrapper.dependents.some((c: Component) => c.id === sharedDependentComponentId),
      ).toBe(true);
    });

    it('T_HTTPSTREAM_JSON_shortest-path_reflexive: should handle reflexive shortest path', async () => {
      expect(sharedTestComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        startNodeId: sharedTestComponentId!,
        endNodeId: sharedTestComponentId!,
        // No specific projection needed, default behavior for reflexive path on non-existent loop
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sp_reflex_json',
        method: 'tools/call',
        params: { name: 'shortest-path', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('sp_reflex_json');
      const resultWrapper = response.body.result;
      expect(resultWrapper.status).toBe('complete');
      expect(resultWrapper.pathFound).toBe(false);
      expect(Array.isArray(resultWrapper.path)).toBe(true);
      expect(resultWrapper.path.length).toBe(0);
    });

    it('T_HTTPSTREAM_JSON_get-governing-items: should get governing items (expect empty based on current seeding)', async () => {
      expect(sharedTestComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        componentId: sharedTestComponentId!,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_gov_items_json',
        method: 'tools/call',
        params: { name: 'get-governing-items-for-component', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('get_gov_items_json');
      const resultWrapper = response.body.result;
      expect(resultWrapper.status).toBe('complete');
      expect(Array.isArray(resultWrapper.decisions)).toBe(true);
      expect(resultWrapper.decisions.length).toBe(0);
      expect(Array.isArray(resultWrapper.rules)).toBe(true);
      expect(resultWrapper.rules.length).toBe(0);
    });

    it('T_HTTPSTREAM_JSON_get-item-contextual-history: should get item history (expect empty based on current seeding)', async () => {
      expect(sharedTestComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        itemId: sharedTestComponentId!,
        itemType: 'Component',
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_item_hist_json',
        method: 'tools/call',
        params: { name: 'get-item-contextual-history', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('get_item_hist_json');
      const resultWrapper = response.body.result;
      expect(resultWrapper.status).toBe('complete');
      expect(Array.isArray(resultWrapper.contextHistory)).toBe(true);
      expect(resultWrapper.contextHistory.length).toBe(0);
    });
  });

  // Add a describe block for Algorithm tools via /mcp (JSON responses)
  describe('Algorithm Tools via /mcp (JSON responses)', () => {
    const algorithmTestCases = [
      {
        name: 'k-core-decomposition',
        args: { k: 1 },
        expectedDataKeyInWrapper: 'decomposition',
        checkField: 'components',
      },
      {
        name: 'louvain-community-detection',
        args: {},
        expectedDataKeyInWrapper: 'communities',
        isArrayDirectly: true,
        checkModularity: true,
      },
      { name: 'pagerank', args: {}, expectedDataKeyInWrapper: 'ranks', isArrayDirectly: true },
      {
        name: 'strongly-connected-components',
        args: {},
        expectedDataKeyInWrapper: 'stronglyConnectedComponents',
        isArrayDirectly: true,
      },
      {
        name: 'weakly-connected-components',
        args: {},
        expectedDataKeyInWrapper: 'weaklyConnectedComponents',
        isArrayDirectly: true,
      },
    ];

    for (const toolSetup of algorithmTestCases) {
      it(`T_HTTPSTREAM_JSON_ALGO_${toolSetup.name}: should execute and return wrapper`, async () => {
        const toolArgs = { repository: testRepository, branch: testBranch, ...toolSetup.args };
        const payload = {
          jsonrpc: '2.0',
          id: `algo_json_${toolSetup.name}`,
          method: 'tools/call',
          params: { name: toolSetup.name, arguments: toolArgs },
        };
        const response = await request(BASE_URL)
          .post('/mcp')
          .set('Origin', 'http://localhost')
          .send(payload)
          .expect(200);

        expect(response.body.id).toBe(`algo_json_${toolSetup.name}`);
        const resultWrapper = response.body.result;
        expect(resultWrapper).toBeDefined();
        expect(resultWrapper.status).toBe('complete');

        const dataContainer = resultWrapper[toolSetup.expectedDataKeyInWrapper];
        expect(dataContainer).toBeDefined();

        if (toolSetup.isArrayDirectly) {
          expect(Array.isArray(dataContainer)).toBe(true);
        } else if (toolSetup.checkField) {
          expect(dataContainer[toolSetup.checkField]).toBeDefined();
          expect(Array.isArray(dataContainer[toolSetup.checkField])).toBe(true);
        }
        if (toolSetup.checkModularity) {
          expect(resultWrapper).toHaveProperty('modularity');
        }
      });
    }
  });

  describe('Basic Entity Operations via /mcp (JSON)', () => {
    it('T_HTTPSTREAM_JSON_get-metadata: should get metadata', async () => {
      const toolArgs = { repository: testRepository, branch: testBranch };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_meta_http',
        method: 'tools/call',
        params: { name: 'get-metadata', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('get_meta_http');
      const resultWrapper = response.body.result; // get-metadata handler returns the metadata object directly
      expect(resultWrapper).toBeDefined();
      expect(resultWrapper.id).toBe('meta');
      expect(resultWrapper.name).toBe(testRepository);
      // Content was updated in T_HTTPSTREAM_003 or seeding, check a field
      const contentObject =
        typeof resultWrapper.content === 'string'
          ? JSON.parse(resultWrapper.content)
          : resultWrapper.content;
      expect(contentObject.project.name).toBe(testRepository);
      expect(contentObject.tech_stack.language).toBe('TypeScript'); // Assuming seeded or updated by T_HTTPSTREAM_003
    });

    it('T_HTTPSTREAM_JSON_get-context-latest: should get latest context', async () => {
      // First, ensure a context entry exists by updating/creating one for today
      const summaryText = `HTTP E2E Context Test - ${Date.now()}`;
      const updateCtxArgs = {
        repository: testRepository,
        branch: testBranch,
        summary: summaryText,
        agent: 'http-e2e',
      };
      const updatePayload = {
        jsonrpc: '2.0',
        id: 'update_ctx_for_get',
        method: 'tools/call',
        params: { name: 'update-context', arguments: updateCtxArgs },
      };
      await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(updatePayload)
        .expect(200);

      const toolArgs = { repository: testRepository, branch: testBranch, latest: true };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_ctx_latest_http',
        method: 'tools/call',
        params: { name: 'get-context', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('get_ctx_latest_http');
      const contexts = response.body.result; // get-context handler returns the array directly
      expect(Array.isArray(contexts)).toBe(true);
      expect(contexts.length).toBeGreaterThanOrEqual(1);
      expect(contexts[0].summary).toContain(summaryText); // Check if the latest context reflects our update
    });

    it('T_HTTPSTREAM_JSON_update-context: should update context (verified by get)', async () => {
      const summaryText = `HTTP E2E Update Context - ${Date.now()}`;
      const agentName = 'http-updater';
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        summary: summaryText,
        agent: agentName,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'update_ctx_http',
        method: 'tools/call',
        params: { name: 'update-context', arguments: toolArgs },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('update_ctx_http');
      expect(response.body.result?.success).toBe(true);

      // Verify by getting the context
      const getArgs = { repository: testRepository, branch: testBranch, latest: true };
      const getPayload = {
        jsonrpc: '2.0',
        id: 'get_updated_ctx_http',
        method: 'tools/call',
        params: { name: 'get-context', arguments: getArgs },
      };
      const getResponse = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(getPayload)
        .expect(200);
      const contexts = getResponse.body.result;
      expect(Array.isArray(contexts)).toBe(true);
      expect(contexts.length).toBeGreaterThanOrEqual(1);
      expect(contexts[0].summary).toBe(summaryText);
      expect(contexts[0].agent).toBe(agentName);
    });
  });

  describe('Error Handling via /mcp (JSON)', () => {
    it('T_HTTPSTREAM_JSON_ERROR_invalid-tool: should handle invalid tool name gracefully', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'err_invalid_tool',
        method: 'tools/call',
        params: { name: 'non-existent-tool', arguments: { repository: testRepository } },
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200); // MCP call itself is ok

      expect(response.body.id).toBe('err_invalid_tool');
      expect(response.body.result).toBeDefined();
      expect(response.body.result.error).toBeDefined();
      // The error message comes from ToolExecutionService when handler is not found
      expect(response.body.result.error).toContain(
        'Tool execution handler not implemented for non-existent-tool',
      );
    });

    it('T_HTTPSTREAM_JSON_ERROR_missing-args: should handle missing required arguments for a valid tool', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'err_missing_args',
        method: 'tools/call',
        params: { name: 'get-metadata', arguments: { branch: testBranch } }, // Missing repository
      };
      const response = await request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .send(payload)
        .expect(200);

      expect(response.body.id).toBe('err_missing_args');
      expect(response.body.result).toBeDefined();
      expect(response.body.result.error).toBeDefined();
      // This error is thrown by the get-metadata tool handler itself
      expect(response.body.result.error).toContain('Missing repository parameter for get-metadata');
    });
  });

  describe('Streamable Tools via /mcp (SSE responses)', () => {
    it('T_HTTPSTREAM_SSE_get-component-dependents: should stream progress', (done) => {
      expect(testComponentId).toBeDefined(); // Assuming this is the component to find dependents FOR
      expect(dependentComponentId).toBeDefined(); // Assuming this is one of the expected dependents

      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        componentId: testComponentId!,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_get_dependents',
        method: 'tools/call',
        params: { name: 'get-component-dependents', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_get_dependents');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                ev.data.method === 'tools/progress' &&
                !ev.data.params.isFinal &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                ev.data.method === 'tools/progress' &&
                !ev.data.params.isFinal &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(Array.isArray(inProgressContent.dependents)).toBe(true);
            expect(
              inProgressContent.dependents.some((c: Component) => c.id === dependentComponentId),
            ).toBe(true);

            const finalProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                ev.data.method === 'tools/progress' &&
                ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.dependents)).toBe(true);
            expect(
              finalProgressContent.dependents.some((c: Component) => c.id === dependentComponentId),
            ).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.dependents)).toBe(true);
            expect(
              finalResponseEvent.data.result.dependents.some(
                (c: Component) => c.id === dependentComponentId,
              ),
            ).toBe(true);

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_get-item-contextual-history: should stream progress', (done) => {
      expect(sharedTestComponentId).toBeDefined(); // Using a seeded component ID

      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        itemId: sharedTestComponentId!,
        itemType: 'Component',
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_get_item_hist',
        method: 'tools/call',
        params: { name: 'get-item-contextual-history', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_get_item_hist');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                ev.data.method === 'tools/progress' &&
                !ev.data.params.isFinal &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                ev.data.method === 'tools/progress' &&
                !ev.data.params.isFinal &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(Array.isArray(inProgressContent.history)).toBe(true); // Operation class puts data in .history
            // Based on current seeding, history might be empty. Add specific seeding if non-empty history is required for this test.
            // For now, just check it's an array.

            const finalProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                ev.data.method === 'tools/progress' &&
                ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.contextHistory)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.contextHistory)).toBe(true);

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_get-governing-items: should stream progress', (done) => {
      expect(sharedTestComponentId).toBeDefined();

      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        componentId: sharedTestComponentId!,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_get_gov_items',
        method: 'tools/call',
        params: { name: 'get-governing-items-for-component', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            // Expect init, decisions, rules, contextHistory, final_progress (5) + final_response (Implicitly tested by finalResponseEvent)
            // Number of in_progress events from OperationClass can vary based on actual data for decisions/rules/history.
            // Minimum: init, one for decisions, one for rules, one for contextHistory, then final.
            expect(progressEventsCount).toBeGreaterThanOrEqual(4);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_get_gov_items');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            // Check for one of the in-progress events, e.g., for decisions
            const decisionsProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).dataType === 'decisions',
            );
            expect(decisionsProgress).toBeDefined();
            expect(
              Array.isArray(JSON.parse(decisionsProgress.data.params.content[0].text).decisions),
            ).toBe(true);

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.decisions)).toBe(true);
            expect(Array.isArray(finalProgressContent.rules)).toBe(true);
            expect(Array.isArray(finalProgressContent.contextHistory)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.decisions)).toBe(true);
            // Based on current seeding, decisions and rules might be empty.

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_get-related-items: should stream progress', (done) => {
      expect(sharedTestComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        startItemId: sharedTestComponentId!,
        params: { relationshipTypes: ['DEPENDS_ON'], direction: 'INCOMING', depth: 1 },
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_get_related',
        method: 'tools/call',
        params: { name: 'get-related-items', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_get_related');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(Array.isArray(inProgressContent.items)).toBe(true); // Operation class uses .items

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.relatedItems)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.relatedItems)).toBe(true);
            // Add more specific checks based on seeded data if necessary

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_shortest-path: should stream progress for shortest path', (done) => {
      expect(sharedDependentComponentId).toBeDefined();
      expect(sharedTestComponentId).toBeDefined();
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        startNodeId: sharedDependentComponentId!,
        endNodeId: sharedTestComponentId!,
        params: { relationshipTypes: ['DEPENDS_ON'], direction: 'OUTGOING' },
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_sp',
        method: 'tools/call',
        params: { name: 'shortest-path', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_sp');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(inProgressContent).toHaveProperty('pathFound');
            expect(Array.isArray(inProgressContent.path)).toBe(true);

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(finalProgressContent.pathFound).toBe(true);
            expect(Array.isArray(finalProgressContent.path)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(finalResponseEvent.data.result.pathFound).toBe(true);
            expect(Array.isArray(finalResponseEvent.data.result.path)).toBe(true);
            expect(finalResponseEvent.data.result.path.length).toBeGreaterThanOrEqual(1);

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_k-core-decomposition: should stream progress', (done) => {
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        k: 1,
        projectedGraphName: 'kcore_sse_test_graph',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_kcore',
        method: 'tools/call',
        params: { name: 'k-core-decomposition', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_kcore');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(inProgressContent).toHaveProperty('componentsCount');

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(finalProgressContent.decomposition).toBeDefined();
            expect(Array.isArray(finalProgressContent.decomposition.components)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(finalResponseEvent.data.result.decomposition).toBeDefined();
            expect(Array.isArray(finalResponseEvent.data.result.decomposition.components)).toBe(
              true,
            );

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_louvain-community-detection: should stream progress', (done) => {
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        projectedGraphName: 'louvain_sse_test_graph',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_louvain',
        method: 'tools/call',
        params: { name: 'louvain-community-detection', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_louvain');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(inProgressContent).toHaveProperty('communitiesCount');
            expect(inProgressContent).toHaveProperty('modularity'); // Modularity might be null

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.communities)).toBe(true);
            expect(finalProgressContent).toHaveProperty('modularity');

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.communities)).toBe(true);
            expect(finalResponseEvent.data.result).toHaveProperty('modularity');

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_pagerank: should stream progress', (done) => {
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        projectedGraphName: 'pagerank_sse_test_graph',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        // dampingFactor and iterations can be omitted to use defaults in PageRankOperation
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_pagerank',
        method: 'tools/call',
        params: { name: 'pagerank', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            // PageRankOperation simulates iterations, so expect init + iterations + finalizing + final_progress
            // Default iterations is 20. So 1 (init) + 20 (in_progress iter) + 1 (finalizing) = 22 progress events.
            expect(progressEventsCount).toBeGreaterThanOrEqual(22);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_pagerank');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const iterationProgressEvents = events.filter(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress' &&
                JSON.parse(ev.data.params.content[0].text).hasOwnProperty('currentIteration'),
            );
            expect(iterationProgressEvents.length).toBeGreaterThanOrEqual(1); // At least one iteration event

            const finalizingProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'finalizing',
            );
            expect(finalizingProgress).toBeDefined();

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.ranks)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.ranks)).toBe(true);

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_strongly-connected-components: should stream progress', (done) => {
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        projectedGraphName: 'scc_sse_test_graph',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_scc',
        method: 'tools/call',
        params: { name: 'strongly-connected-components', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_scc');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(inProgressContent).toHaveProperty('sccCount');

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.stronglyConnectedComponents)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.stronglyConnectedComponents)).toBe(
              true,
            );

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    it('T_HTTPSTREAM_SSE_weakly-connected-components: should stream progress', (done) => {
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        projectedGraphName: 'wcc_sse_test_graph',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sse_wcc',
        method: 'tools/call',
        params: { name: 'weakly-connected-components', arguments: toolArgs },
      };

      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set('Origin', 'http://localhost')
        .set('Accept', 'text/event-stream')
        .send(payload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            const {
              events,
              progressEventsCount,
              finalResponseEvent,
              errorEvent,
            }: CollectedSseEvents = await collectStreamEvents(res);

            expect(errorEvent).toBeNull();
            expect(progressEventsCount).toBeGreaterThanOrEqual(2);
            expect(finalResponseEvent).toBeDefined();
            expect(finalResponseEvent.data.id).toBe('sse_wcc');

            const initProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'initializing',
            );
            expect(initProgress).toBeDefined();

            const inProgress = events.find(
              (ev: any) =>
                ev.type === 'mcpNotification' &&
                JSON.parse(ev.data.params.content[0].text).status === 'in_progress',
            );
            expect(inProgress).toBeDefined();
            const inProgressContent = JSON.parse(inProgress.data.params.content[0].text);
            expect(inProgressContent).toHaveProperty('wccCount');

            const finalProgress = events.find(
              (ev: any) => ev.type === 'mcpNotification' && ev.data.params.isFinal === true,
            );
            expect(finalProgress).toBeDefined();
            const finalProgressContent = JSON.parse(finalProgress.data.params.content[0].text);
            expect(finalProgressContent.status).toBe('complete');
            expect(Array.isArray(finalProgressContent.weaklyConnectedComponents)).toBe(true);

            expect(finalResponseEvent.data.result).toBeDefined();
            expect(finalResponseEvent.data.result.status).toBe('complete');
            expect(Array.isArray(finalResponseEvent.data.result.weaklyConnectedComponents)).toBe(
              true,
            );

            callback(null, null);
          } catch (assertionError) {
            callback(assertionError, null);
          }
        })
        .end(done);
    });

    // More SSE tests will be added here
  });
});
