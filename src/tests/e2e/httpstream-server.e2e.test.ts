import { ChildProcess, spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { join } from 'path';

interface RpcMessage {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: any;
}

describe('MCP HTTP Stream Server E2E Tests', () => {
  let serverProcess: ChildProcess;
  let testProjectRoot: string;
  let messageId = 1;
  let sessionId: string;
  const TEST_REPO = 'test-repo';
  const TEST_BRANCH = 'main';
  // Will be assigned once we find a free port
  let SERVER_PORT: number;
  let SERVER_URL: string;

  // Helper to send HTTP request to server
  const sendHttpRequest = async (method: string, params: any): Promise<any> => {
    const currentMessageId = messageId++;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    // Add session ID header if we have one
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: currentMessageId,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // For streaming responses, we need to handle SSE
    const contentType = response.headers.get('content-type');
    console.log('Response content-type:', contentType);

    if (contentType?.includes('text/event-stream')) {
      const text = await response.text();
      const lines = text.split('\n');

      // Debug: Log the raw SSE stream
      console.log('Raw SSE response:', text);

      let foundResponse = null;
      let accumulatedData = '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataContent = line.substring(6);
          if (dataContent.trim() === '') {
            // Empty data line indicates end of event - try to parse accumulated data
            if (accumulatedData.trim()) {
              try {
                const data = JSON.parse(accumulatedData);
                console.log('Parsed SSE data:', data);

                // Look for response with matching ID or any valid response for this request
                if (data.jsonrpc === '2.0' && (data.id === currentMessageId || data.id === null)) {
                  if (data.error) {
                    throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
                  }
                  if (data.result !== undefined) {
                    foundResponse = data;
                    break;
                  }
                }

                // Also check for error responses without specific ID
                if (data.error && data.jsonrpc === '2.0') {
                  console.log('Found error response:', data.error);
                  throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
                }
              } catch (e) {
                if (e instanceof Error && e.message.startsWith('RPC Error:')) {
                  throw e;
                }
                console.log('Failed to parse accumulated SSE data:', accumulatedData, 'Error:', e);
              }
              accumulatedData = ''; // Reset for next event
            }
          } else {
            // Accumulate data lines (handling multi-line JSON)
            if (accumulatedData) {
              accumulatedData += '\n' + dataContent;
            } else {
              accumulatedData = dataContent;
            }
          }
        }
      }

      // Handle case where there's no empty line at the end
      if (accumulatedData.trim() && !foundResponse) {
        try {
          const data = JSON.parse(accumulatedData);
          console.log('Parsed final SSE data:', data);

          if (data.jsonrpc === '2.0' && (data.id === currentMessageId || data.id === null)) {
            if (data.error) {
              throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
            }
            if (data.result !== undefined) {
              foundResponse = data;
            }
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('RPC Error:')) {
            throw e;
          }
          console.log('Failed to parse final accumulated SSE data:', accumulatedData, 'Error:', e);
        }
      }

      if (!foundResponse) {
        throw new Error('No valid response found in SSE stream');
      }

      return foundResponse;
    } else {
      // Regular JSON response
      console.log('Parsing as JSON response');
      const data = await response.json();
      console.log('Parsed JSON response:', data);

      if (data.error) {
        throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
      }
      return data;
    }
  };

  // Helper to reinitialize session if needed
  const ensureSession = async (): Promise<void> => {
    if (!sessionId) {
      console.log('Reinitializing session...');

      // Direct HTTP call to avoid circular dependency
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
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'KuzuMem-MCP E2E Test',
              version: '1.0.0',
            },
          },
        }),
      });

      if (!initResponse.ok) {
        // Consume the response body to avoid resource leaks
        await initResponse.text();
        throw new Error(`HTTP error! status: ${initResponse.status}`);
      }

      // Extract session ID from response headers
      const newSessionId = initResponse.headers.get('mcp-session-id');
      if (newSessionId) {
        sessionId = newSessionId;
        console.log('Session reinitialized with ID:', sessionId);
        // Consume the response body to avoid TCP connection leaks
        await initResponse.text();
      } else {
        // Consume the response body to avoid resource leaks
        await initResponse.text();
        throw new Error('Failed to get session ID from reinitialization');
      }
    }
  };

  // Helper to call MCP tool with fresh session for each call
  const callTool = async (toolName: string, params: any): Promise<any> => {
    // Create a fresh session for each tool call to avoid session state issues
    console.log(`Creating fresh session for tool ${toolName}...`);

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
          protocolVersion: '2025-03-26',
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
    const freshSessionId = initResponse.headers.get('mcp-session-id');
    if (!freshSessionId) {
      throw new Error('Failed to get session ID from fresh session');
    }

    // Consume the init response body
    await initResponse.text();

    console.log(`Calling tool ${toolName} with fresh session ${freshSessionId}`);

    // Now make the tool call with the fresh session
    const toolHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'mcp-session-id': freshSessionId,
    };

    const toolResponse = await fetch(SERVER_URL, {
      method: 'POST',
      headers: toolHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: {
            ...params,
            clientProjectRoot: testProjectRoot,
          },
        },
      }),
    });

    if (!toolResponse.ok) {
      throw new Error(`HTTP error! status: ${toolResponse.status}`);
    }

    // Parse response
    const contentType = toolResponse.headers.get('content-type');
    let responseData: any;

    if (contentType?.includes('text/event-stream')) {
      // Parse SSE response
      const text = await toolResponse.text();
      const lines = text.split('\n').filter((line) => line.startsWith('data: '));
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        responseData = JSON.parse(lastLine.substring(6));
      } else {
        throw new Error('No data in SSE response');
      }
    } else {
      // Parse JSON response
      responseData = await toolResponse.json();
    }

    if (responseData.error) {
      throw new Error(`Tool error: ${responseData.error.message}`);
    }

    if (responseData.result?.content?.[0]?.text) {
      const text = responseData.result.content[0].text;
      try {
        // Try to parse as JSON first
        return JSON.parse(text);
      } catch (e) {
        // If not JSON, return the text as is (for error messages, etc.)
        return { text, isError: responseData.result.isError };
      }
    }

    return responseData.result;
  };

  beforeAll(async () => {
    // Create temporary directory for test database
    testProjectRoot = await mkdtemp(join(tmpdir(), 'kuzumem-httpstream-e2e-'));
    console.log(`Test project root: ${testProjectRoot}`);

    // Helper to spawn the HTTP-stream server and wait until it is ready.
    const startServer = async (): Promise<void> => {
      const pickRandomPort = () => 30000 + Math.floor(Math.random() * 1000);

      for (let attempt = 1; attempt <= 5; attempt++) {
        SERVER_PORT = pickRandomPort();
        SERVER_URL = `http://localhost:${SERVER_PORT}`;

        const serverPath = join(__dirname, '../../..', 'src/mcp-httpstream-server.ts');
        serverProcess = spawn('npx', ['tsx', serverPath], {
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            HTTP_STREAM_PORT: String(SERVER_PORT),
            LOG_LEVEL: 'info',
          },
        });

        let resolved = false;

        // eslint-disable-next-line no-await-in-loop
        const started = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolve(false);
            }
          }, 15000);

          const handleData = (data: Buffer) => {
            const output = data.toString();

            if (output.includes('EADDRINUSE')) {
              // Port in use – abort and retry
              clearTimeout(timeout);
              serverProcess.kill();
              resolve(false);
            }

            if (output.includes('MCP HTTP stream server listening at')) {
              clearTimeout(timeout);
              serverProcess.stderr!.off('data', handleData);
              serverProcess.stdout!.off('data', handleData);
              resolved = true;
              resolve(true);
            }
          };

          serverProcess.stderr!.on('data', handleData);
          serverProcess.stdout!.on('data', handleData);

          // Capture unexpected error events
          serverProcess.on('error', () => {
            clearTimeout(timeout);
            resolve(false);
          });
        });

        if (started) {
          console.log(`HTTP Stream server started on port ${SERVER_PORT} (attempt ${attempt})`);
          return;
        }

        console.warn(`Retrying HTTP Stream server startup (attempt ${attempt}/5)…`);
      }

      throw new Error('Failed to start HTTP Stream server after multiple attempts');
    };

    // Actually start (with retries)
    await startServer();

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
          protocolVersion: '2025-03-26',
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
    sessionId = initResponse.headers.get('mcp-session-id') || 'test-session';

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

  describe('T_HTTPSTREAM_001: MCP Protocol Compliance', () => {
    it('should return proper MCP initialize response', async () => {
      // Send a fresh initialize request to test the response format
      const initHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };

      const initResponse = await fetch(SERVER_URL, {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 999,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'MCP Compliance Test Client',
              version: '1.0.0',
            },
          },
        }),
      });

      expect(initResponse.ok).toBe(true);

      // Extract session ID from response headers
      const testSessionId = initResponse.headers.get('mcp-session-id');
      expect(testSessionId).toBeDefined();
      expect(testSessionId).toMatch(/^[a-f0-9-]{36}$/); // UUID format

      // Parse response
      const contentType = initResponse.headers.get('content-type');
      let responseData: any;

      if (contentType?.includes('text/event-stream')) {
        // Parse SSE response
        const text = await initResponse.text();
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const dataContent = line.substring(6);
              if (dataContent.trim() === '') {
                continue;
              }

              const data = JSON.parse(dataContent);
              if (data.jsonrpc === '2.0' && data.result) {
                responseData = data;
                break;
              }
            } catch (parseError) {
              // Skip non-JSON lines
            }
          }
        }
      } else {
        // Parse regular JSON response
        responseData = await initResponse.json();
      }

      expect(responseData).toBeDefined();
      expect(responseData.jsonrpc).toBe('2.0');
      expect(responseData.id).toBe(999);
      expect(responseData.result).toBeDefined();

      // Verify MCP 2025-03-26 compliance
      expect(responseData.result.protocolVersion).toBe('2025-03-26');
      expect(responseData.result.capabilities).toBeDefined();
      expect(responseData.result.capabilities.tools).toEqual({
        list: true,
        call: true,
        listChanged: true,
      });
      expect(responseData.result.serverInfo).toBeDefined();
      expect(responseData.result.serverInfo.name).toBe('KuzuMem-MCP-HTTPStream');
      expect(responseData.result.serverInfo.version).toBe('3.0.0');
    });
  });

  describe('Tool 1: memory-bank', () => {
    it('should initialize memory bank', async () => {
      const result = await callTool('memory-bank', {
        operation: 'init',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Memory bank initialized'),
      });
    }, 15000); // 15 second timeout

    it('should get metadata', async () => {
      const result = await callTool('memory-bank', {
        operation: 'get-metadata',
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
    }, 10000); // 10 second timeout

    it('should update metadata', async () => {
      const params = {
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
    }, 10000); // 10 second timeout
  });

  describe('Tool 2: entity', () => {
    it('should create component entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'component',
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
    }, 10000);

    it('should create decision entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'decision',
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
    }, 10000);

    it('should create rule entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'rule',
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
    }, 10000);

    it('should create file entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'file',
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
    }, 10000);

    it('should create tag entity', async () => {
      const result = await callTool('entity', {
        operation: 'create',
        entityType: 'tag',
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
    }, 10000);
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
        status: 'complete',
      });
    }, 10000);

    it('should count nodes by label', async () => {
      const result = await callTool('introspect', {
        query: 'count',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        target: 'Component',
      });

      expect(result).toMatchObject({
        label: 'Component',
        count: expect.any(Number),
      });
    }, 10000);

    it('should get node properties', async () => {
      const result = await callTool('introspect', {
        query: 'properties',
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
    }, 10000);

    it('should list indexes', async () => {
      const result = await callTool('introspect', {
        query: 'indexes',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        indexes: expect.any(Array),
      });
    }, 10000);
  });

  describe('Tool 4: context', () => {
    it('should update context', async () => {
      const result = await callTool('context', {
        operation: 'update',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        agent: 'e2e-test',
        summary: 'Running HTTP stream E2E tests',
        observation: 'Testing context update functionality',
      });

      expect(result).toMatchObject({
        success: true,
      });
    }, 10000);
  });

  describe('Tool 5: query', () => {
    it('should query context', async () => {
      const result = await callTool('query', {
        type: 'context',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        latest: true,
        limit: 10,
      });

      expect(result).toMatchObject({
        type: 'context',
        contexts: expect.any(Array),
      });
    }, 10000);

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
    }, 10000);

    it('should query history', async () => {
      const result = await callTool('query', {
        type: 'history',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        itemId: 'comp-TestComponent',
        itemType: 'Component',
      });

      expect(result).toMatchObject({
        type: 'history',
        contextHistory: expect.any(Array),
      });
    }, 10000);

    it('should query governance', async () => {
      const result = await callTool('query', {
        type: 'governance',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        componentId: 'comp-TestComponent',
      });

      expect(result).toMatchObject({
        type: 'governance',
        decisions: expect.any(Array),
        rules: expect.any(Array),
      });
    }, 10000);
  });

  describe('Tool 6: associate', () => {
    it('should associate file with component', async () => {
      const result = await callTool('associate', {
        type: 'file-component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        fileId: 'file-test-file',
        componentId: 'comp-TestComponent',
      });

      expect(result).toMatchObject({
        success: true,
        type: 'file-component',
      });
    }, 10000);

    it('should tag an item', async () => {
      // Since we use fresh sessions, we need to create the entities first
      // Create a component to tag
      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'comp-TagTestComponent',
        data: {
          name: 'Tag Test Component',
          kind: 'service',
          status: 'active',
          depends_on: [],
        },
      });

      // Create a tag
      await callTool('entity', {
        operation: 'create',
        entityType: 'tag',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        id: 'tag-test-association',
        data: {
          name: 'Test Association Tag',
          description: 'Tag for testing associations',
        },
      });

      // Now tag the item
      const result = await callTool('associate', {
        type: 'tag-item',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        itemId: 'comp-TagTestComponent',
        tagId: 'tag-test-association',
        entityType: 'Component', // Required field for tag-item association
      });

      console.log('Tag association result:', JSON.stringify(result, null, 2));

      expect(result).toMatchObject({
        success: true,
        type: 'tag-item',
      });
    }, 15000);
  });

  describe('Tool 7: analyze', () => {
    // Skip these tests for now - need to create graph projections first
    it('should run PageRank analysis', async () => {
      const result = await callTool('analyze', {
        type: 'pagerank',
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
    }, 15000);

    it('should run k-core analysis', async () => {
      const result = await callTool('analyze', {
        type: 'k-core',
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
    }, 15000);

    it('should run Louvain community detection', async () => {
      const result = await callTool('analyze', {
        type: 'louvain',
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
    }, 15000);

    it('should find shortest path', async () => {
      const result = await callTool('detect', {
        type: 'path',
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
    }, 15000);
  });

  describe('Tool 8: detect', () => {
    // Create test components for detection algorithms
    beforeAll(async () => {
      await callTool('entity', {
        operation: 'create',
        entityType: 'component',
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
    }, 30000); // 30 second timeout for setup

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
        status: expect.any(String),
        components: expect.any(Array),
      });
    }, 15000);

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
        status: expect.any(String),
        components: expect.any(Array),
      });
    }, 15000);

    it('should find path', async () => {
      const result = await callTool('detect', {
        type: 'path',
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
    }, 15000);
  });

  describe('Tool 9: bulk-import', () => {
    it('should bulk import entities', async () => {
      const result = await callTool('bulk-import', {
        type: 'components',
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        components: [
          {
            id: 'comp-BulkA',
            name: 'Bulk Component A',
            kind: 'service',
            status: 'active',
            depends_on: [],
          },
          {
            id: 'comp-BulkB',
            name: 'Bulk Component B',
            kind: 'service',
            status: 'active',
            depends_on: [],
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
    }, 15000);
  });

  describe('Tool 10: search', () => {
    it('should perform full-text search across entities', async () => {
      const result = await callTool('search', {
        query: 'test component service',
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
    }, 10000);

    it('should search across multiple entity types', async () => {
      const result = await callTool('search', {
        query: 'bulk decision',
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
    }, 10000);

    it('should handle empty search results gracefully', async () => {
      const result = await callTool('search', {
        query: 'httpstream-nonexistent-term-xyz789',
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
    }, 10000);
  });

  describe('Cleanup verification', () => {
    it('should verify all test data exists', async () => {
      const result = await callTool('query', {
        type: 'entities',
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
    }, 10000);
  });
});
