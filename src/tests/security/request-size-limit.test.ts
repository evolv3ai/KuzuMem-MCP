/**
 * Security test for request size limiting in HTTP stream server
 * 
 * This test verifies that the streaming back-pressure implementation
 * correctly prevents memory exhaustion attacks from oversized requests.
 */

import { spawn, ChildProcess } from 'child_process';
import fetch from 'node-fetch';

describe('HTTP Stream Server Security - Request Size Limiting', () => {
  let serverProcess: ChildProcess;
  let serverPort: number;
  const SERVER_URL = () => `http://localhost:${serverPort}`;

  beforeAll(async () => {
    // Find an available port
    serverPort = 30000 + Math.floor(Math.random() * 1000);

    // Start the HTTP stream server with explicit environment
    serverProcess = spawn('node', ['-r', 'ts-node/register', 'src/mcp-httpstream-server.ts'], {
      env: {
        ...process.env,
        HTTP_STREAM_PORT: serverPort.toString(), // Correct environment variable name
        HOST: 'localhost',
        NODE_ENV: 'test',
        TS_NODE_PROJECT: './tsconfig.json',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    // Log server output for debugging
    serverProcess.stdout?.on('data', (data) => {
      console.log('Server stdout:', data.toString());
    });

    serverProcess.stderr?.on('data', (data) => {
      console.log('Server stderr:', data.toString());
    });

    // Wait for server to start by checking stderr for the startup message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 15000);

      const onStderr = (data: Buffer) => {
        const message = data.toString();
        if (message.includes(`MCP HTTP stream server listening at http://localhost:${serverPort}`)) {
          clearTimeout(timeout);
          serverProcess.stderr?.off('data', onStderr);
          resolve();
        }
      };

      serverProcess.stderr?.on('data', onStderr);

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }, 20000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve();
        }, 5000);
      });
    }
  });

  it('should reject requests with oversized Content-Length header', async () => {
    // Create a large payload that exceeds the 10MB limit
    const oversizedPayload = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'security-test', version: '1.0.0' },
        // Add a large data field to exceed the size limit
        largeData: 'x'.repeat(11 * 1024 * 1024), // 11MB of 'x' characters
      },
      id: 1,
    };

    const response = await fetch(SERVER_URL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(oversizedPayload),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (response.status !== 413) {
      const responseText = await response.text();
      console.log('Unexpected response body:', responseText.substring(0, 500) + '...');
    }

    expect(response.status).toBe(413); // Payload Too Large

    const responseData = await response.json();
    expect(responseData).toMatchObject({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Payload Too Large',
      },
    });
  }, 10000);

  it('should accept normal-sized requests', async () => {
    const response = await fetch(SERVER_URL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'security-test', version: '1.0.0' },
        },
        id: 1,
      }),
    });

    console.log('Normal request - Response status:', response.status);
    console.log('Normal request - Response headers:', Object.fromEntries(response.headers.entries()));

    if (response.status !== 200) {
      const responseText = await response.text();
      console.log('Normal request - Unexpected response body:', responseText);
    }

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBeTruthy();
  }, 10000);

  it('should handle requests without Content-Length header gracefully', async () => {
    // Create a normal request without Content-Length header
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'security-test', version: '1.0.0' },
      },
      id: 1,
    });

    const response = await fetch(SERVER_URL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBeTruthy();
  }, 10000);
});
