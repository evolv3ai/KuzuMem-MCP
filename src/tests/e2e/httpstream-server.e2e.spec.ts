import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MEMORY_BANK_MCP_TOOLS } from '../../mcp/tools';
import { Component, Decision, Rule } from '../../types';
import { setupTestDB, cleanupTestDB } from '../utils/test-db-setup';
// Import centralized SDK test utils
import { parseSdkResponseContent } from '../utils/sdk-test-utils';

jest.setTimeout(180000); // Increased global timeout

const STREAM_PORT = process.env.HTTP_STREAM_PORT || 3001;
const STREAM_HOST = process.env.HOST || 'localhost';
const BASE_URL = `http://${STREAM_HOST}:${STREAM_PORT}`;
const MCP_URL = BASE_URL; // Use base URL directly for MCP SDK transport

let sdkClient: Client;

describe('MCP HTTP Stream Server E2E Tests with SDK Client (Full Refactor)', () => {
  let serverProcess: ChildProcess;
  let dbPathForTest: string;
  let clientProjectRootForTest: string;
  const testRepository = 'e2e-http-sdk-final-repo';
  const testBranch = 'main';

  // IDs for seeded items
  let seededComponentId1: string;
  let seededComponentId2: string; // Dependent on Id1
  let seededDecisionId: string;
  let seededRuleId: string;

  const startHttpStreamServer = (envOverride: Record<string, string> = {}): Promise<void> => {
    return new Promise((resolve, reject) => {
      const serverFilePath = path.resolve(__dirname, '../../mcp-httpstream-server.ts');
      const defaultEnv = {
        PORT: String(STREAM_PORT),
        DEBUG: process.env.CI ? '1' : '3',
        // Pass DB_PATH_OVERRIDE like stdio server to ensure proper database isolation
        ...envOverride,
      };

      console.log(`[HTTP E2E Setup] Starting HTTP Stream server: ${serverFilePath}`);
      console.log(`[HTTP E2E Setup] Env: ${JSON.stringify(defaultEnv)}`);

      serverProcess = spawn('npx', ['ts-node', '--transpile-only', serverFilePath], {
        env: { ...process.env, ...defaultEnv },
        shell: process.platform === 'win32',
        detached: false,
      });

      let output = '';
      let resolved = false;
      const startupTimeoutMs = process.env.CI ? 90000 : 45000; // Increased timeout
      const startupTimeout: NodeJS.Timeout | null = setTimeout(() => {
        if (!resolved) {
          console.error(
            `[HTTP E2E Setup ERROR] Server startup timeout (${startupTimeoutMs}ms). Output:\n${output}`,
          );
          resolved = true;
          if (serverProcess && !serverProcess.killed) {
            serverProcess.kill();
          }
          reject(new Error('Server startup timeout'));
        }
      }, startupTimeoutMs);

      const onData = (dataChunk: Buffer | string, streamName: string) => {
        const sData = dataChunk.toString();
        output += sData;
        if (
          process.env.E2E_SERVER_DEBUG === 'true' ||
          (process.env.CI && sData.toLowerCase().includes('error'))
        ) {
          console.log(`[HTTP Server ${streamName}] ${sData.trim()}`);
        }

        if (
          !resolved &&
          sData.includes(
            `MCP HTTP Streaming Server running at http://${STREAM_HOST}:${STREAM_PORT}`,
          )
        ) {
          console.log('[HTTP E2E Setup] Server reported ready.');
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          resolve();
        }
      };

      serverProcess.stdout?.on('data', (data) => onData(data, 'STDOUT'));
      serverProcess.stderr?.on('data', (data) => {
        const sData = data.toString(); // Need sData for checks below
        onData(sData, 'STDERR'); // Pass string to onData
        if (
          !resolved &&
          (sData.includes('EADDRINUSE') ||
            sData.toLowerCase().includes('error setting up kuzu') ||
            sData.includes('CRITICAL UNHANDLED ERROR'))
        ) {
          console.error(
            '[HTTP E2E Setup ERROR] Server failed to start due to critical error in STDERR.',
          );
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          if (serverProcess && !serverProcess.killed) {
            serverProcess.kill();
          }
          reject(new Error(`Server critical startup error: ${sData.substring(0, 300)}`));
        }
      });

      serverProcess.on('error', (err) => {
        console.error('[HTTP E2E Setup ERROR] Failed to spawn server process:', err);
        if (!resolved) {
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          reject(err);
        }
      });

      serverProcess.on('exit', (code, signal) => {
        console.log(`[HTTP E2E Teardown] Server process exited. Code: ${code}, Signal: ${signal}.`);
        if (!resolved && code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
          console.warn(
            `[HTTP E2E Setup WARNING] Server process exited prematurely and unexpectedly. Code: ${code}, Signal: ${signal}.`,
          );
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          resolved = true;
          reject(new Error(`Server process exited prematurely with code ${code}`));
        }
      });
    });
  };

  beforeAll(async () => {
    dbPathForTest = await setupTestDB('httpstream_e2e_sdk_final.kuzu');
    clientProjectRootForTest = path.dirname(dbPathForTest);
    console.log(`[HTTP E2E Setup] Using database path: ${dbPathForTest}`);
    console.log(`[HTTP E2E Setup] Using client project root: ${clientProjectRootForTest}`);

    // Start HTTP server with DB_PATH_OVERRIDE exactly like stdio server
    await startHttpStreamServer({
      DB_PATH_OVERRIDE: dbPathForTest,
      TS_NODE_CACHE: 'false',
    });

    // Initialize SDK Client following official MCP pattern
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    sdkClient = new Client({
      name: 'kuzumem-mcp-e2e-client',
      version: '1.0.0',
    });

    await sdkClient.connect(transport);

    console.log(`[HTTP E2E Setup] Initializing memory bank for ${testRepository}:${testBranch}...`);
    const initArgs = {
      repository: testRepository,
      branch: testBranch,
      clientProjectRoot: clientProjectRootForTest,
    };

    // Use official Client.callTool method
    console.log('[DEBUG] Calling init-memory-bank using Client.callTool...');
    console.log('[DEBUG] initArgs:', JSON.stringify(initArgs, null, 2));

    const initResult = await sdkClient.callTool({
      name: 'init-memory-bank',
      arguments: initArgs,
    });

    console.log('[DEBUG] SDK client init result:', initResult);

    if (!initResult || !initResult.content) {
      fail(`init-memory-bank failed, no result: ${JSON.stringify(initResult)}`);
    }

    type InitMemoryBankResult = { success: boolean; message: string; dbPath: string };
    const initToolResult = parseSdkResponseContent<InitMemoryBankResult>(initResult);
    console.log('[DEBUG] Parsed tool result:', JSON.stringify(initToolResult, null, 2));
    expect(initToolResult?.success).toBe(true);
    expect(initToolResult?.dbPath).toBe(clientProjectRootForTest);

    console.log('[HTTP E2E Setup] Memory bank initialized.');

    // --- Data Seeding ---
    console.log('[HTTP E2E Setup] Seeding initial data...');
    seededComponentId1 = `comp-seed-http-1-${Date.now()}`;
    seededComponentId2 = `comp-seed-http-2-${Date.now()}`;
    seededDecisionId = `dec-seed-http-1-${Date.now()}`;
    seededRuleId = `rule-seed-http-1-${Date.now()}`;

    const componentsToSeed: Array<
      Omit<Component, 'repository' | 'branch' | 'created_at' | 'updated_at'> & { id: string }
    > = [
      {
        id: seededComponentId1,
        name: 'HTTP Seed Alpha',
        kind: 'service',
        status: 'active' as const,
      },
      {
        id: seededComponentId2,
        name: 'HTTP Seed Beta',
        kind: 'library',
        status: 'active' as const,
        depends_on: [seededComponentId1],
      },
    ];

    for (const comp of componentsToSeed) {
      const addCompArgs = {
        repository: testRepository,
        branch: testBranch,
        ...comp,
        clientProjectRoot: clientProjectRootForTest,
      };

      console.log(`[DEBUG] Adding component ${comp.id} using Client.callTool...`);
      const addCompResult = await sdkClient.callTool({
        name: 'add-component',
        arguments: addCompArgs,
      });

      if (!addCompResult || !addCompResult.content) {
        throw new Error(
          `add-component ${comp.id} failed, no result: ${JSON.stringify(addCompResult)}`,
        );
      }

      type AddComponentResult = { success: boolean };
      const addCompToolResult = parseSdkResponseContent<AddComponentResult>(addCompResult);
      expect(addCompToolResult?.success).toBe(true);
    }
    console.log(`[HTTP E2E Setup] ${componentsToSeed.length} components seeded.`);

    const decisionToSeed: Omit<Decision, 'repository' | 'branch' | 'created_at' | 'updated_at'> & {
      id: string;
    } = {
      id: seededDecisionId,
      name: 'HTTP Seed Decision',
      date: '2024-02-10',
      context: 'Seeded decision for HTTP tests',
      status: 'accepted',
    };
    const addDecArgs = {
      repository: testRepository,
      branch: testBranch,
      ...decisionToSeed,
      clientProjectRoot: clientProjectRootForTest,
    };

    console.log(`[DEBUG] Adding decision ${seededDecisionId} using Client.callTool...`);
    const addDecResult = await sdkClient.callTool({
      name: 'add-decision',
      arguments: addDecArgs,
    });

    if (!addDecResult || !addDecResult.content) {
      throw new Error(`add-decision failed, no result: ${JSON.stringify(addDecResult)}`);
    }

    type AddDecisionResult = { success: boolean };
    const addDecToolResult = parseSdkResponseContent<AddDecisionResult>(addDecResult);
    expect(addDecToolResult?.success).toBe(true);
    console.log(`[HTTP E2E Setup] 1 decision seeded.`);

    const ruleToSeed: Omit<Rule, 'repository' | 'branch' | 'created_at' | 'updated_at'> & {
      id: string;
    } = {
      id: seededRuleId,
      name: 'HTTP Seed Rule',
      created: '2024-02-11',
      content: 'HTTP test rule',
      status: 'active' as const,
      triggers: ['on_deploy'],
    };
    const addRuleArgs = {
      repository: testRepository,
      branch: testBranch,
      ...ruleToSeed,
      clientProjectRoot: clientProjectRootForTest,
    };

    console.log(`[DEBUG] Adding rule ${seededRuleId} using Client.callTool...`);
    const addRuleResult = await sdkClient.callTool({
      name: 'add-rule',
      arguments: addRuleArgs,
    });

    if (!addRuleResult || !addRuleResult.content) {
      throw new Error(`add-rule failed, no result: ${JSON.stringify(addRuleResult)}`);
    }

    type AddRuleResult = { success: boolean };
    const addRuleToolResult = parseSdkResponseContent<AddRuleResult>(addRuleResult);
    expect(addRuleToolResult?.success).toBe(true);
    console.log(`[HTTP E2E Setup] 1 rule seeded.`);
  }, 240000);

  afterAll(async () => {
    if (sdkClient && typeof (sdkClient as any).dispose === 'function') {
      await (sdkClient as any).dispose();
      console.log('[HTTP E2E Teardown] SDK Client disposed.');
    }
    if (serverProcess && serverProcess.pid && !serverProcess.killed) {
      console.log('[HTTP E2E Teardown] Attempting to stop HTTP Stream server process...');
      const killed = serverProcess.kill('SIGTERM');
      if (killed) {
        console.log('[HTTP E2E Teardown] SIGTERM sent to server process. Waiting for exit...');
        // Wait for server process to exit or timeout
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            console.warn(
              '[HTTP E2E Teardown WARNING] Timeout waiting for server process to exit after SIGTERM.',
            );
            if (serverProcess && serverProcess.pid && !serverProcess.killed) {
              console.warn('[HTTP E2E Teardown WARNING] Forcing SIGKILL.');
              serverProcess.kill('SIGKILL');
            }
            resolve();
          }, 5000); // 5 seconds timeout for graceful exit

          serverProcess.on('exit', () => {
            clearTimeout(timer);
            console.log('[HTTP E2E Teardown] Server process confirmed exited.');
            resolve();
          });
        });
      } else {
        console.error('[HTTP E2E Teardown ERROR] Failed to send SIGTERM to server process.');
      }
    } else {
      console.log('[HTTP E2E Teardown] Server process already stopped or not started.');
    }
    if (dbPathForTest) {
      await cleanupTestDB(dbPathForTest);
      console.log('[HTTP E2E Teardown] Test database cleaned up.');
    }
  });

  it('T_HTTPSTREAM_002: SDK client listTools should return list of tools', async () => {
    console.log('[DEBUG] Calling listTools using Client.listTools...');

    const listToolsResult = await sdkClient.listTools();
    console.log('[DEBUG] SDK client listTools result:', listToolsResult);

    expect(listToolsResult).toBeDefined();
    expect(listToolsResult.tools).toBeDefined();
    const tools = listToolsResult.tools;

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(MEMORY_BANK_MCP_TOOLS.length);
    const initTool = tools.find((t: ToolAnnotations) => t.name === 'init-memory-bank');
    expect(initTool).toBeDefined();
    expect(initTool?.description).toBeDefined();
  });

  it('T_HTTPSTREAM_003: SDK client tools/call (JSON style via /mcp) for non-streaming tool (update-metadata)', async () => {
    const metadataContent = {
      id: 'meta',
      project: {
        name: `${testRepository}-sdk-updated`,
        created: '2024-02-01',
        description: 'Updated via HTTP SDK E2E',
      },
      tech_stack: { language: 'TypeScript (SDK)' },
    };
    const updateMetaArgs = {
      repository: testRepository,
      branch: testBranch,
      metadata: metadataContent,
      clientProjectRoot: clientProjectRootForTest,
    };

    console.log('[DEBUG] Calling update-metadata using Client.callTool...');
    const updateMetaResult = await sdkClient.callTool({
      name: 'update-metadata',
      arguments: updateMetaArgs,
    });

    console.log('[DEBUG] SDK client update-metadata result:', updateMetaResult);

    if (!updateMetaResult || !updateMetaResult.content) {
      fail(`update-metadata failed, no result: ${JSON.stringify(updateMetaResult)}`);
    }

    if ((updateMetaResult as any).isError) {
      fail(`update-metadata failed with error: ${JSON.stringify(updateMetaResult)}`);
    }

    type UpdateMetadataResult = {
      success: boolean;
      metadata: { id: string; project: { description: string }; tech_stack: { language: string } };
    };
    const toolResult = parseSdkResponseContent<UpdateMetadataResult>(updateMetaResult);
    expect(toolResult?.success).toBe(true);
    const returnedMetadata = toolResult?.metadata;
    expect(returnedMetadata?.project.description).toBe('Updated via HTTP SDK E2E');
    expect(returnedMetadata?.tech_stack.language).toBe('TypeScript (SDK)');
  });

  it('T_HTTPSTREAM_004: SDK client tools/call (SSE via /mcp) for streaming tool (get-component-dependencies)', async () => {
    expect(seededComponentId2).toBeDefined();
    expect(seededComponentId1).toBeDefined();

    const toolArgs = {
      repository: testRepository,
      branch: testBranch,
      componentId: seededComponentId2,
    };

    console.log('[DEBUG] Calling get-component-dependencies using Client.callTool...');

    // For streaming tools, we can listen to progress events
    const progressEvents: any[] = [];

    const getDepsResult = await sdkClient.callTool({
      name: 'get-component-dependencies',
      arguments: toolArgs,
    });

    console.log('[DEBUG] SDK client get-component-dependencies result:', getDepsResult);

    if (!getDepsResult || !getDepsResult.content) {
      fail(`get-component-dependencies failed, no result: ${JSON.stringify(getDepsResult)}`);
    }

    type GetComponentDependenciesResult = { status: string; dependencies: Component[] };
    const finalResultContent =
      parseSdkResponseContent<GetComponentDependenciesResult>(getDepsResult);

    expect(finalResultContent?.status).toBe('complete');
    expect(Array.isArray(finalResultContent?.dependencies)).toBe(true);
    expect(finalResultContent?.dependencies.some((c) => c.id === seededComponentId1)).toBe(true);
  }, 60000);

  // --- Add more SDK based tests for CRUD, Traversal, Algorithms ---
  describe('SDK Advanced Tools via /mcp (HTTP)', () => {
    it('T_HTTPSTREAM_SDK_ALGO_pagerank: should execute pagerank and return ranks', async () => {
      const toolArgs = {
        repository: testRepository,
        branch: testBranch,
        projectedGraphName: `pagerank_http_sdk_${Date.now()}`.substring(0, 30),
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      };

      console.log('[DEBUG] Calling pagerank using Client.callTool...');
      const pagerankResult = await sdkClient.callTool({
        name: 'pagerank',
        arguments: toolArgs,
      });

      console.log('[DEBUG] SDK client pagerank result:', pagerankResult);

      if (!pagerankResult || !pagerankResult.content) {
        fail(`pagerank failed, no result: ${JSON.stringify(pagerankResult)}`);
      }

      type PagerankResult = { status: string; results: { ranks: any[] } };
      const resultWrapper = parseSdkResponseContent<PagerankResult>(pagerankResult);

      expect(resultWrapper?.status).toBe('complete');
      expect(resultWrapper?.results).toBeDefined();
      expect(Array.isArray(resultWrapper?.results?.ranks)).toBe(true);
      if (resultWrapper?.results?.ranks && resultWrapper.results.ranks.length > 0) {
        expect(resultWrapper.results.ranks[0]).toHaveProperty('nodeId');
        expect(resultWrapper.results.ranks[0]).toHaveProperty('score');
      }
    });
  });
});
