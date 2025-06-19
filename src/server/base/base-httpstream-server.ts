import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { type Logger } from 'pino';

// Official MCP SDK imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Our tool definitions and services
import { type ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { MemoryService } from '../../services/memory.service';
import { loggers } from '../../utils/logger';

// Load environment variables
dotenv.config();

// Server configuration constants
export const DEFAULT_PORT = 8001;
export const DEFAULT_HOST = 'localhost';
export const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB
export const REQUEST_TIMEOUT = 30000; // 30 seconds
export const SHUTDOWN_TIMEOUT = 30000; // 30 seconds

// Type definitions for improved type safety
export type ToolArguments = Record<string, unknown>;

export interface EnhancedToolArguments extends ToolArguments {
  clientProjectRoot: string;
  repository: string;
  branch: string;
}

// Type-safe event listener for request size monitoring
export type DataEventListener = (chunk: Buffer | string) => void;
export type GenericEventListener = (...args: any[]) => void;

// Server configuration interface
export interface ServerConfig {
  port: number;
  host: string;
  maxRequestSize: number;
  requestTimeout: number;
  shutdownTimeout: number;
}

// Session management interface
export interface SessionInfo {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  createdAt: Date;
}

/**
 * Base class for HTTP stream server
 * Provides common configuration, utilities, and type definitions
 */
export abstract class BaseHttpStreamServer {
  protected config: ServerConfig;
  protected logger: Logger;
  protected mcpServer: McpServer;
  protected server?: Server;
  protected repositoryRootMap = new Map<string, string>();
  protected transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  constructor(config?: Partial<ServerConfig>) {
    this.config = {
      port: parseInt(process.env.HTTP_STREAM_PORT || String(DEFAULT_PORT), 10),
      host: process.env.HOST || DEFAULT_HOST,
      maxRequestSize: MAX_REQUEST_SIZE,
      requestTimeout: REQUEST_TIMEOUT,
      shutdownTimeout: SHUTDOWN_TIMEOUT,
      ...config,
    };

    this.logger = loggers.mcpHttp();

    // Create the official MCP server with proper capabilities
    this.mcpServer = new McpServer(
      { name: 'KuzuMem-MCP-HTTPStream', version: '3.0.0' },
      {
        capabilities: {
          tools: { list: true, call: true, listChanged: true },
          resources: {},
          prompts: {},
        },
      },
    );
  }

  /**
   * Get server configuration
   */
  getConfig(): ServerConfig {
    return { ...this.config };
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get MCP server instance
   */
  getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get HTTP server instance
   */
  getHttpServer(): Server | undefined {
    return this.server;
  }

  /**
   * Set HTTP server instance
   */
  protected setHttpServer(server: Server): void {
    this.server = server;
  }

  /**
   * Get repository root for a repository/branch combination
   */
  getRepositoryRoot(repository: string, branch: string): string | undefined {
    const key = this.createRepositoryBranchKey(repository, branch);
    return this.repositoryRootMap.get(key);
  }

  /**
   * Set repository root for a repository/branch combination
   */
  setRepositoryRoot(repository: string, branch: string, clientProjectRoot: string): void {
    const key = this.createRepositoryBranchKey(repository, branch);
    this.repositoryRootMap.set(key, clientProjectRoot);
    this.logger.debug(
      { repoBranchKey: key, clientProjectRoot },
      `Stored clientProjectRoot for ${key}`,
    );
  }

  /**
   * Create repository branch key
   */
  protected createRepositoryBranchKey(repository: string, branch: string): string {
    return `${repository}:${branch}`;
  }

  /**
   * Get transport by session ID
   */
  getTransport(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.transports[sessionId];
  }

  /**
   * Set transport for session ID
   */
  setTransport(sessionId: string, transport: StreamableHTTPServerTransport): void {
    this.transports[sessionId] = transport;
  }

  /**
   * Remove transport for session ID
   */
  removeTransport(sessionId: string): void {
    delete this.transports[sessionId];
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Object.keys(this.transports);
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): SessionInfo | undefined {
    const transport = this.transports[sessionId];
    if (!transport) {
      return undefined;
    }

    return {
      sessionId,
      transport,
      createdAt: new Date(), // We don't track creation time currently, but could be added
    };
  }

  /**
   * Create request logger with context
   */
  createRequestLogger(req: IncomingMessage): Logger {
    return this.logger.child({
      requestId: randomUUID(),
      method: req.method,
      url: req.url,
    });
  }

  /**
   * Create tool logger with context
   */
  createToolLogger(toolName: string): Logger {
    return this.logger.child({
      tool: toolName,
      requestId: randomUUID(),
    });
  }

  /**
   * Create tool handler context
   */
  createToolHandlerContext(
    logger: Logger,
    clientProjectRoot: string,
    repository: string,
    branch: string,
  ): ToolHandlerContext {
    return {
      logger,
      session: {
        clientProjectRoot,
        repository,
        branch,
      },
      sendProgress: async () => {
        // No-op - MCP SDK doesn't support progress for individual tools
      },
      signal: new AbortController().signal,
      requestId: randomUUID(),
    };
  }

  /**
   * Get memory service instance
   */
  async getMemoryService(): Promise<MemoryService> {
    return MemoryService.getInstance();
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server?.listening ?? false;
  }

  /**
   * Get server address info
   */
  getAddressInfo(): { host: string; port: number } | null {
    if (!this.server?.listening) {
      return null;
    }

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      return null;
    }

    return {
      host: address.address,
      port: address.port,
    };
  }

  /**
   * Abstract methods to be implemented by concrete classes
   */
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
}
