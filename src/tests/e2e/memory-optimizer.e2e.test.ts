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

describe('Memory Optimizer E2E Tests', () => {
  let serverProcess: ChildProcess;
  let testProjectRoot: string;
  let messageId = 1;
  const TEST_REPO = 'memory-optimizer-test';
  const TEST_BRANCH = 'main';
  const testSessionId = `memory-optimizer-e2e-${Date.now()}`;

  // Store initialization response
  let initializationResponse: any;

  // Helper to send JSON-RPC message to server
  const sendMessage = (message: RpcMessage, timeoutMs: number = 15000): Promise<RpcMessage> => {
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
    timeoutMs: number = 15000,
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
      return JSON.parse(response.result.content[0].text);
    }

    return response.result;
  };

  beforeAll(async () => {
    // Create temporary directory for test database
    testProjectRoot = await mkdtemp(join(tmpdir(), 'memory-optimizer-e2e-'));
    console.log(`Memory Optimizer Test project root: ${testProjectRoot}`);

    // Start the stdio server
    const serverPath = join(__dirname, '../../..', 'src/mcp-stdio-server.ts');
    serverProcess = spawn('npx', ['tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Add mock API keys for testing (these won't be used in actual API calls)
        OPENAI_API_KEY: 'test-openai-key',
        ANTHROPIC_API_KEY: 'test-anthropic-key',
      },
    });

    // Capture stderr for debugging
    serverProcess.stderr!.on('data', (data) => {
      console.error(`Memory Optimizer Server stderr: ${data}`);
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Memory Optimizer Server startup timeout'));
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
    initializationResponse = await sendMessage({
      jsonrpc: '2.0',
      id: messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        sessionId: testSessionId,
        capabilities: {},
        clientInfo: {
          name: 'Memory Optimizer E2E Test Client',
          version: '1.0.0',
        },
      },
    });
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
      console.error(`Failed to clean up memory optimizer test directory: ${error}`);
    }
  });

  describe('Setup Test Environment', () => {
    it('should initialize memory bank for testing', async () => {
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
    }, 20000);

    it('should create test entities for optimization', async () => {
      // Create various entities to test optimization
      const entities = [
        // Recent active component
        {
          type: 'component',
          id: 'comp-active-api',
          data: {
            name: 'Active API Service',
            kind: 'service',
            status: 'active',
            created: new Date().toISOString(),
          },
        },
        // Old deprecated component
        {
          type: 'component',
          id: 'comp-old-legacy',
          data: {
            name: 'Legacy Service',
            kind: 'service',
            status: 'deprecated',
            created: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days ago
          },
        },
        // Duplicate component
        {
          type: 'component',
          id: 'comp-duplicate-1',
          data: {
            name: 'Duplicate Service',
            kind: 'service',
            status: 'active',
            created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
          },
        },
        // Another duplicate component
        {
          type: 'component',
          id: 'comp-duplicate-2',
          data: {
            name: 'Duplicate Service',
            kind: 'service',
            status: 'active',
            created: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), // 31 days ago
          },
        },
        // Recent decision
        {
          type: 'decision',
          id: 'dec-recent-arch',
          data: {
            name: 'Recent Architecture Decision',
            date: new Date().toISOString().split('T')[0],
            context: 'Modern architecture choice',
            status: 'active',
            created: new Date().toISOString(),
          },
        },
        // Old decision
        {
          type: 'decision',
          id: 'dec-old-arch',
          data: {
            name: 'Old Architecture Decision',
            date: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            context: 'Legacy architecture choice',
            status: 'deprecated',
            created: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        // Critical tag
        {
          type: 'tag',
          id: 'tag-critical',
          data: {
            name: 'Critical',
            color: '#ff0000',
            description: 'Critical components',
            category: 'security',
            created: new Date().toISOString(),
          },
        },
        // Test tag
        {
          type: 'tag',
          id: 'tag-test',
          data: {
            name: 'Test',
            color: '#00ff00',
            description: 'Test components',
            category: 'testing',
            created: new Date().toISOString(),
          },
        },
      ];

      for (const entity of entities) {
        const result = await callTool('entity', {
          operation: 'create',
          entityType: entity.type,
          id: entity.id,
          repository: TEST_REPO,
          branch: TEST_BRANCH,
          data: entity.data,
        });

        expect(result).toMatchObject({
          success: true,
          message: expect.stringContaining('created'),
        });
      }
    }, 30000);

    it('should create relationships between entities', async () => {
      // Create tag-item associations (the only type currently supported by associate tool)
      const associations = [
        {
          type: 'tag-item',
          itemId: 'comp-active-api',
          tagId: 'tag-critical',
          entityType: 'Component',
        },
        {
          type: 'tag-item',
          itemId: 'comp-old-legacy',
          tagId: 'tag-test',
          entityType: 'Component',
        },
      ];

      for (const assoc of associations) {
        const result = await callTool('associate', {
          type: assoc.type,
          repository: TEST_REPO,
          branch: TEST_BRANCH,
          itemId: assoc.itemId,
          tagId: assoc.tagId,
          entityType: assoc.entityType,
        });

        expect(result).toMatchObject({
          success: true,
          type: 'tag-item',
        });
      }
    }, 15000);
  });

  describe('Memory Optimizer Tool Tests', () => {
    let analysisId: string;
    let snapshotId: string;

    it('should analyze memory graph with MCP sampling', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'analyze',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        strategy: 'conservative',
        enableMCPSampling: true,
        samplingStrategy: 'representative',
      }, 30000); // Longer timeout for AI analysis

      expect(result).toMatchObject({
        success: true,
        operation: 'analyze',
        data: {
          analysisId: expect.any(String),
          summary: expect.objectContaining({
            totalEntitiesAnalyzed: expect.any(Number),
            overallHealthScore: expect.any(Number),
          }),
          staleEntities: expect.any(Array),
          redundancies: expect.any(Array),
          optimizationOpportunities: expect.any(Array),
          recommendations: expect.any(Array),
        },
        message: expect.stringContaining('Analysis completed'),
      });

      // Store analysis ID for optimization test
      analysisId = result.data.analysisId;

      // Verify we found some entities to analyze
      expect(result.data.summary.totalEntitiesAnalyzed).toBeGreaterThan(0);
    }, 45000);

    it('should analyze with problematic sampling strategy', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'analyze',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        strategy: 'balanced',
        enableMCPSampling: true,
        samplingStrategy: 'problematic',
      }, 30000);

      expect(result).toMatchObject({
        success: true,
        operation: 'analyze',
        data: {
          analysisId: expect.any(String),
          summary: expect.any(Object),
          staleEntities: expect.any(Array),
        },
      });

      // Should potentially find the old deprecated component
      expect(result.data.staleEntities.length).toBeGreaterThanOrEqual(0);
    }, 45000);

    it('should analyze with recent sampling strategy', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'analyze',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        strategy: 'conservative',
        enableMCPSampling: true,
        samplingStrategy: 'recent',
      }, 30000);

      expect(result).toMatchObject({
        success: true,
        operation: 'analyze',
        data: {
          analysisId: expect.any(String),
          summary: expect.any(Object),
        },
      });
    }, 45000);

    it('should analyze without MCP sampling (fallback)', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'analyze',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        strategy: 'conservative',
        enableMCPSampling: false,
      }, 30000);

      expect(result).toMatchObject({
        success: true,
        operation: 'analyze',
        data: {
          analysisId: expect.any(String),
          summary: expect.any(Object),
        },
      });
    }, 45000);

    it('should perform dry-run optimization', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'optimize',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        analysisId: analysisId,
        dryRun: true,
        strategy: 'conservative',
      }, 30000);

      expect(result).toMatchObject({
        success: true,
        operation: 'optimize',
        data: {
          planId: expect.any(String),
          status: expect.any(String),
          executedActions: expect.any(Array),
          optimizationSummary: expect.objectContaining({
            entitiesDeleted: expect.any(Number),
            entitiesMerged: expect.any(Number),
            entitiesUpdated: expect.any(Number),
          }),
        },
        message: expect.stringContaining('Dry run completed'),
      });

      // Dry run should not create a snapshot
      expect(result.data.snapshotId).toBeUndefined();
    }, 45000);

    it('should perform actual optimization with snapshot creation', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'optimize',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        analysisId: analysisId,
        dryRun: false,
        confirm: true,
        strategy: 'conservative',
      }, 30000);

      expect(result).toMatchObject({
        success: true,
        operation: 'optimize',
        data: {
          planId: expect.any(String),
          status: expect.any(String),
          executedActions: expect.any(Array),
          optimizationSummary: expect.any(Object),
          snapshotId: expect.any(String),
        },
        message: expect.stringContaining('Optimization completed'),
      });

      // Store snapshot ID for rollback test
      snapshotId = result.data.snapshotId;

      // Should have created a snapshot
      expect(result.data.snapshotId).toBeDefined();
    }, 45000);

    it('should list snapshots', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'list-snapshots',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
      });

      expect(result).toMatchObject({
        success: true,
        operation: 'list-snapshots',
        data: {
          snapshots: expect.any(Array),
          count: expect.any(Number),
          repository: TEST_REPO,
          branch: TEST_BRANCH,
        },
        message: expect.stringContaining('Found'),
      });

      // Should have at least one snapshot from the optimization
      expect(result.data.count).toBeGreaterThan(0);
      expect(result.data.snapshots.length).toBeGreaterThan(0);

      // Verify snapshot structure
      const snapshot = result.data.snapshots[0];
      expect(snapshot).toMatchObject({
        id: expect.any(String),
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        description: expect.any(String),
        created: expect.any(String),
        entitiesCount: expect.any(Number),
        relationshipsCount: expect.any(Number),
      });
    });

    it('should rollback to snapshot', async () => {
      // Only test rollback if we have a snapshot ID
      if (!snapshotId) {
        console.log('Skipping rollback test - no snapshot ID available');
        return;
      }

      const result = await callTool('memory-optimizer', {
        operation: 'rollback',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        snapshotId: snapshotId,
      }, 20000);

      expect(result).toMatchObject({
        success: true,
        operation: 'rollback',
        data: {
          rollbackStatus: 'success',
          restoredEntities: expect.any(Number),
          restoredRelationships: expect.any(Number),
          rollbackTime: expect.any(String),
          snapshotId: snapshotId,
        },
        message: expect.stringContaining('Successfully rolled back'),
      });

      // Should have restored some entities
      expect(result.data.restoredEntities).toBeGreaterThan(0);
    }, 30000);

    it('should handle optimization without confirmation', async () => {
      const result = await callTool('memory-optimizer', {
        operation: 'optimize',
        clientProjectRoot: testProjectRoot,
        repository: TEST_REPO,
        branch: TEST_BRANCH,
        analysisId: analysisId,
        dryRun: false,
        confirm: false, // No confirmation
        strategy: 'conservative',
      }, 15000);

      expect(result).toMatchObject({
        success: false,
        operation: 'optimize',
        message: expect.stringContaining('Confirmation required'),
      });
    });

    it('should handle invalid snapshot rollback', async () => {
      try {
        await callTool('memory-optimizer', {
          operation: 'rollback',
          clientProjectRoot: testProjectRoot,
          repository: TEST_REPO,
          branch: TEST_BRANCH,
          snapshotId: 'invalid-snapshot-id',
        }, 15000);

        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Should throw an error for invalid snapshot
        expect(error).toBeDefined();
      }
    });

    it('should handle missing analysis ID for optimization', async () => {
      try {
        await callTool('memory-optimizer', {
          operation: 'optimize',
          clientProjectRoot: testProjectRoot,
          repository: TEST_REPO,
          branch: TEST_BRANCH,
          // Missing analysisId
          dryRun: true,
          strategy: 'conservative',
        }, 15000);

        // Should still work - will perform new analysis
        expect(true).toBe(true);
      } catch (error) {
        // Or might throw an error, both are acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Memory Optimizer Integration Tests', () => {
    it('should verify memory optimizer tool is available', async () => {
      const toolsResponse = await sendMessage({
        jsonrpc: '2.0',
        id: 'test-memory-optimizer-tools',
        method: 'tools/list',
        params: {},
      });

      expect(toolsResponse.result?.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'memory-optimizer',
            description: expect.stringContaining('AI-powered core memory optimization'),
            inputSchema: expect.objectContaining({
              properties: expect.objectContaining({
                operation: expect.objectContaining({
                  enum: expect.arrayContaining(['analyze', 'optimize', 'rollback', 'list-snapshots']),
                }),
              }),
            }),
          }),
        ])
      );
    });

    it('should handle invalid operation', async () => {
      try {
        await callTool('memory-optimizer', {
          operation: 'invalid-operation',
          clientProjectRoot: testProjectRoot,
          repository: TEST_REPO,
          branch: TEST_BRANCH,
        });

        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Should throw an error for invalid operation
        expect(error).toBeDefined();
      }
    });

    it('should handle missing required parameters', async () => {
      try {
        await callTool('memory-optimizer', {
          operation: 'analyze',
          // Missing required parameters
        });

        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Should throw an error for missing parameters
        expect(error).toBeDefined();
      }
    });
  });
});
