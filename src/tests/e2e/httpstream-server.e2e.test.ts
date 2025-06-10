import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import fetch from 'node-fetch';

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
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.id === messageId - 1) {
              if (data.error) {
                throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
              }
              return data;
            }
          } catch {
            // Skip non-JSON lines
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
      return JSON.parse(response.result.content[0].text);
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

    // Initialize the connection
    const initResponse = await sendHttpRequest('initialize', {
      protocolVersion: '1.0.0',
      capabilities: {},
      clientInfo: {
        name: 'E2E Test Client',
        version: '1.0.0',
      },
    });

    // Extract session ID if provided
    sessionId = initResponse.sessionId || 'test-session';
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
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        id: 'meta',
        project: {
          name: TEST_REPO,
          created: expect.any(String),
        },
        tech_stack: expect.any(Object),
        architecture: expect.any(String),
        memory_spec_version: '3.0.0',
      });
    });

    it('should update metadata', async () => {
      const result = await callTool('memory-bank', {
        operation: 'update-metadata',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        metadata: {
          tech_stack: {
            language: 'TypeScript',
            framework: 'Express',
            database: 'KuzuDB',
          },
          architecture: 'microservices',
        },
      });

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
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'comp-http-service',
          name: 'HTTP Service',
          kind: 'service',
          status: 'active',
          depends_on: [],
        },
      });

      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'comp-http-service',
          name: 'HTTP Service',
          kind: 'service',
          status: 'active',
        },
      });
    });

    it('should create decision entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'decision',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'dec-20241210-http-arch',
          name: 'Use HTTP Architecture',
          date: '2024-12-10',
          context: 'HTTP E2E testing decision',
        },
      });

      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'dec-20241210-http-arch',
          name: 'Use HTTP Architecture',
        },
      });
    });

    it('should create rule entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'rule',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'rule-http-pattern',
          name: 'Follow HTTP Pattern',
          created: '2024-12-10',
          content: 'All HTTP endpoints must follow REST principles',
          triggers: ['http', 'rest'],
        },
      });

      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'rule-http-pattern',
          name: 'Follow HTTP Pattern',
        },
      });
    });

    it('should create file entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'file',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'file-http-service-ts',
          name: 'http-service.ts',
          path: 'src/services/http-service.ts',
          language: 'typescript',
          size_bytes: 2048,
        },
      });

      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'file-http-service-ts',
          name: 'http-service.ts',
        },
      });
    });

    it('should create tag entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'tag',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'tag-important',
          name: 'Important',
          color: '#00ff00',
          description: 'Important components',
        },
      });

      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'tag-important',
          name: 'Important',
        },
      });
    });
  });

  describe('Tool 3: introspect', () => {
    it('should list all labels', async () => {
      const result = await callTool('introspect', {
        query: 'labels',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        labels: expect.arrayContaining(['Component', 'Decision', 'Rule', 'File', 'Tag']),
      });
    });

    it('should count nodes by label', async () => {
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
      expect(result.count).toBeGreaterThan(0);
    });

    it('should get node properties', async () => {
      const result = await callTool('introspect', {
        query: 'properties',
        target: 'Component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        label: 'Component',
        properties: expect.arrayContaining([
          expect.objectContaining({
            name: 'id',
            type: expect.any(String),
          }),
          expect.objectContaining({
            name: 'name',
            type: expect.any(String),
          }),
        ]),
      });
    });

    it('should list indexes', async () => {
      const result = await callTool('introspect', {
        query: 'indexes',
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
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        summary: 'HTTP E2E test context',
        observation: 'Testing all unified tools via HTTP',
        decision: 'dec-20241210-http-arch',
      });

      expect(result).toMatchObject({
        context: {
          summary: 'HTTP E2E test context',
          observation: expect.stringContaining('Testing all unified tools via HTTP'),
        },
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
        contexts: expect.arrayContaining([
          expect.objectContaining({
            summary: expect.any(String),
          }),
        ]),
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
        entities: expect.arrayContaining([
          expect.objectContaining({
            id: 'comp-http-service',
          }),
        ]),
      });
    });

    it('should query history', async () => {
      const result = await callTool('query', {
        type: 'history',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        itemId: 'comp-http-service',
        itemType: 'Component',
      });

      expect(result).toMatchObject({
        history: expect.any(Array),
      });
    });

    it('should query governance', async () => {
      const result = await callTool('query', {
        type: 'governance',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        componentId: 'comp-http-service',
      });

      expect(result).toMatchObject({
        status: expect.any(String),
        decisions: expect.any(Array),
        rules: expect.any(Array),
      });
    });
  });

  describe('Tool 6: associate', () => {
    it('should associate file with component', async () => {
      const result = await callTool('associate', {
        relationship: 'file-component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        source: {
          id: 'file-http-service-ts',
          type: 'file',
        },
        target: {
          id: 'comp-http-service',
          type: 'component',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Associated'),
      });
    });

    it('should tag an item', async () => {
      const result = await callTool('associate', {
        relationship: 'tag-item',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        source: {
          id: 'comp-http-service',
          type: 'Component',
        },
        target: {
          id: 'tag-important',
          type: 'tag',
        },
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Tagged'),
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
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'comp-http-gateway',
          name: 'HTTP Gateway',
          kind: 'service',
          depends_on: ['comp-http-service'],
        },
      });

      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'comp-http-database',
          name: 'HTTP Database',
          kind: 'datastore',
          depends_on: [],
        },
      });

      // Update http-service to depend on database
      await callTool('entity', {
        operation: 'update',
        entityType: 'component',
        id: 'comp-http-service',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          depends_on: ['comp-http-database'],
        },
      });
    });

    it('should run PageRank analysis', async () => {
      const result = await callTool('analyze', {
        algorithm: 'pagerank',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'http-pagerank',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        parameters: {
          dampingFactor: 0.85,
          maxIterations: 20,
        },
      });

      expect(result).toMatchObject({
        type: 'pagerank',
        status: 'complete',
        nodes: expect.any(Array),
      });
    });

    it('should run k-core analysis', async () => {
      const result = await callTool('analyze', {
        algorithm: 'k-core',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'http-kcore',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        parameters: {
          k: 1,
        },
      });

      expect(result).toMatchObject({
        type: 'k-core',
        status: 'complete',
        components: expect.any(Array),
      });
    });

    it('should run Louvain community detection', async () => {
      const result = await callTool('analyze', {
        algorithm: 'louvain',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'http-louvain',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'louvain',
        status: 'complete',
        communities: expect.any(Array),
      });
    });

    it('should find shortest path', async () => {
      const result = await callTool('analyze', {
        algorithm: 'shortest-path',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'http-shortest',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        parameters: {
          startNodeId: 'comp-http-gateway',
          endNodeId: 'comp-http-database',
        },
      });

      expect(result).toMatchObject({
        type: 'shortest-path',
        status: 'complete',
        pathFound: true,
      });
    });
  });

  describe('Tool 8: detect', () => {
    it('should detect islands', async () => {
      const result = await callTool('detect', {
        pattern: 'islands',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'http-islands',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'weakly-connected',
        status: 'complete',
        components: expect.any(Array),
      });
    });

    it('should detect cycles', async () => {
      const result = await callTool('detect', {
        pattern: 'cycles',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'http-cycles',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
      });

      expect(result).toMatchObject({
        type: 'strongly-connected',
        status: 'complete',
        components: expect.any(Array),
      });
    });

    it('should find path', async () => {
      const result = await callTool('detect', {
        pattern: 'path',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'http-path',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        parameters: {
          startNodeId: 'comp-http-gateway',
          endNodeId: 'comp-http-database',
        },
      });

      expect(result).toMatchObject({
        type: 'shortest-path',
        status: 'complete',
      });
    });
  });

  describe('Tool 9: bulk-import', () => {
    it('should bulk import entities', async () => {
      const result = await callTool('bulk-import', {
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        entities: [
          {
            type: 'component',
            id: 'comp-http-bulk-1',
            data: {
              name: 'HTTP Bulk Component 1',
              kind: 'service',
            },
          },
          {
            type: 'component',
            id: 'comp-http-bulk-2',
            data: {
              name: 'HTTP Bulk Component 2',
              kind: 'service',
              depends_on: ['comp-http-bulk-1'],
            },
          },
          {
            type: 'decision',
            id: 'dec-20241210-bulk',
            data: {
              name: 'Bulk Import Decision',
              date: '2024-12-10',
              context: 'Testing bulk import',
            },
          },
        ],
      });

      expect(result).toMatchObject({
        success: true,
        imported: {
          entities: 3,
          relationships: 0,
        },
      });
    });
  });

  describe('Cleanup verification', () => {
    it('should verify all test data exists', async () => {
      // Query all components to ensure our test data is present
      const result = await callTool('query', {
        type: 'entities',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        label: 'Component',
        limit: 50,
      });

      expect(result.entities.length).toBeGreaterThan(5); // At least our test components

      const componentIds = result.entities.map((e: any) => e.id);
      expect(componentIds).toContain('comp-http-service');
      expect(componentIds).toContain('comp-http-gateway');
      expect(componentIds).toContain('comp-http-database');
      expect(componentIds).toContain('comp-http-bulk-1');
      expect(componentIds).toContain('comp-http-bulk-2');
    });
  });
});