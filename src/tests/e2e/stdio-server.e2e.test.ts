import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';

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
  
  // Helper to send JSON-RPC message to server
  const sendMessage = (message: RpcMessage): Promise<RpcMessage> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server response timeout'));
      }, 10000);
      
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
  const callTool = async (toolName: string, params: any): Promise<any> => {
    const message: RpcMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };
    
    const response = await sendMessage(message);
    
    if (response.result?.content?.[0]?.text) {
      return JSON.parse(response.result.content[0].text);
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
    
    // Initialize the connection
    await sendMessage({
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
    });
  }, 60000);

  afterAll(async () => {
    // Kill the server process
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
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
        branch: TEST_BRANCH
      });
      
      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Memory bank initialized')
      });
    });
    
    it('should get metadata', async () => {
      const result = await callTool('memory-bank', {
        operation: 'get-metadata',
        repository: TEST_REPO,
        branch: TEST_BRANCH
      });
      
      expect(result).toMatchObject({
        id: 'meta',
        project: {
          name: TEST_REPO,
          created: expect.any(String)
        },
        tech_stack: expect.any(Object),
        architecture: expect.any(String),
        memory_spec_version: '3.0.0'
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
            framework: 'Node.js',
            database: 'KuzuDB'
          },
          architecture: 'microservices'
        }
      });
      
      expect(result).toMatchObject({
        success: true
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
          id: 'comp-test-service',
          name: 'Test Service',
          kind: 'service',
          status: 'active',
          depends_on: []
        }
      });
      
      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'comp-test-service',
          name: 'Test Service',
          kind: 'service',
          status: 'active'
        }
      });
    });
    
    it('should create decision entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'decision',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'dec-20241210-test-arch',
          name: 'Use Test Architecture',
          date: '2024-12-10',
          context: 'E2E testing decision'
        }
      });
      
      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'dec-20241210-test-arch',
          name: 'Use Test Architecture'
        }
      });
    });
    
    it('should create rule entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'rule',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'rule-test-pattern',
          name: 'Follow Test Pattern',
          created: '2024-12-10',
          content: 'All tests must follow AAA pattern',
          triggers: ['test', 'spec']
        }
      });
      
      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'rule-test-pattern',
          name: 'Follow Test Pattern'
        }
      });
    });
    
    it('should create file entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'file',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'file-test-service-ts',
          name: 'test-service.ts',
          path: 'src/services/test-service.ts',
          language: 'typescript',
          size_bytes: 1024
        }
      });
      
      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'file-test-service-ts',
          name: 'test-service.ts'
        }
      });
    });
    
    it('should create tag entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'tag',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'tag-critical',
          name: 'Critical',
          color: '#ff0000',
          description: 'Critical components'
        }
      });
      
      expect(result).toMatchObject({
        success: true,
        entity: {
          id: 'tag-critical',
          name: 'Critical'
        }
      });
    });
  });

  describe('Tool 3: introspect', () => {
    it('should list all labels', async () => {
      const result = await callTool('introspect', {
        query: 'labels',
        repository: TEST_REPO,
        branch: TEST_BRANCH
      });
      
      expect(result).toMatchObject({
        labels: expect.arrayContaining([
          'Component',
          'Decision',
          'Rule',
          'File',
          'Tag'
        ])
      });
    });
    
    it('should count nodes by label', async () => {
      const result = await callTool('introspect', {
        query: 'count',
        target: 'Component',
        repository: TEST_REPO,
        branch: TEST_BRANCH
      });
      
      expect(result).toMatchObject({
        count: expect.any(Number),
        label: 'Component'
      });
      expect(result.count).toBeGreaterThan(0);
    });
    
    it('should get node properties', async () => {
      const result = await callTool('introspect', {
        query: 'properties',
        target: 'Component',
        repository: TEST_REPO,
        branch: TEST_BRANCH
      });
      
      expect(result).toMatchObject({
        label: 'Component',
        properties: expect.arrayContaining([
          expect.objectContaining({
            name: 'id',
            type: expect.any(String)
          }),
          expect.objectContaining({
            name: 'name',
            type: expect.any(String)
          })
        ])
      });
    });
  });

  describe('Tool 4: context', () => {
    it('should update context', async () => {
      const result = await callTool('context', {
        operation: 'update',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        summary: 'E2E test context',
        observation: 'Testing all unified tools',
        decision: 'dec-20241210-test-arch'
      });
      
      expect(result).toMatchObject({
        context: {
          summary: 'E2E test context',
          observation: expect.stringContaining('Testing all unified tools')
        }
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
        limit: 5
      });
      
      expect(result).toMatchObject({
        contexts: expect.arrayContaining([
          expect.objectContaining({
            summary: expect.any(String)
          })
        ])
      });
    });
    
    it('should query entities', async () => {
      const result = await callTool('query', {
        type: 'entities',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        label: 'Component',
        limit: 10
      });
      
      expect(result).toMatchObject({
        entities: expect.arrayContaining([
          expect.objectContaining({
            id: 'comp-test-service'
          })
        ])
      });
    });
    
    it('should query dependencies', async () => {
      const result = await callTool('query', {
        type: 'dependencies',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        componentId: 'comp-test-service',
        direction: 'outgoing'
      });
      
      expect(result).toMatchObject({
        dependencies: expect.any(Array)
      });
    });
    
    it('should query tags', async () => {
      const result = await callTool('query', {
        type: 'tags',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        tagId: 'tag-critical'
      });
      
      expect(result).toMatchObject({
        items: expect.any(Array)
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
          id: 'file-test-service-ts',
          type: 'file'
        },
        target: {
          id: 'comp-test-service',
          type: 'component'
        }
      });
      
      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Associated')
      });
    });
    
    it('should tag an item', async () => {
      const result = await callTool('associate', {
        relationship: 'tag-item',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        source: {
          id: 'comp-test-service',
          type: 'Component'
        },
        target: {
          id: 'tag-critical',
          type: 'tag'
        }
      });
      
      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Tagged')
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
          id: 'comp-api-gateway',
          name: 'API Gateway',
          kind: 'service',
          depends_on: ['comp-test-service']
        }
      });
      
      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        data: {
          id: 'comp-database',
          name: 'Database',
          kind: 'datastore',
          depends_on: []
        }
      });
    });
    
    it('should run PageRank analysis', async () => {
      const result = await callTool('analyze', {
        algorithm: 'pagerank',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-pagerank',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON']
      });
      
      expect(result).toMatchObject({
        type: 'pagerank',
        status: 'complete',
        nodes: expect.any(Array)
      });
    });
    
    it('should find shortest path', async () => {
      const result = await callTool('analyze', {
        algorithm: 'shortest-path',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-shortest',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON'],
        parameters: {
          startNodeId: 'comp-api-gateway',
          endNodeId: 'comp-database'
        }
      });
      
      expect(result).toMatchObject({
        type: 'shortest-path',
        status: 'complete'
      });
    });
  });

  describe('Tool 8: detect', () => {
    it('should detect islands', async () => {
      const result = await callTool('detect', {
        pattern: 'islands',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-islands',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON']
      });
      
      expect(result).toMatchObject({
        type: 'weakly-connected',
        status: 'complete',
        components: expect.any(Array)
      });
    });
    
    it('should detect cycles', async () => {
      const result = await callTool('detect', {
        pattern: 'cycles',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        projectedGraphName: 'test-cycles',
        nodeTableNames: ['Component'],
        relationshipTableNames: ['DEPENDS_ON']
      });
      
      expect(result).toMatchObject({
        type: 'strongly-connected',
        status: 'complete',
        components: expect.any(Array)
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
            id: 'comp-bulk-1',
            data: {
              name: 'Bulk Component 1',
              kind: 'service'
            }
          },
          {
            type: 'component',
            id: 'comp-bulk-2',
            data: {
              name: 'Bulk Component 2',
              kind: 'service',
              depends_on: ['comp-bulk-1']
            }
          }
        ]
      });
      
      expect(result).toMatchObject({
        success: true,
        imported: {
          entities: 2,
          relationships: 0
        }
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
        limit: 50
      });
      
      expect(result.entities.length).toBeGreaterThan(4); // At least our test components
      
      const componentIds = result.entities.map((e: any) => e.id);
      expect(componentIds).toContain('comp-test-service');
      expect(componentIds).toContain('comp-api-gateway');
      expect(componentIds).toContain('comp-database');
    });
  });
});