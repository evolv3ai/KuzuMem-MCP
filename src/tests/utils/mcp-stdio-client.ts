import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import path from 'path';
// import { destr } from 'destr'; // Reverted: Will use JSON.parse with guards

// Ensure paths are relative to project root if this file is moved
const projectRoot = path.resolve(__dirname, '../../../'); // Adjust depth if utils moves

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: { code: number; message: string; data?: any };
  id: string | null;
}

export class McpStdioClient {
  private serverProcess?: ChildProcessWithoutNullStreams;
  private responses: Map<string, (response: JsonRpcResponse) => void> = new Map();
  private errorResolvers: Map<string, (reason?: any) => void> = new Map();
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();
  private messageIdCounter = 1;
  private responseBuffer = '';
  private static readonly SERVER_SCRIPT_PATH = path.join(projectRoot, 'src/mcp-stdio-server.ts');
  private serverReady = false;
  private serverReadyPromise!: Promise<void>;
  private resolveServerReady!: () => void;
  private rejectServerReady!: (reason?: any) => void;

  private serverStoppedPromise?: Promise<void>;
  private resolveServerStopped?: () => void;

  constructor() {
    this.resetServerReadyPromise();
  }

  private resetServerReadyPromise() {
    this.serverReadyPromise = new Promise((resolve, reject) => {
      this.resolveServerReady = resolve;
      this.rejectServerReady = reject;
    });
  }

  async startServer(envVars: Record<string, string> = {}): Promise<void> {
    const serverPath = McpStdioClient.SERVER_SCRIPT_PATH;
    console.log(`E2E STDIO Client: Starting server script: ${serverPath}`);
    this.serverReady = false;
    this.resetServerReadyPromise();

    this.serverProcess = spawn('npx', ['ts-node', '--transpile-only', serverPath], {
      env: { ...process.env, ...envVars },
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (
      !this.serverProcess ||
      !this.serverProcess.stdout ||
      !this.serverProcess.stderr ||
      !this.serverProcess.stdin
    ) {
      const err = new Error('Failed to spawn server process or attach to stdio streams.');
      this.rejectServerReady(err);
      return Promise.reject(err);
    }

    this.serverProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      console.error(`E2E STDIO Server STDERR: ${errorOutput}`);
      if (!this.serverReady && (errorOutput.includes('Error') || errorOutput.includes('⨯'))) {
        // If critical error on startup before ready signal, reject the ready promise
        // this.rejectServerReady(new Error(`Server emitted critical error on startup: ${errorOutput.substring(0,200)}`));
      }
    });

    const rl = readline.createInterface({ input: this.serverProcess.stdout });

    rl.on('line', (line) => {
      if (!this.serverReady && line.trim() === 'MCP_STDIO_SERVER_READY_FOR_TESTING') {
        console.log(
          'E2E STDIO Client: Server reported ready (MCP_STDIO_SERVER_READY_FOR_TESTING detected).',
        );
        this.serverReady = true;
        this.resolveServerReady();
        this.responseBuffer = '';
        return;
      }

      if (this.serverReady) {
        if (line.trim() === '') {
          return;
        }

        if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
          try {
            const parsedJson = JSON.parse(line); // Use JSON.parse again
            // this.responseBuffer = ''; // Not strictly needed if readline handles lines correctly

            // Check if parsedJson is an object, as JSON.parse can return primitives if top-level JSON is a primitive
            if (typeof parsedJson === 'object' && parsedJson !== null) {
              if (
                parsedJson.id !== undefined &&
                parsedJson.id !== null &&
                this.responses.has(String(parsedJson.id))
              ) {
                const idStr = String(parsedJson.id);
                const callback = this.responses.get(idStr);
                const rejectError = this.errorResolvers.get(idStr);
                const timeoutHandle = this.timeoutHandles.get(idStr);

                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  this.timeoutHandles.delete(idStr);
                }

                if (parsedJson.error && rejectError) {
                  console.log(
                    `E2E STDIO Client: Rejecting request ${idStr} with JSON-RPC error:`,
                    parsedJson.error,
                  );
                  rejectError(parsedJson as JsonRpcResponse);
                } else if (callback) {
                  console.log(
                    `E2E STDIO Client: Resolving request ${idStr} with result:`,
                    parsedJson.result,
                  );
                  callback(parsedJson as JsonRpcResponse);
                }
                this.responses.delete(idStr);
                this.errorResolvers.delete(idStr);
              } else if (
                parsedJson.method === 'tools/progress' ||
                parsedJson.method === '$/progress'
              ) {
                console.log('E2E STDIO Progress Notification:', parsedJson.params);
              } else if (parsedJson.id === null && parsedJson.error) {
                console.error('E2E STDIO General Server Error (id:null):', parsedJson.error);
              } else if (parsedJson.id !== undefined) {
                console.log(
                  `E2E STDIO Client: Received JSON with ID ${parsedJson.id} but no pending resolver or not a progress event.`,
                );
              } else {
                console.log('E2E STDIO Client: Received unexpected JSON object:', parsedJson);
              }
            } else {
              // JSON.parse returned a primitive or null, but the line looked like an object.
              console.log(
                `E2E STDIO Client: Parsed line that looked like JSON, but result was not an object: >>>${line}<<<, Parsed:`,
                parsedJson,
              );
            }
          } catch (e: any) {
            console.error(
              `E2E STDIO Client: Error parsing line (that appeared to be JSON) as JSON: ${e.message}. Raw line: >>>${line}<<<`,
            );
          }
        } else {
          console.log(
            `E2E STDIO Client: Received non-JSON stdout line from server (discarded): >>>${line}<<<`,
          );
        }
      }
    });

    this.serverProcess.on('error', (err) => {
      console.error('E2E STDIO Client: Failed to start server process:', err);
      if (!this.serverReady) {
        this.rejectServerReady(err);
      }
    });

    this.serverProcess.on('close', (code) => {
      console.log(`E2E STDIO Server process exited with code ${code}`);
      this.serverReady = false;
      this.responses.forEach((cb, id) => {
        const errCb = this.errorResolvers.get(id);
        const timeoutHandle = this.timeoutHandles.get(id);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          this.timeoutHandles.delete(id);
        }
        if (errCb) {
          errCb(
            new Error(
              `Server process closed unexpectedly with code ${code}. Request ${id} may not have been processed.`,
            ),
          );
        }
        this.errorResolvers.delete(id);
      });
      this.responses.clear();
      if (this.resolveServerStopped) {
        this.resolveServerStopped();
        this.resolveServerStopped = undefined;
        this.serverStoppedPromise = undefined;
      }
      this.resetServerReadyPromise();
    });
    return this.serverReadyPromise;
  }

  async request(method: string, params?: any, timeoutMs: number = 30000): Promise<JsonRpcResponse> {
    if (!this.isServerReady()) {
      console.log('E2E STDIO Client: request() called but server not ready, awaiting readiness...');
      try {
        await this.serverReadyPromise;
        if (!this.isServerReady()) {
          throw new Error('Server did not become ready after awaiting.');
        }
      } catch (e) {
        throw new Error(
          `E2E STDIO Client: Server failed to become ready before request: ${(e as Error).message}`,
        );
      }
      console.log('E2E STDIO Client: Server is now ready, proceeding with request.');
    }
    if (!this.serverProcess || this.serverProcess.killed) {
      throw new Error('E2E STDIO Client: Server process is not running or has been killed.');
    }

    const id = String(this.messageIdCounter++);
    const rpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      this.responses.set(id, resolve);
      this.errorResolvers.set(id, reject);

      const timeoutHandle = setTimeout(() => {
        if (this.responses.has(id)) {
          this.responses.delete(id);
          this.errorResolvers.delete(id);
          this.timeoutHandles.delete(id);
          reject(new Error(`E2E STDIO Request ${id} (${method}) timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      this.timeoutHandles.set(id, timeoutHandle);

      try {
        const requestString = JSON.stringify(rpcRequest) + '\n';
        this.serverProcess?.stdin.write(requestString);
      } catch (e) {
        clearTimeout(timeoutHandle);
        this.responses.delete(id);
        this.errorResolvers.delete(id);
        this.timeoutHandles.delete(id);
        reject(e);
      }
    });
  }

  stopServer(): Promise<void> {
    if (this.serverProcess && !this.serverProcess.killed) {
      console.log('E2E STDIO Client: Sending SIGTERM to server process.');
      this.serverStoppedPromise = new Promise((resolve) => {
        this.resolveServerStopped = resolve;
      });
      this.serverProcess.kill('SIGTERM');
      this.serverReady = false;
      this.timeoutHandles.forEach((handle, id) => {
        clearTimeout(handle);
        this.responses.delete(id);
        this.errorResolvers.delete(id);
      });
      this.timeoutHandles.clear();
      return this.serverStoppedPromise;
    }
    return Promise.resolve();
  }

  isServerReady(): boolean {
    return this.serverReady;
  }

  private handleData(data: Buffer) {
    const lines = data.toString().split('\n');
    lines.forEach((line) => {
      if (line.trim() === '') {
        return;
      }

      if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
        try {
          const response = JSON.parse(line);
          console.log(`E2E STDIO Client: Received potential JSON line: ${line}`);

          if (response.id && this.responses.has(String(response.id))) {
            console.log(`E2E STDIO Client: Resolving request ${response.id}`);
            const resolve = this.responses.get(String(response.id));
            const rejectError = this.errorResolvers.get(String(response.id));
            const timeoutHandle = this.timeoutHandles.get(String(response.id));

            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }

            if (response.error) {
              console.log(
                `E2E STDIO Client: Response for ${response.id} is an error:`,
                response.error,
              );
              if (rejectError) {
                rejectError(response);
              }
            } else {
              if (resolve) {
                resolve(response);
              }
            }

            this.responses.delete(String(response.id));
            this.errorResolvers.delete(String(response.id));
            this.timeoutHandles.delete(String(response.id));
          } else if (response.method === 'tools/progress') {
            console.log(`E2E STDIO Client: Received progress notification:`, response.params);
          } else {
            console.log(
              `E2E STDIO Client: Received unexpected JSON response or notification: ${line}`,
            );
          }
        } catch (e: any) {
          console.log(
            `E2E STDIO Client: Error parsing line that seemed like JSON: ${e.message}. Raw line: >>>${line}<<<`,
          );
        }
      } else {
        console.log(`E2E STDIO Client: Received non-JSON stdout line: >>>${line}<<<`);
      }
    });
  }
}
