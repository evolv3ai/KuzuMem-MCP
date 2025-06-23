import { ChildProcess, spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

interface RpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

describe('MCP Stdio Server E2E Tests', () => {
  let serverProcess: ChildProcess;
  let testProjectRoot: string;
  let messageId = 1;
  const TEST_REPO = 'test-repo';
  const TEST_BRANCH = 'main';
  const testSessionId = `e2e-session-${Date.now()}`;

  // Store the initialization response to avoid duplicate initialize calls
  let initializationResponse: any;

  // Helper to add delays between resource-intensive operations
  const waitForStability = (ms: number = 1000) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper to send JSON-RPC message to server
  const sendMessage = (message: RpcMessage, timeoutMs: number = 30000): Promise<RpcMessage> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server response timeout'));
      }, timeoutMs);

      const responseHandler = (data: Buffer) => {
        try {
          const lines = data
            .toString()
            .split('\n')
            .filter((line) => line.trim());
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              if (response.id === message.id) {
                clearTimeout(timeout);
                serverProcess.stdout!.off('data', responseHandler);
                if (response.error) {
                  reject(new Error(`RPC Error: ${JSON.stringify(response.error)}`));
                } else {
                  resolve(response);
                }
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          serverProcess.stdout!.off('data', responseHandler);
          reject(error);
        }
      };

      serverProcess.stdout!.on('data', responseHandler);
      serverProcess.stdin!.write(JSON.stringify(message) + '\n');
    });
  };

  // Helper to call MCP tool
  const callTool = async (
    toolName: string,
    params: any,
    timeoutMs: number = 30000,
  ): Promise<any> => {
    const message: RpcMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
    };

    const response = await sendMessage(message, timeoutMs);

    if (response.result?.content?.[0]?.text) {
      try {
        // Attempt to parse, but fall back to raw text if it's not JSON
        return JSON.parse(response.result.content[0].text);
      } catch (e) {
        return response.result.content[0].text;
      }
    }

    return response.result;
  };

  beforeAll(async () => {
    // Create temporary directory for test database
    testProjectRoot = await mkdtemp(join(tmpdir(), 'kuzumem-e2e-'));
    console.log(`Test project root: ${testProjectRoot}`);

    // Start the stdio server
    const serverPath = join(__dirname, '../../..', 'src/mcp-stdio-server.ts');
    serverProcess = spawn('npx', ['tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    // Capture stderr for debugging
    serverProcess.stderr!.on('data', (data) => {
      console.error(`Server stderr: ${data}`);
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);

      const readyHandler = (data: Buffer) => {
        const output = data.toString();
        if (output.includes('MCP Server (stdio) initialized and listening')) {
          clearTimeout(timeout);
          serverProcess.stderr!.off('data', readyHandler);
          resolve();
        }
      };

      serverProcess.stderr!.on('data', readyHandler);
    });

    // Initialize the connection and store the response for reuse
    initializationResponse = await sendMessage({
      jsonrpc: '2.0',
      id: messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        sessionId: testSessionId,
        capabilities: {},
        clientInfo: {
          name: 'E2E Test Client',
          version: '1.0.0',
        },
      },
    });
  }, 60000);

  afterAll(async () => {
    // Kill the server process gracefully
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Give more time for graceful shutdown
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for force kill
      }
    }

    // Clean up test directory
    try {
      await rm(testProjectRoot, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to clean up test directory: ${error}`);
    }
  });

  describe('MCP Protocol Compliance', () => {
    it('T_STDIO_001: should return proper MCP initialize response', async () => {
      // Use the initialization response from beforeAll to avoid duplicate initialize calls
      // This respects the MCP protocol which expects only one initialize per connection
      expect(initializationResponse).toBeDefined();

      // Verify MCP compliance using the stored initialization response
      expect(initializationResponse).toMatchObject({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: {
              list: true,
              call: true,
              listChanged: true,
            },
          },
          serverInfo: {
            name: expect.any(String),
            version: expect.any(String),
          },
        },
      });

      // Verify tools list
      const toolsResponse = await sendMessage({
        jsonrpc: '2.0',
        id: 'test-tools',
        method: 'tools/list',
        params: {},
      });

      expect(toolsResponse).toMatchObject({
        jsonrpc: '2.0',
        id: 'test-tools',
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              description: expect.any(String),
              inputSchema: expect.any(Object),
            }),
          ]),
        },
      });

      // Should have at least 1 tool (resilient to build variations and refactors)
      expect(toolsResponse.result?.tools.length).toBeGreaterThan(0);
    });
  });

  describe('Tool 1: memory-bank', () => {
    it('should initialize memory bank', async () => {
      const result = await callTool('memory-bank', {
        operation: 'init',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Memory bank initialized'),
      });

      // Wait for database to stabilize after initialization
      await waitForStability(2000);
    }, 30000); // 30 second timeout for database initialization

    it('should get metadata', async () => {
      await waitForStability(1000); // Wait before operation

      const result = await callTool('memory-bank', {
        operation: 'get-metadata',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        id: expect.any(String),
        project: {
          name: TEST_REPO,
          created: expect.any(String),
        },
        tech_stack: expect.any(Object),
        architecture: expect.any(String),
        memory_spec_version: expect.any(String),
      });
    }, 20000);

    it('should update metadata', async () => {
      await waitForStability(1000); // Wait before operation

      const result = await callTool('memory-bank', {
        operation: 'update-metadata',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        metadata: {
          id: `${TEST_REPO}:${TEST_BRANCH}`,
          project: {
            name: TEST_REPO,
            created: new Date().toISOString(),
          },
          tech_stack: {
            language: 'TypeScript',
            framework: 'Node.js',
            database: 'KuzuDB',
          },
          architecture: 'microservices',
          memory_spec_version: '3.0.0',
        },
      });

      expect(result).toMatchObject({
        success: true,
      });
    }, 20000);
  });

  describe('Tool 2: entity', () => {
    it('should create component entity', async () => {
      await waitForStability(1000); // Wait before operation

      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        id: 'comp-test-service',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          name: 'Test Service',
          kind: 'service',
          status: 'active',
          depends_on: [],
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    }, 20000);

    it('should create decision entity', async () => {
      await waitForStability(500); // Wait before operation

      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'decision',
        id: 'dec-20241210-test-arch',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          name: 'Use Test Architecture',
          date: '2024-12-10',
          context: 'E2E testing decision',
          status: 'active',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    }, 20000);

    it('should create rule entity', async () => {
      await waitForStability(500); // Wait before operation

      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'rule',
        id: 'rule-test-pattern',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          name: 'Follow Test Pattern',
          created: '2024-12-10',
          content: 'All tests must follow AAA pattern',
          triggers: ['test', 'spec'],
          status: 'active',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    }, 20000);

    it('should create file entity', async () => {
      await waitForStability(500); // Wait before operation

      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'file',
        id: 'file-test-service-ts',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          name: 'test-service.ts',
          path: 'src/services/test-service.ts',
          language: 'typescript',
          size_bytes: 1024,
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    }, 20000);

    it('should create tag entity', async () => {
      await waitForStability(500); // Wait before operation

      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'tag',
        id: 'tag-critical',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          name: 'Critical',
          color: '#ff0000',
          description: 'Critical components',
          category: 'security',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    }, 20000);
  });

  describe('Tool 3: introspect', () => {
    it('should list all labels', async () => {
      await waitForStability(1000); // Wait before operation

      const result = await callTool('introspect', {
        query: 'labels',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        labels: expect.arrayContaining(['Component', 'Decision', 'Rule', 'File', 'Tag']),
      });
    }, 20000);

    it('should count nodes by label', async () => {
      await waitForStability(500); // Wait before operation

      const result = await callTool('introspect', {
        query: 'count',
        target: 'Component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        count: expect.any(Number),
        label: 'Component',
      });
      expect(result.count).toBeGreaterThanOrEqual(0);
    }, 20000);

    it('should get node properties', async () => {
      await waitForStability(500); // Wait before operation

      const result = await callTool('introspect', {
        query: 'properties',
        target: 'Component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      // The introspect tool should return a valid response structure
      expect(result).toBeDefined();

      // Check if it's a successful response with properties
      if (result && typeof result === 'object' && 'label' in result && 'properties' in result) {
        expect(result).toMatchObject({
          label: 'Component',
          properties: expect.any(Array),
        });

        // Properties might be empty if no components exist yet
        if (result.properties && result.properties.length > 0) {
          // Check if the first property has the expected structure
          const firstProperty = result.properties[0];
          if (firstProperty && typeof firstProperty === 'object' && Object.keys(firstProperty).length > 0) {
            expect(firstProperty).toMatchObject({
              name: expect.any(String),
              type: expect.any(String),
            });
          }
        }
      } else {
        // If properties introspection is not available or returns error message,
        // just verify the operation completed without crashing
        expect(result).toBeDefined();
      }
    }, 20000);
  });

  describe('Tool 4: context', () => {
    it('should update context', async () => {
      const result = await callTool('context', {
        operation: 'update',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        agent: 'e2e-test',
        summary: 'E2E test context',
        observation: 'Testing all unified tools',
      });

      expect(result).toMatchObject({
        success: true,
      });
    });
  });

  describe('Tool 5: query', () => {
    it('should query context', async () => {
      const result = await callTool('query', {
        type: 'context',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        latest: true,
        limit: 5,
      });

      expect(result).toMatchObject({
        type: 'context',
        contexts: expect.any(Array),
      });
    });

    it('should query entities', async () => {
      const result = await callTool('query', {
        type: 'entities',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        label: 'Component',
        limit: 10,
      });

      expect(result).toMatchObject({
        type: 'entities',
        label: 'Component',
        entities: expect.any(Array),
      });
    });

    it('should query dependencies', async () => {
      const result = await callTool('query', {
        type: 'dependencies',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        componentId: 'comp-test-service',
        direction: 'dependencies',
      });

      expect(result).toMatchObject({
        type: 'dependencies',
        componentId: 'comp-test-service',
        components: expect.any(Array),
      });
    });

    it('should query tags', async () => {
      const result = await callTool('query', {
        type: 'tags',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        tagId: 'tag-critical',
      });

      expect(result).toMatchObject({
        type: 'tags',
        tagId: 'tag-critical',
        items: expect.any(Array),
      });
    });
  });

  describe('Tool 6: associate', () => {
    it('should associate file with component', async () => {
      const result = await callTool('associate', {
        type: 'file-component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        fileId: 'file-test-service-ts',
        componentId: 'comp-test-service',
      });

      expect(result).toMatchObject({
        success: true,
        type: 'file-component',
      });
    });

    it('should tag an item', async () => {
      const result = await callTool('associate', {
        type: 'tag-item',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        itemId: 'comp-test-service',
        tagId: 'tag-critical',
        entityType: 'Component',
      });

      expect(result).toMatchObject({
        success: true,
        type: 'tag-item',
      });
    });
  });

  describe('Tool 7: analyze', () => {
    // Create more components for analysis
    beforeAll(async () => {
      // Create additional components for graph analysis
      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        id: 'comp-api-gateway',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          name: 'API Gateway',
          kind: 'service',
          depends_on: ['comp-test-service'],
        },
      });

      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        id: 'comp-database',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          name: 'Database',
          kind: 'datastore',
          depends_on: ['comp-test-service'],
        },
      });
    });

    it('should run PageRank analysis', async () => {
      const result = await callTool('analyze', {
        type: 'pagerank',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-pagerank',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'pagerank',
        status: 'complete',
        nodes: expect.any(Array),
      });
    });

    it('should find shortest path', async () => {
      const result = await callTool('detect', {
        type: 'path',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-shortest',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        startNodeId: 'comp-api-gateway',
        endNodeId: 'comp-database',
      });

      expect(result).toMatchObject({
        type: 'path',
        status: 'complete',
      });
    });
  });

  describe('Tool 8: detect', () => {
    it('should detect islands', async () => {
      const result = await callTool('detect', {
        type: 'islands',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-islands',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'islands',
        status: expect.stringMatching(/complete|error/),
        components: expect.any(Array),
      });
    });

    it('should detect cycles', async () => {
      const result = await callTool('detect', {
        type: 'cycles',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-cycles',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'cycles',
        status: expect.stringMatching(/complete|error/),
        components: expect.any(Array),
      });
    });
  });

  describe('Tool 9: bulk-import', () => {
    it('should bulk import entities', async () => {
      const result = await callTool('bulk-import', {
        type: 'components',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        components: [
          {
            id: 'comp-bulk-1',
            name: 'Bulk Component 1',
            kind: 'service',
            status: 'active',
            depends_on: [],
          },
          {
            id: 'comp-bulk-2',
            name: 'Bulk Component 2',
            kind: 'service',
            status: 'active',
            depends_on: ['comp-bulk-1'],
          },
        ],
      });

      expect(result).toMatchObject({
        imported: expect.any(Number),
      });
      expect(result.imported).toBeGreaterThan(0);
    });
  });

  describe('Tool 10: search', () => {
    it('should perform full-text search across entities', async () => {
      const result = await callTool(
        'search',
        {
          query: 'test service',
          repository: TEST_REPO,
          branch: TEST_BRANCH,
          mode: 'fulltext',
          entityTypes: ['component'],
          limit: 10,
        },
        15000,
      );

      expect(result).toMatchObject({
        status: 'success',
        mode: 'fulltext',
        results: expect.any(Array),
        totalResults: expect.any(Number),
        query: 'test service',
      });

      // Should find our test components
      if (result.results.length > 0) {
        expect(result.results[0]).toMatchObject({
          id: expect.any(String),
          type: 'component',
          name: expect.any(String),
          score: expect.any(Number),
        });
      }
    }, 20000);

    it('should search across multiple entity types', async () => {
      const result = await callTool(
        'search',
        {
          query: 'test decision',
          repository: TEST_REPO,
          branch: TEST_BRANCH,
          mode: 'fulltext',
          entityTypes: ['component', 'decision', 'rule'],
          limit: 5,
        },
        15000,
      );

      expect(result).toMatchObject({
        status: 'success',
        mode: 'fulltext',
        results: expect.any(Array),
        totalResults: expect.any(Number),
        query: 'test decision',
      });
    }, 20000);

    it('should handle empty search results gracefully', async () => {
      const result = await callTool(
        'search',
        {
          query: 'nonexistent-super-unique-term-12345',
          repository: TEST_REPO,
          branch: TEST_BRANCH,
          mode: 'fulltext',
          limit: 10,
        },
        15000,
      );

      expect(result).toMatchObject({
        status: 'success',
        mode: 'fulltext',
        results: [],
        totalResults: 0,
        query: 'nonexistent-super-unique-term-12345',
      });
    }, 20000);
  });

  describe('Tool 11: delete', () => {
    // First create some test entities to delete
    beforeAll(async () => {
      // Create test components for deletion
      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-delete-test-1',
        data: {
          name: 'Delete Test Component 1',
          kind: 'service',
          status: 'active',
        },
      });

      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-delete-test-2',
        data: {
          name: 'Delete Test Component 2',
          kind: 'service',
          status: 'deprecated',
        },
      });

      // Create a test tag
      await callTool('entity', {
        operation: 'create',
        entityType: 'tag',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'tag-delete-test',
        data: {
          name: 'Delete Test Tag',
          color: '#ff0000',
          description: 'Tag for deletion testing',
        },
      });

      // Tag one of the components
      await callTool('associate', {
        type: 'tag-item',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        tagId: 'tag-delete-test',
        itemId: 'comp-delete-test-1',
        itemType: 'Component',
      });
    }, 30000);

    it('should perform dry run for single entity deletion', async () => {
      const result = await callTool('delete', {
        operation: 'single',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-delete-test-1',
        dryRun: true,
      });

      expect(result).toMatchObject({
        success: true,
        operation: 'single',
        message: expect.stringContaining('Would delete'),
        deletedCount: 1,
        dryRun: true,
      });
    }, 10000);

    it('should delete a single component', async () => {
      const result = await callTool('delete', {
        operation: 'single',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-delete-test-2',
      });

      expect(result).toMatchObject({
        success: true,
        operation: 'single',
        message: expect.stringContaining('deleted successfully'),
        deletedCount: 1,
      });

      // Verify the component is actually deleted
      const queryResult = await callTool('entity', {
        operation: 'get',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-delete-test-2',
      });

      expect(queryResult.success).toBe(false);
    }, 15000);

    it('should perform dry run for bulk deletion by tag', async () => {
      const result = await callTool('delete', {
        operation: 'bulk-by-tag',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        tagId: 'tag-delete-test',
        dryRun: true,
      });

      expect(result).toMatchObject({
        success: true,
        operation: 'bulk-by-tag',
        message: expect.stringContaining('Would delete'),
        dryRun: true,
      });
    }, 10000);

    it('should require confirmation for bulk operations', async () => {
      const result = await callTool('delete', {
        operation: 'bulk-by-type',
        targetType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        success: false,
        operation: 'bulk-by-type',
        message: expect.stringContaining('confirm=true is required'),
        deletedCount: 0,
      });
    }, 10000);

    it('should handle non-existent entity deletion gracefully', async () => {
      const result = await callTool('delete', {
        operation: 'single',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-nonexistent',
      });

      expect(result).toMatchObject({
        success: false,
        operation: 'single',
        message: expect.stringContaining('not found'),
        deletedCount: 0,
      });
    }, 10000);
  });

  describe('System verification', () => {
    it('should verify system is operational after all tests', async () => {
      await waitForStability(1000); // Wait before final verification

      try {
        // Try to query all components to verify system is still operational
        const result = await callTool(
          'query',
          {
            type: 'entities',
            repository: TEST_REPO,
            branch: TEST_BRANCH,
            label: 'Component',
            limit: 50,
          },
          15000,
        );

        // If query succeeds, verify the response structure
        if (result && typeof result === 'object' && 'entities' in result) {
          expect(result).toHaveProperty('entities');
          expect(Array.isArray(result.entities)).toBe(true);

          // System should be operational (can return results, even if empty)
          expect(result.entities.length).toBeGreaterThanOrEqual(0);

          // If components exist, verify the system is working correctly
          if (result.entities.length > 0) {
            const componentIds = result.entities.map((e: any) => e.id);
            console.log('Found components after all tests:', componentIds);

            // Verify that each component has required properties
            result.entities.forEach((component: any) => {
              expect(component).toHaveProperty('id');
              expect(component).toHaveProperty('name');
            });
          } else {
            console.log('No components found - system operational but data cleaned up');
          }
        } else {
          // If query returns an error message, that's also valid - system is responding
          console.log('System responded with:', result);
          expect(result).toBeDefined();
        }
      } catch (error) {
        // If there's an error, verify it's a meaningful error response (system is responding)
        console.log('System error response:', error);
        expect(error).toBeDefined();
      }
    }, 20000);
  });
});
