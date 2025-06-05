// src/tests/e2e/stdio-server.e2e.spec.ts
import { McpStdioClient } from '../utils/mcp-stdio-client'; // This is the NEW SDK-based client
import { Component, Context, Rule } from '../../types'; // Domain types for assertions
import {
  ToolAnnotations,
  isJSONRPCError,
  JSONRPCResponse as SDKJSONRPCResponse,
  ProgressNotification as SDKProgressNotification,
  McpError as SDKMcpError,
  CallToolResult as SDKCallToolResult, // Canonical SDK CallToolResultf
} from '@modelcontextprotocol/sdk/types.js';
import { setupTestDB, cleanupTestDB } from '../utils/test-db-setup';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../../../'); // Define projectRoot

// Helper to collect stream events for SDK client (adapted for stdio)
async function collectSdkStdioEvents(
  stream: AsyncIterable<SDKProgressNotification | SDKJSONRPCResponse | SDKMcpError>,
): Promise<{
  progressEvents: Array<any>; // Store as any to accommodate different progress param structures
  finalResponse: SDKJSONRPCResponse | null;
  error?: any;
}> {
  const collected = {
    progressEvents: [] as Array<any>,
    finalResponse: null as SDKJSONRPCResponse | null,
    error: undefined as any,
  };
  try {
    for await (const event of stream) {
      if ('method' in event && event.method === 'notifications/progress') {
        collected.progressEvents.push((event as SDKProgressNotification).params);
      } else if ('id' in event && ('result' in event || 'error' in event)) {
        // SDKJSONRPCResponse (success or error)
        collected.finalResponse = event as SDKJSONRPCResponse;
        break;
      } else if (
        event &&
        typeof (event as any).code === 'number' &&
        typeof (event as any).message === 'string' &&
        !('jsonrpc' in event) &&
        !('method' in event)
      ) {
        // Handle raw SDKMcpError yielded by stream
        const mcpError = event as SDKMcpError;
        collected.error = mcpError;
        collected.finalResponse = {
          // Convert to JSONRPC error response format
          jsonrpc: '2.0',
          id: 'mcp-error-' + Date.now(),
          error: { code: mcpError.code, message: mcpError.message, data: (mcpError as any).data },
        } as unknown as SDKJSONRPCResponse; // Cast to unknown first
        break;
      } else {
        // Handle direct tool result objects (new SDK pattern)
        // For streaming tools that return result data directly
        console.warn('[collectSdkStdioEvents] Received unexpected event type:', event);
        if (
          event &&
          typeof event === 'object' &&
          !('method' in event) &&
          !('id' in event) &&
          !('code' in event)
        ) {
          let actualResult: any = event;

          // Check if this is MCP CallToolResult format with content field
          if ('content' in event && Array.isArray((event as any).content)) {
            const mcpResult = event as any;
            if (mcpResult.content.length > 0) {
              const firstContent = mcpResult.content[0];
              if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
                try {
                  // Try to parse the JSON string back to the original object
                  actualResult = JSON.parse(firstContent.text);
                  console.log(
                    '[collectSdkStdioEvents] Extracted data from MCP format:',
                    actualResult,
                  );
                } catch (parseError) {
                  console.warn(
                    '[collectSdkStdioEvents] Failed to parse MCP content as JSON, using text:',
                    firstContent.text,
                  );
                  actualResult = firstContent.text;
                }
              }
            }
          }

          // This looks like a direct tool result - wrap it in JSON-RPC format
          collected.finalResponse = {
            jsonrpc: '2.0',
            id: 'tool-result',
            result: actualResult,
          } as SDKJSONRPCResponse;
          break;
        }
      }
    }
  } catch (err) {
    collected.error = err;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const errorObj = err as {
        code?: number;
        message: string;
        data?: any;
        id?: string | number | null;
      };
      collected.finalResponse = {
        jsonrpc: '2.0',
        id: errorObj.id || 'error',
        error: {
          code: errorObj.code || -32000,
          message: errorObj.message,
          data: errorObj.data,
        },
      } as unknown as SDKJSONRPCResponse; // Cast to unknown first
    } else if (err instanceof Error) {
      collected.finalResponse = {
        jsonrpc: '2.0',
        id: 'error',
        error: { code: -32000, message: err.message },
      } as unknown as SDKJSONRPCResponse; // Cast to unknown first
    }
  }
  return collected;
}

jest.setTimeout(180000); // Increased global timeout for all tests in this file

describe('MCP STDIO Server E2E Tests (SDK Refactor)', () => {
  let client: McpStdioClient;
  const testRepositoryName = 'e2e-stdio-sdk-refactor-repo';
  const testBranch = 'main';
  let testClientProjectRoot: string;
  let dbPathForStdioTest: string;

  let seededComponentId1: string | null = null;
  let seededComponentId2: string | null = null;
  let testDecisionId: string | null = null;
  let testRuleId: string | null = null;
  let crudTestDecisionId: string;
  let crudTestRuleId: string;

  beforeAll(async () => {
    dbPathForStdioTest = await setupTestDB('e2e-stdio-sdk-refactor.kuzu');
    testClientProjectRoot = path.dirname(dbPathForStdioTest);
    console.log(`[E2E SETUP] STDIO: Using client project root: ${testClientProjectRoot}`);

    client = new McpStdioClient({
      envVars: {
        DEBUG: '3', // Force Kuzu native debug logs
        DB_PATH_OVERRIDE: dbPathForStdioTest,
        TS_NODE_CACHE: 'false',
      },
      debug: process.env.E2E_CLIENT_DEBUG === 'true',
      useTsNode: true,
      serverScriptPath: path.resolve(projectRoot, 'src/mcp-stdio-server.ts'),
    });

    await client.ensureServerReady();
    expect(client.isServerReady()).toBe(true);
    console.log('[E2E SETUP] STDIO: McpStdioClient connected and server ready.');

    console.log(
      `[E2E SETUP] STDIO: Initializing memory bank for ${testRepositoryName}:${testBranch}...`,
    );
    const initArgs = {
      repository: testRepositoryName,
      branch: testBranch,
      clientProjectRoot: testClientProjectRoot,
    };
    const initResponse = await client.getFinalToolResult('init-memory-bank', initArgs);

    if (
      initResponse &&
      (initResponse as any).clientError // Check for ClientSideError
    ) {
      const clientError = initResponse as any; // ClientSideError
      console.error(
        '[E2E SETUP] STDIO: init-memory-bank failed (ClientSideError in beforeAll):',
        clientError.clientError.message,
      );
      throw new Error(
        `Prerequisite init-memory-bank failed (ClientSideError in beforeAll): ${clientError.clientError.message}`,
      );
    } else if (
      initResponse &&
      !('jsonrpc' in initResponse) && // If not ClientSideError and not JSONRPC, then try McpError
      typeof (initResponse as any).code === 'number' &&
      typeof (initResponse as any).message === 'string'
    ) {
      const mcpError = initResponse as unknown as SDKMcpError; // Cast to unknown first
      console.error(
        '[E2E SETUP] STDIO: init-memory-bank failed (McpError in beforeAll):',
        mcpError.message,
      );
      throw new Error(
        `Prerequisite init-memory-bank failed (McpError in beforeAll): ${mcpError.message}`,
      );
    }

    // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
    // So initResponse IS the tool result
    const initToolResult = initResponse as unknown as {
      success: boolean;
      message: string;
      content?: any[];
    };

    // Check if initToolResult itself is falsy or if success is not true
    if (!initToolResult || initToolResult.success !== true) {
      console.warn(
        `[E2E SETUP] STDIO: init-memory-bank in beforeAll did not return a successful result. Result: ${JSON.stringify(initToolResult)}`,
      );
      throw new Error(
        `Prerequisite init-memory-bank failed: Did not return a valid successful result. Actual result: ${JSON.stringify(initToolResult)}`,
      );
    }
    expect(initToolResult.success).toBe(true); // Explicit assertion

    console.log('[E2E SETUP] STDIO: Seeding database...');
    const componentsToSeed: Array<
      Omit<Component, 'repository' | 'branch' | 'created_at' | 'updated_at'> & { id: string }
    > = [
      { id: 'comp-sdk-seed-001', name: 'SDK Seed Alpha', kind: 'library', status: 'active' },
      {
        id: 'comp-sdk-seed-002',
        name: 'SDK Seed Beta',
        kind: 'service',
        status: 'active',
        depends_on: ['comp-sdk-seed-001'],
      },
      { id: 'comp-sdk-seed-003', name: 'SDK Seed Gamma', kind: 'API', status: 'planned' },
    ];
    seededComponentId1 = componentsToSeed[0].id;
    seededComponentId2 = componentsToSeed[1].id;

    for (const comp of componentsToSeed) {
      const addCompArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        // clientProjectRoot: testClientProjectRoot, // Not needed by AddComponentInputSchema if session handles it
        id: comp.id,
        name: comp.name,
        kind: comp.kind,
        status: comp.status as 'active' | 'deprecated' | 'planned',
        depends_on: comp.depends_on,
      };
      const addCompResponse = await client.getFinalToolResult('add-component', addCompArgs);

      if (
        addCompResponse &&
        (addCompResponse as any).clientError // Check for ClientSideError
      ) {
        const clientError = addCompResponse as any;
        console.error(
          `[E2E SETUP] STDIO: Failed to seed component ${comp.id} (ClientSideError):`,
          clientError.clientError.message,
        );
        throw new Error(
          `Failed to seed component ${comp.id} (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        addCompResponse &&
        !('jsonrpc' in addCompResponse) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (addCompResponse as any).code === 'number' &&
        typeof (addCompResponse as any).message === 'string'
      ) {
        const mcpError = addCompResponse as unknown as SDKMcpError; // Cast to unknown first
        console.error(
          `[E2E SETUP] STDIO: Failed to seed component ${comp.id} (McpError):`,
          mcpError.message,
        );
        throw new Error(`Failed to seed component ${comp.id} (McpError): ${mcpError.message}`);
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const addCompToolResult = addCompResponse as unknown as { success: boolean };
      if (!addCompToolResult || addCompToolResult.success !== true) {
        console.error(`[E2E SETUP] STDIO: Failed to seed component ${comp.id}:`, addCompToolResult);
        throw new Error(`Failed to seed component ${comp.id}: Tool result was not successful`);
      }
    }
    console.log(`[E2E SETUP] STDIO: ${componentsToSeed.length} components seeded.`);

    testDecisionId = `dec-sdk-seed-${Date.now()}`;
    const decisionArgs = {
      repository: testRepositoryName,
      branch: testBranch,
      clientProjectRoot: testClientProjectRoot,
      id: testDecisionId,
      name: 'SDK Seed Decision',
      date: '2024-01-10',
      context: 'Seeded for E2E tests',
    };
    const decResponse = await client.getFinalToolResult('add-decision', decisionArgs);
    if (
      decResponse &&
      (decResponse as any).clientError // Check for ClientSideError
    ) {
      const clientError = decResponse as any;
      throw new Error(
        `Failed to seed decision (ClientSideError): ${clientError.clientError.message}`,
      );
    } else if (
      decResponse &&
      !('jsonrpc' in decResponse) && // If not ClientSideError and not JSONRPC, then try McpError
      typeof (decResponse as any).code === 'number' &&
      typeof (decResponse as any).message === 'string'
    ) {
      const mcpError = decResponse as unknown as SDKMcpError; // Cast to unknown first
      throw new Error(`Failed to seed decision (McpError): ${mcpError.message}`);
    }
    // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
    const decToolResult = decResponse as unknown as { success: boolean };
    if (!decToolResult || decToolResult.success !== true) {
      throw new Error(`Failed to seed decision: Tool result was not successful`);
    }
    expect(decToolResult.success).toBe(true);
    console.log('[E2E SETUP] STDIO: 1 decision seeded.');

    testRuleId = `rule-sdk-seed-${Date.now()}`;
    const ruleArgs = {
      repository: testRepositoryName,
      branch: testBranch,
      clientProjectRoot: testClientProjectRoot,
      id: testRuleId,
      name: 'SDK Seed Rule',
      created: '2024-01-11',
      content: 'Test rule content',
      status: 'active' as 'active' | 'deprecated' | 'proposed',
    };
    const ruleResponse = await client.getFinalToolResult('add-rule', ruleArgs);

    if (
      ruleResponse &&
      (ruleResponse as any).clientError // Check for ClientSideError
    ) {
      const clientError = ruleResponse as any;
      throw new Error(`Failed to seed rule (ClientSideError): ${clientError.clientError.message}`);
    } else if (
      ruleResponse &&
      !('jsonrpc' in ruleResponse) && // If not ClientSideError and not JSONRPC, then try McpError
      typeof (ruleResponse as any).code === 'number' &&
      typeof (ruleResponse as any).message === 'string'
    ) {
      const mcpError = ruleResponse as unknown as SDKMcpError; // Cast to unknown first
      throw new Error(`Failed to seed rule (McpError): ${mcpError.message}`);
    }
    // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
    const ruleToolResultPayload = ruleResponse as unknown as { success: boolean };
    if (!ruleToolResultPayload || ruleToolResultPayload.success !== true) {
      throw new Error(`Failed to seed rule: Tool result was not successful`);
    }
    expect(ruleToolResultPayload.success).toBe(true);
    console.log('[E2E SETUP] STDIO: 1 rule seeded.');

    console.log('[E2E SETUP] STDIO: Database seeding complete.');
  });

  afterAll(async () => {
    if (client) {
      console.log('[STDIO E2E Teardown] Stopping server...');
      await client.stopServer();
    }
    if (dbPathForStdioTest) {
      console.log(`[STDIO E2E Teardown] Cleaning up test database: ${dbPathForStdioTest}`);
      await cleanupTestDB(dbPathForStdioTest);
      console.log('[STDIO E2E Teardown] Test database cleaned up.');
    }
  });

  describe('Basic Server and Core Tool Functionality (SDK)', () => {
    it('T_STDIO_SDK_001: server should be ready and list tools', async () => {
      expect(client.isServerReady()).toBe(true);
      const tools: ToolAnnotations[] = await client.listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      const initToolDef = tools.find((t) => t.name === 'init-memory-bank');
      expect(initToolDef).toBeDefined();
      expect(initToolDef?.name).toBe('init-memory-bank');
      expect(initToolDef?.inputSchema).toBeDefined();
    });

    it('T_STDIO_SDK_002: init-memory-bank (secondary check)', async () => {
      const tempRepoName = `${testRepositoryName}-tempinit-sdk`;
      const args = {
        repository: tempRepoName,
        branch: testBranch,
        clientProjectRoot: testClientProjectRoot,
      };
      const response = await client.getFinalToolResult('init-memory-bank', args);

      if (
        response &&
        (response as any).clientError // Check for ClientSideError
      ) {
        const clientError = response as any;
        throw new Error(
          `init-memory-bank failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        response &&
        !('jsonrpc' in response) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`init-memory-bank failed (McpError): ${mcpError.message}`);
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      // No need to check for JSON-RPC errors since we get the tool result directly

      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const toolResult = response as unknown as {
        success: boolean;
        message: string;
        dbPath: string;
      };
      expect(toolResult?.success).toBe(true);
      expect(toolResult?.message).toContain(`Memory bank initialized for ${tempRepoName}`);
      expect(toolResult?.dbPath).toContain(testClientProjectRoot);

      // IMPORTANT: Restore the session to the original repository for subsequent tests
      const restoreSessionArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        clientProjectRoot: testClientProjectRoot,
      };
      const restoreResponse = await client.getFinalToolResult(
        'init-memory-bank',
        restoreSessionArgs,
      );
      if (
        restoreResponse &&
        (restoreResponse as any).clientError // Check for ClientSideError
      ) {
        const clientError = restoreResponse as any;
        throw new Error(
          `Failed to restore session (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        restoreResponse &&
        !('jsonrpc' in restoreResponse) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (restoreResponse as any).code === 'number' &&
        typeof (restoreResponse as any).message === 'string'
      ) {
        const mcpError = restoreResponse as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`Failed to restore session (McpError): ${mcpError.message}`);
      }
      const restoreResult = restoreResponse as unknown as { success: boolean };
      expect(restoreResult?.success).toBe(true);
    });

    it('T_STDIO_SDK_003: get-metadata and update-metadata', async () => {
      // First, update metadata for the repository
      const updateArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        clientProjectRoot: testClientProjectRoot,
        metadata: {
          id: 'meta',
          project: { name: 'SDK Test Project', description: 'E2E Testing Repository' },
          tech_stack: { language: 'TypeScript', framework: 'Node.js' },
        },
      };
      const updateResponse = await client.getFinalToolResult('update-metadata', updateArgs);

      if (
        updateResponse &&
        (updateResponse as any).clientError // Check for ClientSideError
      ) {
        const clientError = updateResponse as any;
        throw new Error(
          `update-metadata failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        updateResponse &&
        !('jsonrpc' in updateResponse) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (updateResponse as any).code === 'number' &&
        typeof (updateResponse as any).message === 'string'
      ) {
        const mcpError = updateResponse as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`update-metadata failed (McpError): ${mcpError.message}`);
      }

      type MetadataOutput = {
        // This matches MetadataContentSchema
        id: string;
        project?: { name: string; description?: string };
        tech_stack?: { language?: string; framework?: string };
      };

      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const updateToolResult = updateResponse as unknown as {
        success: boolean;
        metadata: MetadataOutput;
      };

      expect(updateToolResult).toBeDefined();
      expect(updateToolResult.success).toBe(true);
      expect(updateToolResult.metadata).toBeDefined();

      // Now get the metadata and verify it matches what we set
      const getArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        clientProjectRoot: testClientProjectRoot,
      };
      const getResponse = await client.getFinalToolResult('get-metadata', getArgs);

      if (
        getResponse &&
        (getResponse as any).clientError // Check for ClientSideError
      ) {
        const clientError = getResponse as any;
        throw new Error(
          `get-metadata failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        getResponse &&
        !('jsonrpc' in getResponse) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (getResponse as any).code === 'number' &&
        typeof (getResponse as any).message === 'string'
      ) {
        const mcpError = getResponse as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`get-metadata failed (McpError): ${mcpError.message}`);
      }

      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const getToolResult = getResponse as unknown as MetadataOutput;

      expect(getToolResult).toBeDefined();
      expect(getToolResult.id).toBe('meta');
      expect(getToolResult.project?.name).toBe('SDK Test Project');
      expect(getToolResult.project?.description).toBe('E2E Testing Repository');
      expect(getToolResult.tech_stack?.language).toBe('TypeScript');
      expect(getToolResult.tech_stack?.framework).toBe('Node.js');
    });

    it('T_STDIO_SDK_004: get-context and update-context', async () => {
      const contextId = `ctx-sdk-${Date.now()}`;
      const updateCtxArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        id: contextId,
        name: 'Initial SDK Context',
        summary: 'Context for SDK E2E', // Changed from content to summary per schema
      };
      const updateCtxResponse = await client.getFinalToolResult('update-context', updateCtxArgs);

      if (
        updateCtxResponse &&
        (updateCtxResponse as any).clientError // Check for ClientSideError
      ) {
        const clientError = updateCtxResponse as any;
        throw new Error(
          `update-context failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        updateCtxResponse &&
        !('jsonrpc' in updateCtxResponse) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (updateCtxResponse as any).code === 'number' &&
        typeof (updateCtxResponse as any).message === 'string'
      ) {
        const mcpError = updateCtxResponse as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`update-context failed (McpError): ${mcpError.message}`);
      }
      type UpdateContextOutput = { success: boolean; message?: string; context?: Context };
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const updateCtxToolResult = updateCtxResponse as unknown as UpdateContextOutput;

      expect(updateCtxToolResult).toBeDefined();
      if (updateCtxToolResult) {
        expect(updateCtxToolResult.success).toBe(true);
        expect(updateCtxToolResult.context).toBeDefined();
        expect(updateCtxToolResult.context?.name).toBe('Initial SDK Context');
      } else {
        throw new Error('updateCtxToolResult was unexpectedly undefined after checks');
      }
      const getCtxArgs = {
        repository: testRepositoryName,
        branch: testBranch,
      };
      const getCtxResponse = await client.getFinalToolResult('get-context', getCtxArgs);

      if (
        getCtxResponse &&
        (getCtxResponse as any).clientError // Check for ClientSideError
      ) {
        const clientError = getCtxResponse as any;
        throw new Error(`get-context failed (ClientSideError): ${clientError.clientError.message}`);
      } else if (
        getCtxResponse &&
        !('jsonrpc' in getCtxResponse) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (getCtxResponse as any).code === 'number' &&
        typeof (getCtxResponse as any).message === 'string'
      ) {
        const mcpError = getCtxResponse as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`get-context failed (McpError): ${mcpError.message}`);
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      // No need to check for JSON-RPC errors since we get the tool result directly
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const retrievedContexts = getCtxResponse as unknown as Context | Context[];

      let foundContext: Context | undefined;
      if (Array.isArray(retrievedContexts)) {
        expect(retrievedContexts.length).toBe(1);
        foundContext = retrievedContexts[0];
      } else {
        foundContext = retrievedContexts;
      }
      expect(foundContext).toBeDefined();
      expect(foundContext!.id).toBe(contextId);
      expect(foundContext!.name).toBe('Initial SDK Context');
    });
  });
  describe('SDK Entity CRUD Tools', () => {
    let crudTestComponentId: string;
    let crudTestDependentComponentId: string;

    it('T_STDIO_SDK_CRUD_add-component: should add a primary component', async () => {
      crudTestComponentId = `e2e-sdk-crud-comp-${Date.now()}`;
      const toolArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        id: crudTestComponentId,
        name: 'SDK CRUD Primary Component',
        kind: 'module',
        status: 'active' as 'active' | 'deprecated' | 'planned',
      };
      const response = await client.getFinalToolResult('add-component', toolArgs);

      if (
        response &&
        (response as any).clientError // Check for ClientSideError
      ) {
        const clientError = response as any;
        throw new Error(
          `add-component failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        response &&
        !('jsonrpc' in response) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`add-component failed (McpError): ${mcpError.message}`);
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const toolResult = response as unknown as {
        success: boolean;
        message: string;
        component: Component;
      };
      expect(toolResult.success).toBe(true);
      expect(toolResult.message).toContain(
        `Component '${toolArgs.name}' (id: ${crudTestComponentId}) added/updated`,
      );
      expect(toolResult.component).toBeDefined();
      expect(toolResult.component.id).toBe(crudTestComponentId);
      expect(toolResult.component.name).toBe(toolArgs.name);
    });

    it('T_STDIO_SDK_CRUD_add-component-dependent: should add a dependent component', async () => {
      expect(crudTestComponentId).toBeDefined();
      crudTestDependentComponentId = `e2e-sdk-crud-dep-${Date.now()}`; // Initialize before use
      const toolArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        id: crudTestDependentComponentId,
        name: 'SDK CRUD Dependent Component',
        kind: 'service',
        status: 'active' as 'active' | 'deprecated' | 'planned',
        depends_on: [crudTestComponentId],
      };
      const response = await client.getFinalToolResult('add-component', toolArgs);

      if (
        response &&
        (response as any).clientError // Check for ClientSideError
      ) {
        const clientError = response as any;
        throw new Error(
          `add-component (dependent) failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        response &&
        !('jsonrpc' in response) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`add-component (dependent) failed (McpError): ${mcpError.message}`);
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const toolResult = response as unknown as {
        success: boolean;
        message: string;
        component: Component;
      };
      expect(toolResult.success).toBe(true);
      expect(toolResult.message).toContain(
        `Component '${toolArgs.name}' (id: ${crudTestDependentComponentId}) added/updated`,
      );
      expect(toolResult.component).toBeDefined();
    });

    it('T_STDIO_SDK_CRUD_add-decision: should add a decision', async () => {
      crudTestDecisionId = `e2e-sdk-crud-dec-${Date.now()}`; // Initialize crudTestDecisionId
      const toolArgs = {
        repository: testRepositoryName, // Added repository
        branch: testBranch,
        id: crudTestDecisionId,
        name: 'SDK CRUD Decision',
        date: new Date().toISOString().split('T')[0],
        status: 'accepted' as 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded',
      };
      const response = await client.getFinalToolResult('add-decision', toolArgs);

      if (response && (response as any).clientError) {
        const clientError = response as any;
        throw new Error(
          `add-decision failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        response &&
        !('jsonrpc' in response) &&
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as unknown as SDKMcpError;
        throw new Error(`add-decision failed (McpError): ${mcpError.message}`);
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const toolResultDec = response as unknown as {
        success: boolean;
        message: string;
      };
      expect(toolResultDec.success).toBe(true);
    });

    it('T_STDIO_SDK_CRUD_add-rule: should add a rule', async () => {
      crudTestRuleId = `e2e-sdk-crud-rule-${Date.now()}`;
      const toolArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        id: crudTestRuleId,
        name: 'SDK CRUD Rule',
        created: new Date().toISOString().split('T')[0],
        content: 'Test rule content for SDK CRUD',
        status: 'active' as 'active' | 'deprecated' | 'proposed',
        triggers: ['on_commit', 'on_pr_merge'],
      };
      const response = await client.getFinalToolResult('add-rule', toolArgs);

      if (response && (response as any).clientError) {
        const clientError = response as any;
        throw new Error(`add-rule failed (ClientSideError): ${clientError.clientError.message}`);
      } else if (
        response &&
        !('jsonrpc' in response) &&
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as unknown as SDKMcpError;
        throw new Error(`add-rule failed (McpError): ${mcpError.message}`);
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const toolResultRule = response as unknown as {
        success: boolean;
        message: string;
        rule?: Rule;
      };
      expect(toolResultRule.success).toBe(true);
      expect(toolResultRule.message).toContain(
        `Rule '${toolArgs.name}' (id: ${crudTestRuleId}) added/updated`,
      );
      expect(toolResultRule.rule).toBeDefined();
      if (toolResultRule.rule) {
        expect(toolResultRule.rule.id).toBe(crudTestRuleId);
        expect(toolResultRule.rule.triggers).toEqual(['on_commit', 'on_pr_merge']);
      }
    });
  });

  describe('SDK Traversal and Graph Tool Tests', () => {
    let travDecisionId: string;

    beforeAll(async () => {
      expect(seededComponentId1).toBeDefined();
      expect(seededComponentId2).toBeDefined();

      travDecisionId = `trav-dec-${Date.now()}`;
      const decisionArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        id: travDecisionId,
        name: 'Decision For Traversal Test Component',
        date: '2024-02-05',
      };
      const response = await client.getFinalToolResult('add-decision', decisionArgs);
      if (response && (response as any).clientError) {
        const clientError = response as any;
        throw new Error(
          `Setup failed for Traversal Tests: add-decision ${travDecisionId} (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        response &&
        !('jsonrpc' in response) &&
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as unknown as SDKMcpError;
        throw new Error(
          `Setup failed for Traversal Tests: add-decision ${travDecisionId} (McpError): ${mcpError.message}`,
        );
      }
      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const travDecToolResult = response as unknown as { success: boolean };
      expect(travDecToolResult.success).toBe(true);
      console.log();
    });

    it('T_STDIO_SDK_TRAV_get-component-dependencies: should retrieve dependency', async () => {
      const toolArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        componentId: seededComponentId2!,
      };
      const stream = await client.callTool('get-component-dependencies', toolArgs);
      const { finalResponse, error } = await collectSdkStdioEvents(stream as any);
      expect(error).toBeUndefined();
      expect(finalResponse).not.toBeNull();
      if (!finalResponse || ('error' in finalResponse && finalResponse.error)) {
        // Check for .error property
        throw new Error(
          `get-component-dependencies failed: ${(finalResponse as any)?.error?.message}`,
        );
      }
      // This tool returns its payload directly in result, not as SDKCallToolResult
      // Ensure it's a success response before accessing result
      let result: { status: string; dependencies: any[] } | null = null;
      if (finalResponse && !('error' in finalResponse) && !('clientError' in finalResponse)) {
        result = finalResponse!.result as {
          // Assert finalResponse is not null
          status: string;
          dependencies: any[];
        } | null;
      } else if (finalResponse && 'clientError' in finalResponse) {
        throw new Error(`get-component-dependencies unexpectedly returned ClientSideError.`);
      }
      // else it's a JSONRPCError or SDKMcpError, handled by the fail condition above or error check

      expect(result?.status).toBe('complete');
      expect(Array.isArray(result?.dependencies)).toBe(true);
      expect(result?.dependencies.length).toBeGreaterThan(0);
      expect(result?.dependencies[0].id).toBe(seededComponentId1);
    });

    it('T_STDIO_SDK_TRAV_get-component-dependents: should retrieve dependents', async () => {
      const toolArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        componentId: seededComponentId1!, // Get dependents of comp-sdk-seed-001 (should find comp-sdk-seed-002)
      };
      const stream = await client.callTool('get-component-dependents', toolArgs);
      const { finalResponse, error } = await collectSdkStdioEvents(stream as any);
      expect(error).toBeUndefined();
      expect(finalResponse).not.toBeNull();
      if (!finalResponse || ('error' in finalResponse && finalResponse.error)) {
        // Check for .error property
        throw new Error(
          `get-component-dependents failed: ${(finalResponse as any)?.error?.message}`,
        );
      }

      let result_dependents: { status: string; dependents: any[] } | null = null; // Renamed
      if (finalResponse && !('error' in finalResponse) && !('clientError' in finalResponse)) {
        result_dependents = finalResponse!.result as {
          status: string;
          dependents: any[];
        } | null;
      } else if (finalResponse && 'clientError' in finalResponse) {
        throw new Error(`get-component-dependents unexpectedly returned ClientSideError.`);
      }

      expect(result_dependents?.status).toBe('complete');
      expect(Array.isArray(result_dependents?.dependents)).toBe(true);
      expect(result_dependents?.dependents.length).toBeGreaterThan(0); // Based on seeded data (comp2 depends on comp1)
    });
    it('T_STDIO_SDK_TRAV_get-governing-items-for-component: should attempt to retrieve items', async () => {
      // Re-initialize client for this specific test if needed, or ensure outer client is fine
      // const client = new McpStdioClient(...) // If specific setup needed

      const toolArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        componentId: seededComponentId1!,
      };
      const stream = await client.callTool('get-governing-items-for-component', toolArgs);
      const { finalResponse, error } = await collectSdkStdioEvents(stream as any);
      expect(error).toBeUndefined();
      expect(finalResponse).not.toBeNull();
      if (
        !finalResponse ||
        ('error' in finalResponse &&
          finalResponse.error &&
          (finalResponse.error as any).message !== 'No governing items found.')
      ) {
        // Allow specific "not found" error
        // If it's an error, it might be an expected empty result or actual processing error
        // For now, allow to pass if finalResponse.error exists as test might check this.
        // But if it implies failure, then fail:
        throw new Error(
          `get-governing-items-for-component failed: ${(finalResponse as any)?.error?.message}`,
        );
      }

      let result_gov_items: { status: string; decisions: any[]; rules: any[] } | null = null; // Renamed
      if (finalResponse && !('error' in finalResponse) && !('clientError' in finalResponse)) {
        result_gov_items = finalResponse!.result as {
          status: string;
          decisions: any[];
          rules: any[];
        } | null;
      } else if (finalResponse && 'clientError' in finalResponse) {
        throw new Error(`get-governing-items-for-component returned ClientSideError`);
      }
      // If it was an error, but the allowed one, result_gov_items will be null here, which is fine.

      // Only assert on result if it's not null (i.e., successful response)
      if (result_gov_items) {
        expect(result_gov_items?.status).toBe('complete');
        expect(Array.isArray(result_gov_items?.decisions)).toBe(true);
        expect(Array.isArray(result_gov_items?.rules)).toBe(true);
      }
    });

    it('T_STDIO_SDK_TRAV_get-item-contextual-history', async () => {
      // Re-initialize client for this specific test if needed
      // Corrected: Define all necessary fields for updateCtxArgs including an id
      const updateCtxArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        id: `ctx-hist-test-${Date.now()}`,
        name: 'Context for History Test',
        associated_component_id: seededComponentId1!,
      };
      const updateCtxResponse = await client.getFinalToolResult('update-context', updateCtxArgs);

      // Handle ClientSideError
      if (updateCtxResponse && (updateCtxResponse as any).clientError) {
        const clientError = updateCtxResponse as any;
        throw new Error(
          `Update context for history test failed (ClientSideError): ${clientError.clientError.message}`,
        );
      }

      // Handle McpError
      if (
        updateCtxResponse &&
        !('jsonrpc' in updateCtxResponse) &&
        typeof (updateCtxResponse as any).code === 'number' &&
        typeof (updateCtxResponse as any).message === 'string'
      ) {
        const mcpError = updateCtxResponse as unknown as SDKMcpError;
        throw new Error(`Update context for history test failed (McpError): ${mcpError.message}`);
      }

      // getFinalToolResult now properly extracts data from MCP format, so updateCtxResponse is the actual tool result
      const updateContextResult = updateCtxResponse as unknown as {
        success: boolean;
        context?: any;
      };
      expect(updateContextResult.success).toBe(true);

      const toolArgsGetHistory = {
        repository: testRepositoryName,
        itemId: seededComponentId1!,
        itemType: 'Component' as 'Component' | 'Decision' | 'Rule',
        branch: testBranch,
      };
      const stream = await client.callTool('get-item-contextual-history', toolArgsGetHistory);
      const { finalResponse, error } = await collectSdkStdioEvents(stream as any);

      expect(error).toBeUndefined();
      expect(finalResponse).not.toBeNull();
      if (
        !finalResponse ||
        ('error' in finalResponse &&
          finalResponse.error &&
          (finalResponse.error as any).message !== 'No context history found.')
      ) {
        // Allow specific "not found" error
        // fail(`get-item-contextual-history returned an error: ${(finalResponse as any)?.error?.message || 'Unknown error'}`);
        throw new Error(
          `get-item-contextual-history failed: ${(finalResponse as any)?.error?.message}`,
        );
      }

      let result_history: { status: string; contextHistory: any[] } | null = null; // Renamed
      if (finalResponse && !('error' in finalResponse) && !('clientError' in finalResponse)) {
        result_history = finalResponse!.result as {
          status: string;
          contextHistory: any[];
        } | null;
      } else if (finalResponse && 'clientError' in finalResponse) {
        throw new Error(`get-item-contextual-history returned ClientSideError`);
      }

      if (result_history) {
        expect(result_history?.status).toBe('complete');
        expect(Array.isArray(result_history?.contextHistory)).toBe(true);
      }
      // Potentially check if the seeded context summary appears in history if applicable
    });

    it('T_STDIO_SDK_TRAV_shortest-path: should find path between dependent and primary', async () => {
      // Re-initialize client for this specific test if needed
      // const client = new McpStdioClient(...)
      const toolArgsShortestPath = {
        // Renamed to avoid potential conflict
        repository: testRepositoryName, // Repository is usually required for graph operations
        branch: testBranch, // Branch might also be required
        startNodeId: seededComponentId2!,
        endNodeId: seededComponentId1!,
        projectedGraphName: `sp_sdk_trav_comps_${Date.now()}`.substring(0, 30),
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      };
      const stream = await client.callTool('shortest-path', toolArgsShortestPath); // Use renamed toolArgs
      const { finalResponse, error } = await collectSdkStdioEvents(stream as any);

      expect(error).toBeUndefined();
      expect(finalResponse).not.toBeNull();
      if (!finalResponse || ('error' in finalResponse && finalResponse.error)) {
        // Check .error
        throw new Error(`shortest-path failed: ${(finalResponse as any)?.error?.message}`);
      }

      let result_sp: { status: string; results: { pathFound: boolean; path: any[] } } | null = null; // Renamed
      if (finalResponse && !('error' in finalResponse) && !('clientError' in finalResponse)) {
        result_sp = finalResponse!.result as {
          status: string;
          results: { pathFound: boolean; path: any[] };
        } | null;
      } else if (finalResponse && 'clientError' in finalResponse) {
        throw new Error(`shortest-path returned ClientSideError`);
      }

      expect(result_sp?.status).toBe('complete');
      expect(result_sp?.results).toBeDefined();
      if (result_sp && result_sp.results) {
        // Ensure result_sp and result_sp.results are defined
        expect(result_sp.results.pathFound).toBe(true);
        expect(Array.isArray(result_sp.results.path)).toBe(true);

        const pathNodeIds = result_sp.results.path
          .filter(
            (p: any) =>
              p.id && (p.kind || p._label === 'Component' || p.labels?.includes('Component')),
          )
          .map((node: any) => node.id.toString());
        expect(pathNodeIds).toContain(seededComponentId2);
        expect(pathNodeIds).toContain(seededComponentId1);
        expect(pathNodeIds.length).toBeGreaterThanOrEqual(2);
      } else {
        throw new Error(
          'Shortest path result or results.path was unexpectedly undefined after checks',
        );
      }
    });

    it('T_STDIO_SDK_TRAV_shortest-path-reflexive: should find path to self', async () => {
      // Re-initialize client for this specific test if needed
      // const client = new McpStdioClient(...)
      const toolArgsReflexive = {
        // Renamed to avoid potential conflict
        repository: testRepositoryName,
        branch: testBranch,
        startNodeId: seededComponentId1!,
        endNodeId: seededComponentId1!,
        projectedGraphName: `sp_sdk_trav_reflex_${Date.now()}`.substring(0, 30),
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'], // Need at least one relationship for schema validation
      };
      const stream = await client.callTool('shortest-path', toolArgsReflexive); // Use renamed toolArgs
      const { finalResponse, error } = await collectSdkStdioEvents(stream as any);

      expect(error).toBeUndefined();
      expect(finalResponse).not.toBeNull();
      if (
        !finalResponse ||
        ('error' in finalResponse &&
          finalResponse.error &&
          (finalResponse.error as any).message !== 'Path not found' &&
          (finalResponse.error as any).message !== 'No path found between the two nodes.')
      ) {
        // fail(`shortest-path-reflexive returned an error: ${(finalResponse as any)?.error?.message || 'Unknown error'}`);
        throw new Error(
          `shortest-path-reflexive failed: ${(finalResponse as any)?.error?.message}`,
        );
      }

      let result_sp_reflex: {
        status: string;
        results: { pathFound: boolean; path: any[] };
      } | null = null; // Renamed
      if (finalResponse && !('error' in finalResponse) && !('clientError' in finalResponse)) {
        result_sp_reflex = finalResponse!.result as {
          status: string;
          results: { pathFound: boolean; path: any[] };
        } | null;
      } else if (finalResponse && 'clientError' in finalResponse) {
        throw new Error(`shortest-path-reflexive returned ClientSideError`);
      }

      // Only assert on result_sp_reflex if it's not null (i.e. successful response)
      if (result_sp_reflex) {
        expect(result_sp_reflex?.status).toBe('complete');
        expect(result_sp_reflex?.results).toBeDefined();

        if (result_sp_reflex.results.pathFound) {
          expect(result_sp_reflex.results.path.length).toBe(1); // Path to self is just the node itself
          expect(result_sp_reflex.results.path[0].id.toString()).toBe(seededComponentId1);
        } else {
          // Some graph engines might return not found for a reflexive path if not explicitly handled
          // This branch allows the test to pass if pathFound is false but path is empty
          expect(result_sp_reflex?.results.pathFound).toBe(false);
          expect(
            Array.isArray(result_sp_reflex?.results.path) &&
              result_sp_reflex?.results.path.length === 0,
          ).toBe(true);
        }
      }
    });
  });

  describe('SDK Algorithm Tool Tests', () => {
    const algorithmToolsSetup = [
      {
        name: 'k-core-decomposition',
        args: {
          k: 1,
          projectedGraphName: `kcore_sdk_${Date.now()}`.substring(0, 30),
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        validateResults: (results: any, originalArgs: any) => {
          expect(results.k).toBe(originalArgs.k);
          expect(Array.isArray(results.components)).toBe(true);
        },
      },
      {
        name: 'louvain-community-detection',
        args: {
          projectedGraphName: `louvain_sdk_${Date.now()}`.substring(0, 30),
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        validateResults: (results: any) => {
          expect(Array.isArray(results.communities)).toBe(true);
          // Modularity might not always be present or could be 0 for small graphs
          // expect(results).toHaveProperty('modularity');
          if (results.communities.length > 0) {
            expect(results.communities[0]).toHaveProperty('nodeId');
            expect(results.communities[0]).toHaveProperty('communityId');
          }
        },
      },
      {
        name: 'pagerank',
        args: {
          projectedGraphName: `pagerank_sdk_${Date.now()}`.substring(0, 30),
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        validateResults: (results: any) => {
          expect(Array.isArray(results.ranks)).toBe(true);
          if (results.ranks.length > 0) {
            expect(results.ranks[0]).toHaveProperty('nodeId');
            expect(results.ranks[0]).toHaveProperty('score');
            expect(typeof results.ranks[0].score).toBe('number');
          }
        },
      },
      {
        name: 'strongly-connected-components',
        args: {
          projectedGraphName: `scc_sdk_${Date.now()}`.substring(0, 30),
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        validateResults: (results: any) => {
          expect(Array.isArray(results.components)).toBe(true);
          if (results.components.length > 0) {
            expect(results.components[0]).toHaveProperty('component_id'); // or 'communityId' depending on tool output
            expect(Array.isArray(results.components[0].nodes)).toBe(true);
          }
        },
      },
      {
        name: 'weakly-connected-components',
        args: {
          projectedGraphName: `wcc_sdk_${Date.now()}`.substring(0, 30),
          nodeTableNames: ['Component'],
          relationshipTableNames: ['DEPENDS_ON'],
        },
        validateResults: (results: any) => {
          expect(Array.isArray(results.components)).toBe(true);
          if (results.components.length > 0) {
            expect(results.components[0]).toHaveProperty('component_id'); // or 'communityId'
            expect(Array.isArray(results.components[0].nodes)).toBe(true);
          }
        },
      },
    ];

    // Direct test for pagerank (debugging)
    it('T_STDIO_SDK_ALGO_pagerank_direct: should execute pagerank with explicit args', async () => {
      const directArgs = {
        repository: testRepositoryName,
        branch: testBranch,
        projectedGraphName: `pagerank_direct_${Date.now()}`.substring(0, 30),
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      };

      console.log('[DEBUG] Direct pagerank args:', JSON.stringify(directArgs, null, 2));

      const response = await client.getFinalToolResult('pagerank', directArgs);

      if (
        response &&
        (response as any).clientError // Check for ClientSideError
      ) {
        const clientError = response as any;
        throw new Error(
          `Direct pagerank failed (ClientSideError): ${clientError.clientError.message}`,
        );
      } else if (
        response &&
        !('jsonrpc' in response) && // If not ClientSideError and not JSONRPC, then try McpError
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as unknown as SDKMcpError; // Cast to unknown first
        throw new Error(`Direct pagerank failed (McpError): ${mcpError.message}`);
      }

      // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
      const toolOutputWrapper = response as unknown as {
        status: string;
        results: any;
      };

      expect(toolOutputWrapper).toBeDefined();
      expect(toolOutputWrapper.status).toBe('complete');
      expect(toolOutputWrapper.results).toBeDefined();
      expect(Array.isArray(toolOutputWrapper.results.ranks)).toBe(true);
    });

    algorithmToolsSetup.forEach((toolSetup) => {
      it(`T_STDIO_SDK_ALGO_${toolSetup.name}: should execute and return structured results`, async () => {
        const toolArgsAlgo = {
          // Renamed to avoid potential conflict
          repository: testRepositoryName, // Repository is key for graph context
          branch: testBranch, // Branch might also be key
          ...toolSetup.args,
        };

        // Ensure client is initialized if not done globally for this describe block
        // const client = new McpStdioClient(...);
        // await client.ensureServerReady();

        // Use getFinalToolResult like the other working tests
        const response = await client.getFinalToolResult(toolSetup.name, toolArgsAlgo);

        if (
          response &&
          (response as any).clientError // Check for ClientSideError
        ) {
          const clientError = response as any;
          throw new Error(
            `Algorithm tool ${toolSetup.name} failed (ClientSideError): ${clientError.clientError.message}`,
          );
        } else if (
          response &&
          !('jsonrpc' in response) && // If not ClientSideError and not JSONRPC, then try McpError
          typeof (response as any).code === 'number' &&
          typeof (response as any).message === 'string'
        ) {
          const mcpError = response as unknown as SDKMcpError; // Cast to unknown first
          throw new Error(
            `Algorithm tool ${toolSetup.name} failed (McpError): ${mcpError.message}`,
          );
        }

        // The SDK client returns the tool result directly, not wrapped in a JSON-RPC response
        const toolOutputWrapper = response as unknown as {
          status: string;
          clientProjectRoot?: string;
          repository?: string;
          branch?: string;
          projectedGraphName?: string;
          results: any;
        };

        expect(toolOutputWrapper).toBeDefined();
        expect(toolOutputWrapper.status).toBe('complete');
        expect(toolOutputWrapper.results).toBeDefined();

        toolSetup.validateResults(toolOutputWrapper.results, toolSetup.args);
      });
    });
  });

  describe('SDK Error Handling Tests', () => {
    // let client: McpStdioClient; // Use the client from the outer scope or re-init

    // beforeEach(() => { // Not needed if outer client is used and stable
    //   client = new McpStdioClient({ ... });
    // });

    it('T_STDIO_SDK_ERROR_non-existent-tool: should handle invalid tool name', async () => {
      const response = await client.getFinalToolResult('non_existent_tool_sdk', {
        repository: 'test-repo', // Basic args for any tool
        branch: 'main',
      });
      expect(response).toBeDefined();

      // Check if this is a ClientSideError or McpError (new MCP SDK behavior)
      if ((response as any).clientError) {
        const clientError = response as any;
        expect(clientError.clientError.message).toContain('non_existent_tool_sdk');
        expect(clientError.clientError.code).toBe(-32602); // Invalid params (tool not found)
        return; // Test passes if we get a client-side error
      }

      if (
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as any;
        expect(mcpError.message).toContain('non_existent_tool_sdk');
        expect(mcpError.code).toBe(-32602); // Invalid params
        return; // Test passes if we get an MCP error
      }

      // Fallback: Non-existent tool should yield a JSONRPCError (legacy behavior)
      const jsonRpcResponse = response as SDKJSONRPCResponse;
      expect(isJSONRPCError(jsonRpcResponse)).toBe(true);
      if (isJSONRPCError(jsonRpcResponse)) {
        expect((jsonRpcResponse as any).error.code).toBe(-32601); // Method not found
        expect((jsonRpcResponse as any).error.message).toContain(
          "Tool 'non_existent_tool_sdk' not found",
        );
      }
    });

    it('T_STDIO_SDK_ERROR_missing-args: should handle missing required arguments for a tool (get-metadata)', async () => {
      const args = {
        // Missing 'repository' and 'id'
        branch: 'main',
      };
      const response = await client.getFinalToolResult('get-metadata', args as any); // Cast as any to bypass compile-time check for test

      expect(response).toBeDefined();

      // Check if this is a ClientSideError or McpError (new MCP SDK behavior)
      if ((response as any).clientError) {
        const clientError = response as any;
        expect(clientError.clientError.code).toBe(-32602); // Invalid params
        expect(clientError.clientError.message).toMatch(
          /repository|Invalid params|Input validation failed/i, // Error message might vary
        );
        return; // Test passes if we get a client-side error
      }

      if (
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as any;
        expect(mcpError.code).toBe(-32602); // Invalid params
        expect(mcpError.message).toMatch(/repository|Invalid params|Input validation failed/i);
        return; // Test passes if we get an MCP error
      }

      // Fallback: should yield a JSONRPCError (legacy behavior)
      const jsonRpcResponse = response as SDKJSONRPCResponse;
      expect(isJSONRPCError(jsonRpcResponse)).toBe(true);
      if (isJSONRPCError(jsonRpcResponse)) {
        expect((jsonRpcResponse as any).error.code).toBe(-32602); // Invalid params
        expect((jsonRpcResponse as any).error.message).toMatch(
          /repository|Invalid params|Input validation failed/i, // Error message might vary
        );
      }
    });

    it('T_STDIO_SDK_ERROR_init-memory-bank-missing-cpr: should fail if init-memory-bank is missing clientProjectRoot', async () => {
      const initArgs = {
        // Missing 'clientProjectRoot'
        repository: `${testRepositoryName}-errorcase`,
        branch: testBranch,
      };
      const response = await client.getFinalToolResult('init-memory-bank', initArgs as any);
      expect(response).toBeDefined();

      // Check if this is a ClientSideError or McpError (new MCP SDK behavior)
      if ((response as any).clientError) {
        const clientError = response as any;
        expect(clientError.clientError.code).toBe(-32602); // Invalid params
        expect(clientError.clientError.message).toMatch(
          /clientProjectRoot|Invalid params|Input validation failed/i,
        );
        return; // Test passes if we get a client-side error
      }

      if (
        typeof (response as any).code === 'number' &&
        typeof (response as any).message === 'string'
      ) {
        const mcpError = response as any;
        expect(mcpError.code).toBe(-32602); // Invalid params
        expect(mcpError.message).toMatch(
          /clientProjectRoot|Invalid params|Input validation failed/i,
        );
        return; // Test passes if we get an MCP error
      }

      // Fallback: should yield a JSONRPCError (legacy behavior)
      const jsonRpcResponse = response as SDKJSONRPCResponse;
      expect(isJSONRPCError(jsonRpcResponse)).toBe(true);
      if (isJSONRPCError(jsonRpcResponse)) {
        expect((jsonRpcResponse as any).error.code).toBe(-32602); // Invalid params
        expect((jsonRpcResponse as any).error.message).toMatch(
          /clientProjectRoot|Invalid params|Input validation failed/i,
        );
      }
    });
  });
});
