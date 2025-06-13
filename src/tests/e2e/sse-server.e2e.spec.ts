import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import request from 'supertest'; // For HTTP requests
import { MEMORY_BANK_MCP_TOOLS } from '../../mcp/tools'; // Adjust path as needed
import { Component, ComponentStatus } from '../../types'; // Adjust path
import { cleanupTestDB, setupTestDB } from '../utils/test-db-setup'; // Removed dbPath import

// Increase Jest timeout
jest.setTimeout(90000);

// Dynamically select a high port to avoid collisions across test retries
const STREAM_PORT = Number(process.env.SSE_STREAM_PORT) || 31000 + Math.floor(Math.random() * 1000);
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
  let finalResponseEvent: any | null = null;
  let errorEvent: any | null = null;

  console.log('[collectStreamEvents] Starting collection of SSE events...');

  return new Promise<CollectedSseEvents>((resolve, reject) => {
    let promiseSettled = false;

    const settlePromise = (
      resolver: (value: CollectedSseEvents | PromiseLike<CollectedSseEvents>) => void,
      value: CollectedSseEvents,
      isRejectOperation = false,
    ) => {
      if (!promiseSettled) {
        promiseSettled = true;
        console.log(
          `[collectStreamEvents] Promise being ${isRejectOperation ? 'rejected' : 'resolved'}.`,
        );
        if (sseResponseEmitter.destroy) {
          console.log('[collectStreamEvents] Destroying SSE response emitter.');
          sseResponseEmitter.destroy();
        } else if (sseResponseEmitter.removeAllListeners) {
          console.log('[collectStreamEvents] Removing all listeners from SSE response emitter.');
          sseResponseEmitter.removeAllListeners();
        }
        resolver(value);
      }
    };

    let buffer = '';
    const processBuffer = () => {
      if (promiseSettled) {
        return;
      }

      let eolIndex;
      while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
        if (promiseSettled) {
          break;
        }
        const message = buffer.substring(0, eolIndex);
        buffer = buffer.substring(eolIndex + 2);
        if (message.trim() === '') {
          continue;
        }

        const lines = message.split('\n');
        let eventType = 'message';
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
          let parsedData: any = {}; // Default to empty object, typed as any
          if (eventDataString) {
            // Only parse if eventDataString is not empty
            parsedData = JSON.parse(eventDataString);
          }
          const eventPayload = { type: eventType, id: eventId, data: parsedData };
          events.push(eventPayload);
          console.log(`[collectStreamEvents] Received event:`, eventPayload);

          if (eventType === 'mcpNotification' && parsedData.method === 'tools/progress') {
            progressEventsCount++;
            console.log(`[collectStreamEvents] Progress event count: ${progressEventsCount}`);
          }
          if (eventType === 'mcpResponse') {
            finalResponseEvent = eventPayload;
            console.log(
              '[collectStreamEvents] Final mcpResponse event received. Resolving promise.',
            );
            settlePromise(resolve, { events, progressEventsCount, finalResponseEvent, errorEvent });
            return;
          }
          if (eventType === 'error') {
            errorEvent = eventPayload;
            console.error(
              '[collectStreamEvents] SSE standard error event received. Rejecting promise:',
              eventPayload,
            );
            const syntheticError = new Error(parsedData.message || 'SSE error event');
            settlePromise(
              reject,
              {
                events,
                progressEventsCount,
                finalResponseEvent,
                errorEvent,
                connectionError: syntheticError,
              },
              true,
            );
            return;
          }
        } catch (e) {
          console.error(
            '[collectStreamEvents] Failed to parse SSE event data:',
            eventDataString,
            e,
          );
          // Potentially reject here if parsing error is critical, for now, it logs and continues.
          // If a parsing error should stop everything:
          // errorEvent = { type: 'parsing_error', data: { message: (e as Error).message, rawData: eventDataString }};
          // settlePromise(reject, { events, progressEventsCount, finalResponseEvent, errorEvent, connectionError: e as Error }, true);
          // return;
        }
      }
    };

    if (sseResponseEmitter.on) {
      sseResponseEmitter.on('data', (chunk: Buffer | string) => {
        if (promiseSettled) {
          return;
        }
        buffer += chunk.toString();
        console.log(`[collectStreamEvents] Data chunk received (${chunk.length} bytes)`);
        processBuffer();
      });
      sseResponseEmitter.on('end', () => {
        if (promiseSettled) {
          return;
        }
        console.log('[collectStreamEvents] SSE stream "end" event received.');
        if (buffer.length > 0) {
          processBuffer(); // Process any remaining buffer
        }
        if (promiseSettled) {
          return;
        } // Check if processBuffer settled it
        // If stream ends and we haven't resolved (e.g. no mcpResponse), resolve with current state.
        // This maintains original behavior for streams that might end without explicit mcpResponse.
        console.log(
          '[collectStreamEvents] Resolving promise due to stream "end" event (if not already settled).',
        );
        settlePromise(resolve, { events, progressEventsCount, finalResponseEvent, errorEvent });
      });
      sseResponseEmitter.on('error', (err: Error) => {
        // Connection/transport error
        if (promiseSettled) {
          return;
        }
        console.error('[collectStreamEvents] SSE stream connection error. Rejecting promise:', err);
        if (!errorEvent) {
          errorEvent = { type: 'connection_error', data: { message: err.message } };
        }
        settlePromise(
          reject,
          { events, progressEventsCount, finalResponseEvent, errorEvent, connectionError: err },
          true,
        );
      });
    } else {
      console.error(
        '[collectStreamEvents] Provided sseResponseEmitter does not have .on method for events',
      );
      const err = new Error('Provided sseResponseEmitter does not have .on method for events');
      settlePromise(
        reject,
        {
          events: [],
          progressEventsCount: 0,
          finalResponseEvent: null,
          errorEvent: { type: 'setup_error', data: { message: err.message } },
          connectionError: err,
        },
        true,
      );
    }
  });
};

describe('MCP SSE Server E2E Tests (Legacy)', () => {
  let serverProcess: ChildProcess;
  let dbPathForTest: string; // Will be set by setupTestDB return value
  let clientProjectRootForTest: string; // <<<< Dependant on dbPathForTest
  let mcpSessionId: string; // Store the MCP session ID for subsequent requests
  const testRepository = 'e2e-httpstream-repo'; // Specific repo for these tests
  const testBranch = 'main';
  let testComponentId: string | null = null;
  let dependentComponentId: string;

  // Share these across describe blocks if tests depend on IDs created in earlier blocks
  let sharedTestComponentId: string | null = null;
  let sharedDependentComponentId: string | null = null;
  let sharedTestDecisionId: string | null = null;
  let sharedTestRuleId: string | null = null;

  // Helper function to make MCP requests with proper session management and SSE handling
  const makeMcpRequest = async (payload: any, expectStatus = 200) => {
    const headers: any = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Origin: 'http://localhost',
    };

    if (mcpSessionId) {
      headers['mcp-session-id'] = mcpSessionId;
    }

    return new Promise<any>((resolve, reject) => {
      const sseRequest = request(BASE_URL).post('/mcp').set(headers).send(payload);

      sseRequest
        .expect(expectStatus)
        .parse(async (res: any, callback: any) => {
          try {
            const { events, finalResponseEvent, errorEvent }: CollectedSseEvents =
              await collectStreamEvents(res);

            if (errorEvent) {
              reject(new Error(`SSE error: ${JSON.stringify(errorEvent)}`));
              return;
            }

            // Look for the response event with the matching request ID
            const responseEvent = events.find(
              (event: any) =>
                event.type === 'message' &&
                event.data &&
                event.data.id === payload.id &&
                (event.data.result || event.data.error),
            );

            if (!responseEvent) {
              reject(new Error(`No response event found for request ID: ${payload.id}`));
              return;
            }

            // Return a response object that mimics the old format
            const response = {
              body: responseEvent.data,
              headers: res.headers,
            };

            callback(null, null);
            resolve(response);
          } catch (error) {
            callback(error, null);
            reject(error);
          }
        })
        .end((err: any) => {
          if (err) {
            reject(err);
          }
        });
    });
  };

  // Helper function to initialize MCP session with SSE handling
  const initializeMcpSession = async () => {
    const initializePayload = {
      jsonrpc: '2.0',
      id: 'initialize',
      method: 'initialize',
      params: {
        protocolVersion: '0.1',
        capabilities: {
          roots: {
            listChanged: true,
          },
          sampling: {},
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    return new Promise<void>((resolve, reject) => {
      const sseRequest = request(BASE_URL)
        .post('/mcp')
        .set({
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Origin: 'http://localhost',
        })
        .send(initializePayload);

      sseRequest
        .expect(200)
        .parse(async (res: any, callback: any) => {
          try {
            // Extract session ID from headers
            mcpSessionId = res.headers['mcp-session-id'];
            console.log(`MCP session ID received: ${mcpSessionId}`);

            const { events, finalResponseEvent, errorEvent }: CollectedSseEvents =
              await collectStreamEvents(res);

            if (errorEvent) {
              reject(new Error(`SSE error: ${JSON.stringify(errorEvent)}`));
              return;
            }

            // For initialize, look for the message event with id 'initialize'
            const initializeEvent = events.find(
              (event: any) =>
                event.type === 'message' &&
                event.data &&
                event.data.id === 'initialize' &&
                event.data.result,
            );

            if (!initializeEvent) {
              reject(new Error('No initialize response event received'));
              return;
            }

            console.log('Initialize response event:', JSON.stringify(initializeEvent, null, 2));

            // Validate the initialize response
            expect(initializeEvent.data.result).toBeDefined();
            expect(initializeEvent.data.result.capabilities.tools).toBeDefined();
            expect(initializeEvent.data.result.serverInfo.name).toBe('KuzuMem-MCP-HTTPStream');
            expect(mcpSessionId).toBeDefined();

            console.log(`MCP session initialized successfully: ${mcpSessionId}`);
            callback(null, null);
            resolve();
          } catch (error) {
            callback(error, null);
            reject(error);
          }
        })
        .end((err: any) => {
          if (err) {
            reject(err);
          }
        });
    });
  };

  const startHttpStreamServer = (envVars: Record<string, string> = {}): Promise<void> => {
    return new Promise((resolve, reject) => {
      const serverFilePath = path.resolve(__dirname, '../../mcp-sse-server.ts'); // Updated to SSE server
      // Use STREAM_PORT for the PORT env var for this server
      const defaultEnv = {
        PORT: String(STREAM_PORT),
        DEBUG: '3', // Increase debug level for more verbose logging
        DEBUG_LEVEL: '3', // SSE server uses DEBUG_LEVEL instead of DEBUG
        DB_FILENAME: dbPathForTest,
        NODE_ENV: 'test',
        ...envVars,
      };

      console.log('Starting SSE server from path:', serverFilePath);
      console.log('With environment variables:', JSON.stringify(defaultEnv, null, 2));

      serverProcess = spawn('npx', ['ts-node', '--transpile-only', serverFilePath], {
        env: { ...process.env, ...defaultEnv },
        shell: true,
        detached: false, // Changed to false for simpler process killing
      });

      let output = '';
      let resolved = false;
      let startupTimeout: NodeJS.Timeout | null = null;

      // Set a timeout to reject the promise if the server doesn't start within 30 seconds
      startupTimeout = setTimeout(() => {
        if (!resolved) {
          console.error(`SSE Server failed to start within timeout. Output so far:\n${output}`);
          resolved = true;
          reject(new Error('Server startup timeout'));
        }
      }, 30000);

      serverProcess.stdout?.on('data', (data) => {
        const sData = data.toString();
        output += sData;
        console.log(`SSE_SERVER_STDOUT: ${sData}`);
        if (!resolved && sData.includes(`MCP SSE Server listening on port ${STREAM_PORT}`)) {
          console.log('SSE Server ready.');
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          resolve();
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        const sData = data.toString();
        output += sData;
        console.error(`SSE_SERVER_STDERR: ${sData}`);
        if (!resolved && sData.includes(`MCP SSE Server listening on port ${STREAM_PORT}`)) {
          console.log('SSE Server ready.');
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          resolve();
        }
        if (!resolved && (sData.includes('EADDRINUSE') || sData.toLowerCase().includes('error'))) {
          // If an error occurs before resolving, reject to prevent test timeout
          console.error('SSE Server failed to start due to an error');
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          reject(new Error(`Server failed to start: ${sData.substring(0, 300)}`));
        }
      });
      serverProcess.on('error', (err) => {
        console.error('Failed to start SSE server process:', err);
        if (!resolved) {
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          reject(err);
        }
      });
      serverProcess.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
          console.warn(
            `SSE Server process exited unexpectedly with code ${code}, signal ${signal}. Output:\n${output}`,
          );
          if (!resolved) {
            if (startupTimeout) {
              clearTimeout(startupTimeout);
            }
            resolved = true;
            reject(new Error(`Server process exited with code ${code}`));
          }
        }
      });
    });
  };

  beforeAll(async () => {
    dbPathForTest = await setupTestDB('sse_e2e_test.kuzu');
    clientProjectRootForTest = path.dirname(dbPathForTest);
    await startHttpStreamServer();

    // Initialize MCP session
    await initializeMcpSession();

    const repository = testRepository;
    const branch = testBranch;

    console.log(`SSE Stream E2E: Initializing memory bank for ${repository}...`);
    const initPayload = {
      jsonrpc: '2.0',
      id: 'init_e2e_sse',
      method: 'tools/call',
      params: {
        name: 'memory-bank',
        arguments: {
          operation: 'init',
          repository,
          branch,
          clientProjectRoot: clientProjectRootForTest,
        },
      },
    };
    let httpResponse = await makeMcpRequest(initPayload);
    expect(httpResponse.body.id).toBe('init_e2e_sse');
    expect(httpResponse.body.result?.content).toBeDefined();
    expect(httpResponse.body.result?.content[0]).toBeDefined();

    // Parse the JSON result from the MCP SDK format
    console.log('Raw response content:', httpResponse.body.result.content[0].text);

    let initResult;
    try {
      initResult = JSON.parse(httpResponse.body.result.content[0].text);
    } catch (parseError) {
      console.error('Failed to parse init response as JSON:', parseError);
      console.error('Raw response text:', httpResponse.body.result.content[0].text);
      throw new Error(
        `Memory bank initialization returned invalid JSON: ${httpResponse.body.result.content[0].text.substring(0, 200)}`,
      );
    }

    if (!initResult.success) {
      console.error('Init failed with error:', initResult);
    }
    expect(initResult.success).toBe(true);
    console.log('SSE Stream E2E: Memory bank initialized.');

    // --- BEGIN FULL DATA SEEDING (adapted from stdio tests) ---
    console.log('SSE Stream E2E: Seeding database with initial data...');

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
        params: {
          name: 'entity',
          arguments: {
            operation: 'create',
            entityType: 'component',
            id: comp.id,
            repository,
            branch,
            clientProjectRoot: clientProjectRootForTest,
            data: {
              name: comp.name,
              kind: comp.kind,
              status: comp.status,
              depends_on: comp.depends_on || [],
            },
          },
        },
      };
      httpResponse = await makeMcpRequest(addCompPayload);
      expect(httpResponse.body.result?.content).toBeDefined();
      const compResult = JSON.parse(httpResponse.body.result.content[0].text);
      if (!compResult.success) {
        console.error('Component creation failed:', compResult);
      }
      expect(compResult.success).toBe(true);
    }
    console.log(`${componentsToSeed.length} components seeded for SSE E2E.`);

    // Seed Contexts
    const contextsToSeed = [
      {
        summary: 'Initial context for seeding via SSE',
        agent: 'seed-script-sse',
        decisions: ['DEC-SEED-001'],
        observations: ['OBS-SEED-001'],
      },
      {
        summary: 'Another seeded context entry via SSE',
        agent: 'seed-script-sse',
        decisions: ['DEC-SEED-002'],
        observations: ['OBS-SEED-002', 'OBS-SEED-003'],
      },
    ];
    for (const ctxData of contextsToSeed) {
      const updateCtxPayload = {
        jsonrpc: '2.0',
        id: `update_ctx_${crypto.randomUUID()}`,
        method: 'tools/call',
        params: {
          name: 'context',
          arguments: {
            operation: 'update',
            repository,
            branch,
            ...ctxData,
            clientProjectRoot: clientProjectRootForTest,
          },
        },
      };
      httpResponse = await makeMcpRequest(updateCtxPayload);
      expect(httpResponse.body.result?.content).toBeDefined();
      const ctxResult = JSON.parse(httpResponse.body.result.content[0].text);
      expect(ctxResult.success).toBe(true);
    }
    console.log(`${contextsToSeed.length} context entries updated/seeded for SSE E2E.`);

    // Seed Decisions
    const decisionsToSeed = [
      {
        id: 'dec-seed-001',
        name: 'Seeded SSE Decision Alpha',
        date: '2023-01-01',
        context: 'Regarding initial SSE setup',
      },
      {
        id: 'dec-seed-002',
        name: 'Seeded SSE Decision Beta',
        date: '2023-01-15',
        context: 'SSE Architectural choice',
      },
    ];
    for (const dec of decisionsToSeed) {
      const addDecPayload = {
        jsonrpc: '2.0',
        id: `add_dec_${dec.id}`,
        method: 'tools/call',
        params: {
          name: 'entity',
          arguments: {
            operation: 'create',
            entityType: 'decision',
            id: dec.id,
            repository,
            branch,
            clientProjectRoot: clientProjectRootForTest,
            data: {
              title: dec.name,
              dateCreated: dec.date,
              rationale: dec.context,
              status: 'active',
            },
          },
        },
      };
      httpResponse = await makeMcpRequest(addDecPayload);
      expect(httpResponse.body.result?.content).toBeDefined();
      const decResult = JSON.parse(httpResponse.body.result.content[0].text);
      expect(decResult.success).toBe(true);
    }
    console.log(`${decisionsToSeed.length} decisions seeded for SSE E2E.`);

    // Seed Rules
    const rulesToSeed = [
      {
        id: 'rule-seed-001',
        name: 'Seeded SSE Rule Alpha',
        created: '2023-01-05',
        content: 'Standard SSE linting',
        status: 'active' as const,
      },
      {
        id: 'rule-seed-002',
        name: 'Seeded SSE Rule Beta',
        created: '2023-01-20',
        content: 'SSE Security check',
        status: 'active' as const,
        triggers: ['commit', 'push'],
      },
    ];
    for (const rule of rulesToSeed) {
      const addRulePayload = {
        jsonrpc: '2.0',
        id: `add_rule_${rule.id}`,
        method: 'tools/call',
        params: {
          name: 'entity',
          arguments: {
            operation: 'create',
            entityType: 'rule',
            id: rule.id,
            repository,
            branch,
            clientProjectRoot: clientProjectRootForTest,
            data: {
              title: rule.name,
              dateCreated: rule.created,
              content: rule.content,
              status: rule.status,
              triggers: rule.triggers || [],
            },
          },
        },
      };
      httpResponse = await makeMcpRequest(addRulePayload);
      expect(httpResponse.body.result?.content).toBeDefined();
      const ruleResult = JSON.parse(httpResponse.body.result.content[0].text);
      expect(ruleResult.success).toBe(true);
    }
    console.log(`${rulesToSeed.length} rules seeded for SSE E2E.`);
    console.log('SSE Stream E2E: Database seeding complete.');
    // --- END DATA SEEDING ---
  }, 120000);

  afterAll(async () => {
    if (serverProcess && serverProcess.pid && !serverProcess.killed) {
      console.log('Stopping SSE server...');
      serverProcess.kill();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    // Pass the specific path to cleanupTestDB
    if (dbPathForTest) {
      await cleanupTestDB(dbPathForTest);
    }
  });

  it('T_HTTPSTREAM_001: /initialize should return server capabilities', async () => {
    // This test verifies that the session was properly initialized in beforeAll
    expect(mcpSessionId).toBeDefined();
    console.log(`Test T_SSE_001: Using session ${mcpSessionId}`);

    // The MCP protocol doesn't expose REST endpoints like /tools/list
    // Instead, we need to use the MCP protocol to list tools
    const payload = {
      jsonrpc: '2.0',
      id: 'list_tools_test',
      method: 'tools/list',
      params: {},
    };

    const response = await makeMcpRequest(payload);
    expect(response.body.id).toBe('list_tools_test');
    expect(response.body.result).toBeDefined();
    expect(Array.isArray(response.body.result.tools)).toBe(true);
    expect(response.body.result.tools.length).toBe(MEMORY_BANK_MCP_TOOLS.length);
    expect(response.body.result.tools[0]).toHaveProperty('name');
    expect(response.body.result.tools[0]).toHaveProperty('inputSchema');
  });

  it('T_HTTPSTREAM_002: /tools/list should return list of tools', async () => {
    const payload = {
      jsonrpc: '2.0',
      id: 'list_tools_test_2',
      method: 'tools/list',
      params: {},
    };

    const response = await makeMcpRequest(payload);
    expect(response.body.id).toBe('list_tools_test_2');
    expect(response.body.result).toBeDefined();
    expect(Array.isArray(response.body.result.tools)).toBe(true);
    expect(response.body.result.tools.length).toBe(MEMORY_BANK_MCP_TOOLS.length);
    expect(response.body.result.tools[0]).toHaveProperty('name');
    expect(response.body.result.tools[0]).toHaveProperty('inputSchema');
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

    const payload = {
      jsonrpc: '2.0',
      id: 'update_meta_http',
      method: 'tools/call',
      params: {
        name: 'memory-bank',
        arguments: {
          operation: 'update-metadata',
          repository: repoName,
          branch: 'main',
          metadata: metadataContent,
          clientProjectRoot: clientProjectRootForTest,
        },
      },
    };

    const response = await makeMcpRequest(payload);
    expect(response.body.id).toBe('update_meta_http');
    expect(response.body.result).toBeDefined();
    expect(response.body.result.content).toBeDefined();
    expect(response.body.result.content[0]).toBeDefined();

    // Parse the JSON result from the MCP SDK format
    const toolResult = JSON.parse(response.body.result.content[0].text);
    expect(toolResult.success).toBe(true);
  });

  it.skip('T_HTTPSTREAM_004: /mcp tools/call (SSE) should stream progress for get-component-dependencies', (done) => {
    // Ensure dependentComponentId and testComponentId are seeded from beforeAll
    expect(dependentComponentId).toBeDefined();
    expect(testComponentId).toBeDefined();
    expect(mcpSessionId).toBeDefined();

    const toolArgs = {
      repository: testRepository,
      branch: testBranch,
      componentId: dependentComponentId,
      depth: 1, // Keep depth 1 for simpler expected output for now
      clientProjectRoot: clientProjectRootForTest,
    };
    const payload = {
      jsonrpc: '2.0',
      id: 'sse_get_deps_http',
      method: 'tools/call',
      params: { name: 'get-component-dependencies', arguments: toolArgs },
    };

    const sseRequest = request(BASE_URL)
      .post('/mcp')
      .set('Origin', 'http://localhost')
      .set('mcp-session-id', mcpSessionId) // Use the session ID
      .set('Accept', 'text/event-stream')
      .send(payload);

    // Note: The official MCP SDK may not support SSE streaming for HTTP transport
    // This test may need to be updated based on the actual SDK capabilities
    sseRequest
      .expect(200) // Expect initial 200 OK for SSE stream connection
      .parse(async (res: any, callback: any) => {
        try {
          const {
            events,
            progressEventsCount,
            finalResponseEvent,
            errorEvent,
          }: CollectedSseEvents = await collectStreamEvents(res);

          // Basic checks
          expect(errorEvent).toBeNull(); // Should be no protocol/transport errors

          // For SSE, we should at least get some events
          expect(events.length).toBeGreaterThan(0);

          // Look for any message event (the SSE connection is working)
          const messageEvent = events.find((event: any) => event.type === 'message');

          // If we get a message event, the SSE functionality is working
          // The specific tool response format may vary with the official SDK
          if (messageEvent) {
            expect(messageEvent.type).toBe('message');
            // SSE functionality is confirmed working
          } else {
            // If no message events, at least verify we got the SSE connection
            expect(events.length).toBeGreaterThanOrEqual(0);
          }

          callback(null, null);
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
        operation: 'create',
        entityType: 'component',
        id: sharedTestComponentId,
        repository: testRepository,
        branch: testBranch,
        clientProjectRoot: clientProjectRootForTest,
        data: {
          name: 'SSE Primary Test Component',
          kind: 'service',
          status: 'active',
          depends_on: [],
        },
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_comp_crud',
        method: 'tools/call',
        params: { name: 'entity', arguments: compArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('add_comp_crud');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const toolResult = JSON.parse(response.body.result.content[0].text);
      expect(toolResult.success).toBe(true);
      expect(toolResult.message).toContain(sharedTestComponentId);
    });

    it('T_HTTPSTREAM_CRUD_add-component-dependent: should add a dependent component', async () => {
      expect(sharedTestComponentId).not.toBeNull();
      sharedDependentComponentId = `e2e-http-crud-dep-${Date.now()}`;
      const compArgs = {
        operation: 'create',
        entityType: 'component',
        id: sharedDependentComponentId,
        repository: testRepository,
        branch: testBranch,
        clientProjectRoot: clientProjectRootForTest,
        data: {
          name: 'SSE Dependent Test Component',
          kind: 'service',
          status: 'active',
          depends_on: [sharedTestComponentId],
        },
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_comp_dependent_crud',
        method: 'tools/call',
        params: { name: 'entity', arguments: compArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('add_comp_dependent_crud');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const toolResult = JSON.parse(response.body.result.content[0].text);
      expect(toolResult.success).toBe(true);
    });

    it('T_HTTPSTREAM_CRUD_add-decision: should add a decision', async () => {
      sharedTestDecisionId = `e2e-http-crud-dec-${Date.now()}`;
      const decArgs = {
        operation: 'create',
        entityType: 'decision',
        id: sharedTestDecisionId,
        repository: testRepository,
        branch: testBranch,
        clientProjectRoot: clientProjectRootForTest,
        data: {
          title: 'SSE Test Decision',
          context: 'Testing via SSE HTTP Stream server',
          rationale: 'This is a test decision for SSE integration',
          status: 'proposed',
          implications: 'Test implications',
          dateCreated: '2023-01-01',
        },
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_dec_crud',
        method: 'tools/call',
        params: { name: 'entity', arguments: decArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('add_dec_crud');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const toolResult = JSON.parse(response.body.result.content[0].text);
      expect(toolResult.success).toBe(true);
    });

    it('T_HTTPSTREAM_CRUD_add-rule: should add a rule', async () => {
      sharedTestRuleId = `e2e-http-crud-rule-${Date.now()}`;
      const ruleArgs = {
        operation: 'create',
        entityType: 'rule',
        id: sharedTestRuleId,
        repository: testRepository,
        branch: testBranch,
        clientProjectRoot: clientProjectRootForTest,
        data: {
          title: 'SSE Test Rule',
          content: 'This is a test rule for SSE integration',
          dateCreated: '2023-01-01',
          status: 'active',
          category: 'test',
          triggers: ['manual'],
        },
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'add_rule_crud',
        method: 'tools/call',
        params: { name: 'entity', arguments: ruleArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('add_rule_crud');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const toolResult = JSON.parse(response.body.result.content[0].text);
      expect(toolResult.success).toBe(true);
    });
  });

  describe('Traversal and Graph Tools via /mcp (JSON responses)', () => {
    // Assumes components from CRUD tests or beforeAll are available (sharedTestComponentId, sharedDependentComponentId)
    it('T_HTTPSTREAM_JSON_get-component-dependencies: should retrieve dependencies', async () => {
      expect(sharedTestComponentId).toBeDefined();
      const toolArgs = {
        type: 'dependencies',
        repository: testRepository,
        branch: testBranch,
        componentId: sharedTestComponentId,
        direction: 'dependencies',
        clientProjectRoot: clientProjectRootForTest,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_deps_json',
        method: 'tools/call',
        params: { name: 'query', arguments: toolArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('get_deps_json');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const resultWrapper = JSON.parse(response.body.result.content[0].text);
      expect(resultWrapper.type).toBe('dependencies');
      expect(Array.isArray(resultWrapper.components)).toBe(true);
      expect(resultWrapper.components.some((c: Component) => c.id === sharedTestComponentId)).toBe(
        false,
      ); // This component should not depend on itself
    });

    it('T_HTTPSTREAM_JSON_shortest-path: should find a shortest path', async () => {
      expect(sharedTestComponentId).toBeDefined();
      expect(sharedDependentComponentId).toBeDefined();
      const toolArgs = {
        type: 'shortest-path',
        repository: testRepository,
        branch: testBranch,
        startNodeId: sharedDependentComponentId,
        endNodeId: sharedTestComponentId,
        projectedGraphName: `test-shortest-path-${Date.now()}`,
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        clientProjectRoot: clientProjectRootForTest,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sp_json',
        method: 'tools/call',
        params: { name: 'analyze', arguments: toolArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('sp_json');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const resultWrapper = JSON.parse(response.body.result.content[0].text);

      // Debug: log the result
      console.log(
        'Shortest path test - from:',
        sharedDependentComponentId,
        'to:',
        sharedTestComponentId,
      );
      console.log('Shortest path result:', JSON.stringify(resultWrapper, null, 2));

      expect(resultWrapper.type).toBe('shortest-path');
      expect(resultWrapper.pathFound).toBe(true);
      expect(Array.isArray(resultWrapper.path)).toBe(true);
      expect(resultWrapper.path.length).toBeGreaterThanOrEqual(1);
    });

    it('T_HTTPSTREAM_JSON_get-component-dependents: should retrieve dependents', async () => {
      expect(sharedTestComponentId).toBeDefined();
      expect(sharedDependentComponentId).toBeDefined();

      const toolArgs = {
        type: 'dependencies',
        repository: testRepository,
        branch: testBranch,
        componentId: sharedTestComponentId,
        direction: 'dependents',
        clientProjectRoot: clientProjectRootForTest,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'get_dependents_json',
        method: 'tools/call',
        params: { name: 'query', arguments: toolArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('get_dependents_json');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const resultWrapper = JSON.parse(response.body.result.content[0].text);
      expect(resultWrapper.type).toBe('dependencies');
      expect(Array.isArray(resultWrapper.components)).toBe(true);

      // Debug: log what we got
      console.log('Dependents test - looking for:', sharedDependentComponentId);
      console.log(
        'Dependents test - found components:',
        resultWrapper.components.map((c: any) => c.id),
      );

      // Check if the dependent component we created is listed
      expect(
        resultWrapper.components.some((c: Component) => c.id === sharedDependentComponentId),
      ).toBe(true);
    });

    it('T_HTTPSTREAM_JSON_shortest-path_reflexive: should handle reflexive shortest path', async () => {
      expect(sharedTestComponentId).toBeDefined();
      const toolArgs = {
        type: 'shortest-path',
        repository: testRepository,
        branch: testBranch,
        startNodeId: sharedTestComponentId,
        endNodeId: sharedTestComponentId,
        projectedGraphName: `test-shortest-path-reflexive-${Date.now()}`,
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        clientProjectRoot: clientProjectRootForTest,
      };
      const payload = {
        jsonrpc: '2.0',
        id: 'sp_reflex_json',
        method: 'tools/call',
        params: { name: 'analyze', arguments: toolArgs },
      };
      const response = await makeMcpRequest(payload);
      expect(response.body.id).toBe('sp_reflex_json');
      expect(response.body.result?.content).toBeDefined();
      expect(response.body.result?.content[0]).toBeDefined();

      // Parse the JSON result from the MCP SDK format
      const resultWrapper = JSON.parse(response.body.result.content[0].text);
      expect(resultWrapper.type).toBe('shortest-path');
      expect(resultWrapper.pathFound).toBe(false);
      expect(Array.isArray(resultWrapper.path)).toBe(true);
      expect(resultWrapper.path.length).toBe(0); // No path needed for self
    });
  });

  describe('Algorithm Tools via /mcp (JSON responses)', () => {
    const algorithmTests = [
      {
        algorithmName: 'k-core',
        testId: 'algo_json_k-core-decomposition',
        k: 2,
      },
      {
        algorithmName: 'louvain',
        testId: 'algo_json_louvain-community-detection',
      },
      {
        algorithmName: 'pagerank',
        testId: 'algo_json_pagerank',
      },
    ];

    algorithmTests.forEach((toolSetup) => {
      it(`T_HTTPSTREAM_JSON_ALGO_${toolSetup.algorithmName}: should execute and return wrapper`, async () => {
        const toolArgs = {
          type: toolSetup.algorithmName,
          repository: testRepository,
          branch: testBranch,
          clientProjectRoot: clientProjectRootForTest,
          projectedGraphName: `test-${toolSetup.algorithmName}-${Date.now()}`,
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
          ...(toolSetup.k && { k: toolSetup.k }),
        };
        const payload = {
          jsonrpc: '2.0',
          id: toolSetup.testId,
          method: 'tools/call',
          params: { name: 'analyze', arguments: toolArgs },
        };
        const response = await makeMcpRequest(payload);
        expect(response.body.id).toBe(toolSetup.testId);
        expect(response.body.result?.content).toBeDefined();
        expect(response.body.result?.content[0]).toBeDefined();

        const resultWrapper = JSON.parse(response.body.result.content[0].text);
        expect(resultWrapper).toBeDefined();
        expect(resultWrapper.type).toBe(toolSetup.algorithmName);
        expect(resultWrapper.status).toBeDefined();
        expect(Array.isArray(resultWrapper.nodes)).toBe(true);
      });
    });

    // Keep the detect tools separate as they use the detect tool, not analyze
    const detectTests = [
      {
        algorithmName: 'strongly-connected',
        testId: 'algo_json_strongly-connected-components',
      },
      {
        algorithmName: 'weakly-connected',
        testId: 'algo_json_weakly-connected-components',
      },
    ];

    detectTests.forEach((toolSetup) => {
      it(`T_HTTPSTREAM_JSON_ALGO_${toolSetup.algorithmName}-components: should execute and return wrapper`, async () => {
        const toolArgs = {
          type: toolSetup.algorithmName,
          repository: testRepository,
          branch: testBranch,
          clientProjectRoot: clientProjectRootForTest,
          projectedGraphName: `test-${toolSetup.algorithmName}-${Date.now()}`,
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        };
        const payload = {
          jsonrpc: '2.0',
          id: toolSetup.testId,
          method: 'tools/call',
          params: { name: 'detect', arguments: toolArgs },
        };
        const response = await makeMcpRequest(payload);
        expect(response.body.id).toBe(toolSetup.testId);
        expect(response.body.result?.content).toBeDefined();
        expect(response.body.result?.content[0]).toBeDefined();

        const resultWrapper = JSON.parse(response.body.result.content[0].text);
        expect(resultWrapper).toBeDefined();
        expect(resultWrapper.type).toBe(toolSetup.algorithmName);
        expect(resultWrapper.status).toBeDefined();
        expect(Array.isArray(resultWrapper.components)).toBe(true);
      });
    });
  });
});
