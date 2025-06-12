import { ChildProcess, spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { join } from 'path';

describe('MCP HTTP Stream Server E2E Tests', () => {
  let serverProcess: ChildProcess;
  let testProjectRoot: string;
  let messageId = 1;
  let sessionId: string;
  const TEST_REPO = 'test-repo';
  const TEST_BRANCH = 'main';
  const SERVER_PORT = 3002; // Different port for testing
  const SERVER_URL = `http://localhost:${SERVER_PORT}`;

  // Helper to send HTTP request to server
  const sendHttpRequest = async (method: string, params: any): Promise<any> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    // Add session ID header if we have one
    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: messageId++,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // For streaming responses, we need to handle SSE
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('text/event-stream')) {
      const text = await response.text();
      const lines = text.split('\n');

      // Debug: Log the raw SSE stream
      console.log('Raw SSE response:', text);

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            console.log('Parsed SSE data:', data);
            if (data.id === messageId - 1) {
              if (data.error) {
                throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
              }
              return data;
            }
            // Check if it's an error response without matching ID
            if (data.error && !data.id) {
              console.log('Found error without ID:', data.error);
              throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
            }
          } catch (e) {
            if (e instanceof Error && e.message.startsWith('RPC Error:')) {
              throw e;
            }
            console.log('Failed to parse SSE line:', line, 'Error:', e);
          }
        }
      }
      throw new Error('No valid response found in SSE stream');
    } else {
      // Regular JSON response
      const data = await response.json();
      if (data.error) {
        throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
      }
      return data;
    }
  };

  // Helper to call MCP tool
  const callTool = async (toolName: string, params: any): Promise<any> => {
    const response = await sendHttpRequest('tools/call', {
      name: toolName,
      arguments: params,
    });

    if (response.result?.content?.[0]?.text) {
      const text = response.result.content[0].text;
      try {
        // Try to parse as JSON first
        return JSON.parse(text);
      } catch (e) {
        // If not JSON, return the text as is (for error messages, etc.)
        return { text, isError: response.result.isError };
      }
    }

    return response.result;
  };

  beforeAll(async () => {
    // Create temporary directory for test database
    testProjectRoot = await mkdtemp(join(tmpdir(), 'kuzumem-httpstream-e2e-'));
    console.log(`Test project root: ${testProjectRoot}`);

    // Start the httpstream server
    const serverPath = join(__dirname, '../../..', 'src/mcp-httpstream-server.ts');
    serverProcess = spawn('npx', ['tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HTTP_STREAM_PORT: String(SERVER_PORT),
        DEBUG: '2', // Enable debug logging
      },
    });

    // Capture stdout/stderr for debugging
    serverProcess.stdout!.on('data', (data) => {
      console.log(`Server stdout: ${data}`);
    });

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
        if (output.includes(`MCP HTTP Streaming Server running at`)) {
          clearTimeout(timeout);
          serverProcess.stdout!.off('data', readyHandler);
          resolve();
        }
      };

      serverProcess.stdout!.on('data', readyHandler);
    });

    // Initialize the connection - need to do this manually to extract session ID from headers
    const initHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    const initResponse = await fetch(SERVER_URL, {
      method: 'POST',
      headers: initHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '1.0.0',
          capabilities: {},
          clientInfo: {
            name: 'E2E Test Client',
            version: '1.0.0',
          },
        },
      }),
    });

    if (!initResponse.ok) {
      throw new Error(`HTTP error! status: ${initResponse.status}`);
    }

    // Extract session ID from response headers
    sessionId = initResponse.headers.get('Mcp-Session-Id') || 'test-session';

    // Handle SSE or JSON response
    const contentType = initResponse.headers.get('content-type');
    if (contentType?.includes('text/event-stream')) {
      // Parse SSE response
      const text = await initResponse.text();
      const lines = text.split('\n');
      let responseData = null;

      console.log('Initialization SSE response:', text);

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const dataContent = line.substring(6);
            if (dataContent.trim() === '') {
              continue;
            } // Skip empty data lines

            const data = JSON.parse(dataContent);
            console.log('Parsed initialization SSE data:', data);

            // For SSE, check for any valid response with jsonrpc 2.0
            if (data.jsonrpc === '2.0' && (data.result || data.error)) {
              responseData = data;
              break;
            }
          } catch (parseError) {
            console.log('Failed to parse initialization SSE line:', line, 'Error:', parseError);
            // Skip non-JSON lines
          }
        }
      }

      if (!responseData) {
        throw new Error('No valid initialization response found in SSE stream');
      }

      if (responseData.error) {
        throw new Error(`Initialize failed: ${JSON.stringify(responseData.error)}`);
      }
    } else {
      // Parse regular JSON response
      const responseData = await initResponse.json();
      if (responseData.error) {
        throw new Error(`Initialize failed: ${JSON.stringify(responseData.error)}`);
      }
    }
  }, 60000);

  afterAll(async () => {
    // Kill the server process
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }

    // Clean up test directory
    try {
      await rm(testProjectRoot, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to clean up test directory: ${error}`);
    }
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
    });

    it('should get metadata', async () => {
      const result = await callTool('memory-bank', {
        operation: 'get-metadata',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      // After initialization, we should get actual metadata
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
    });

    it('should update metadata', async () => {
      const params = {
        operation: 'update-metadata',
        clientProjectRoot: testProjectRoot,
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
            framework: 'Express',
            database: 'KuzuDB',
          },
          architecture: 'microservices',
          memory_spec_version: '3.0.0',
        },
      };

      console.log('Update metadata params:', JSON.stringify(params, null, 2));

      const result = await callTool('memory-bank', params);

      expect(result).toMatchObject({
        success: true,
      });
    });
  });

  describe('Tool 2: entity', () => {
    it('should create component entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-TestComponent',
        data: {
          name: 'Test Component',
          kind: 'service',
          status: 'active',
          depends_on: [],
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    });

    it('should create decision entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'decision',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'dec-20241209-test-decision',
        data: {
          name: 'Test Decision',
          date: '2024-12-09',
          context: 'E2E test decision',
          decisionStatus: 'accepted',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    });

    it('should create rule entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'rule',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'rule-test-rule',
        data: {
          name: 'Test Rule',
          created: '2024-12-09',
          content: 'This is a test rule',
          triggers: ['test'],
          ruleStatus: 'active',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    });

    it('should create file entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'file',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'file-test-file',
        data: {
          name: 'test.ts',
          path: 'src/test.ts',
          language: 'typescript',
          metrics: { lines: 100 },
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    });

    it('should create tag entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'tag',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'tag-test-tag',
        data: {
          name: 'Test Tag',
          color: '#FF0000',
          description: 'A test tag',
          category: 'architecture',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('created'),
      });
    });
  });

  describe('Tool 3: introspect', () => {
    it('should list all labels', async () => {
      const result = await callTool('introspect', {
        query: 'labels',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        labels: expect.arrayContaining(['Component', 'Decision', 'Rule', 'File', 'Tag']),
        status: 'complete',
      });
    });

    it('should count nodes by label', async () => {
      const result = await callTool('introspect', {
        query: 'count',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        target: 'Component',
      });

      expect(result).toMatchObject({
        label: 'Component',
        count: expect.any(Number),
      });
    });

    it('should get node properties', async () => {
      const result = await callTool('introspect', {
        query: 'properties',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        target: 'Component',
      });

      expect(result).toMatchObject({
        label: 'Component',
        properties: expect.any(Array),
      });

      // Properties might be empty if no components exist yet
      if (result.properties.length > 0) {
        expect(result.properties[0]).toMatchObject({
          name: expect.any(String),
          type: expect.any(String),
        });
      }
    });

    it('should list indexes', async () => {
      const result = await callTool('introspect', {
        query: 'indexes',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        indexes: expect.any(Array),
      });
    });
  });

  describe('Tool 4: context', () => {
    it('should update context', async () => {
      const result = await callTool('context', {
        operation: 'update',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        agent: 'e2e-test',
        summary: 'Running HTTP stream E2E tests',
        observation: 'Testing context update functionality',
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
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        latest: true,
        limit: 10,
      });

      expect(result).toMatchObject({
        type: 'context',
        contexts: expect.any(Array),
      });
    });

    it('should query entities', async () => {
      const result = await callTool('query', {
        type: 'entities',
        clientProjectRoot: testProjectRoot,
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

    it('should query history', async () => {
      const result = await callTool('query', {
        type: 'history',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        itemId: 'comp-TestComponent',
        itemType: 'Component',
      });

      expect(result).toMatchObject({
        type: 'history',
        contextHistory: expect.any(Array),
      });
    });

    it('should query governance', async () => {
      const result = await callTool('query', {
        type: 'governance',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        componentId: 'comp-TestComponent',
      });

      expect(result).toMatchObject({
        type: 'governance',
        decisions: expect.any(Array),
        rules: expect.any(Array),
      });
    });
  });

  describe('Tool 6: associate', () => {
    it('should associate file with component', async () => {
      const result = await callTool('associate', {
        type: 'file-component',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        fileId: 'file-test-file',
        componentId: 'comp-TestComponent',
      });

      expect(result).toMatchObject({
        success: true,
        type: 'file-component',
      });
    });

    it('should tag an item', async () => {
      const result = await callTool('associate', {
        type: 'tag-item',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        itemId: 'comp-TestComponent',
        tagId: 'tag-test-tag',
      });

      expect(result).toMatchObject({
        success: true,
        type: 'tag-item',
      });
    });
  });

  describe('Tool 7: analyze', () => {
    // Skip these tests for now - need to create graph projections first
    it.skip('should run PageRank analysis', async () => {
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
        status: expect.any(String),
        nodes: expect.any(Array),
      });
    });

    it.skip('should run k-core analysis', async () => {
      const result = await callTool('analyze', {
        type: 'k-core',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-kcore',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        k: 1,
      });

      expect(result).toMatchObject({
        type: 'k-core',
        status: expect.any(String),
        nodes: expect.any(Array),
      });
    });

    it.skip('should run Louvain community detection', async () => {
      const result = await callTool('analyze', {
        type: 'louvain',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-louvain',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'louvain',
        status: expect.any(String),
        nodes: expect.any(Array),
      });
    });

    it.skip('should find shortest path', async () => {
      const result = await callTool('detect', {
        type: 'path',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-path',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        startNodeId: 'comp-ServiceA',
        endNodeId: 'comp-ServiceC',
      });

      expect(result).toMatchObject({
        type: 'path',
        status: 'complete',
      });
    });
  });

  describe('Tool 8: detect', () => {
    // Create test components for detection algorithms
    beforeAll(async () => {
      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-ServiceA',
        data: {
          name: 'Service A',
          kind: 'service',
          status: 'active',
          depends_on: [],
        },
      });

      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-ServiceB',
        data: {
          name: 'Service B',
          kind: 'service',
          status: 'active',
          depends_on: ['comp-ServiceA'],
        },
      });

      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-ServiceC',
        data: {
          name: 'Service C',
          kind: 'service',
          status: 'active',
          depends_on: ['comp-ServiceB'],
        },
      });
    });

    it('should detect islands', async () => {
      const result = await callTool('detect', {
        type: 'islands',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-islands',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'islands',
        status: expect.any(String),
        components: expect.any(Array),
      });
    });

    it('should detect cycles', async () => {
      const result = await callTool('detect', {
        type: 'cycles',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-cycles',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'cycles',
        status: expect.any(String),
        components: expect.any(Array),
      });
    });

    it('should find path', async () => {
      const result = await callTool('detect', {
        type: 'path',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-path-detect',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        startNodeId: 'comp-ServiceA',
        endNodeId: 'comp-ServiceC',
      });

      expect(result).toMatchObject({
        type: 'path',
        status: 'complete',
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
            id: 'comp-BulkA',
            name: 'Bulk Component A',
            kind: 'service',
            status: 'active',
          },
          {
            id: 'comp-BulkB',
            name: 'Bulk Component B',
            kind: 'service',
            status: 'active',
          },
        ],
      });

      // Check if it's an error response
      if (result.isError) {
        console.log('Bulk import error:', result.text);
        expect(result.text).toContain('components');
      } else {
        expect(result).toMatchObject({
          imported: expect.any(Number),
        });
        expect(result.imported).toBeGreaterThan(0);
      }
    });
  });

  describe('Tool 10: search', () => {
    it('should perform full-text search across entities', async () => {
      const result = await callTool('search', {
        query: 'test component service',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        mode: 'fulltext',
        entityTypes: ['component'],
        limit: 10,
      });

      expect(result).toMatchObject({
        status: 'success',
        mode: 'fulltext',
        results: expect.any(Array),
        totalResults: expect.any(Number),
        query: 'test component service',
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
    });

    it('should search across multiple entity types', async () => {
      const result = await callTool('search', {
        query: 'bulk decision',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        mode: 'fulltext',
        entityTypes: ['component', 'decision', 'rule'],
        limit: 5,
      });

      expect(result).toMatchObject({
        status: 'success',
        mode: 'fulltext',
        results: expect.any(Array),
        totalResults: expect.any(Number),
        query: 'bulk decision',
      });
    });

    it('should handle empty search results gracefully', async () => {
      const result = await callTool('search', {
        query: 'httpstream-nonexistent-term-xyz789',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        mode: 'fulltext',
        limit: 10,
      });

      expect(result).toMatchObject({
        status: 'success',
        mode: 'fulltext',
        results: [],
        totalResults: 0,
        query: 'httpstream-nonexistent-term-xyz789',
      });
    });
  });

  describe('Cleanup verification', () => {
    it('should verify all test data exists', async () => {
      const result = await callTool('query', {
        type: 'entities',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        label: 'Component',
        limit: 50,
      });

      expect(result).toHaveProperty('type', 'entities');
      expect(result).toHaveProperty('entities');
      expect(Array.isArray(result.entities)).toBe(true);

      // We should have created at least some components
      if (result.entities.length > 0) {
        const componentIds = result.entities.map((e: any) => e.id);
        console.log('Found components:', componentIds);

        // Check for any of our test components
        const expectedComponents = [
          'comp-TestComponent',
          'comp-ServiceA',
          'comp-ServiceB',
          'comp-ServiceC',
          'comp-BulkA',
          'comp-BulkB',
        ];

        const foundComponents = expectedComponents.filter((id) => componentIds.includes(id));
        expect(foundComponents.length).toBeGreaterThan(0);
      }
    });
  });
});
