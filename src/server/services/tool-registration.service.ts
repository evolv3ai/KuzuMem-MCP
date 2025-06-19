import { randomUUID } from 'node:crypto';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Logger } from 'pino';

import { type ToolArguments, type EnhancedToolArguments } from '../base/base-httpstream-server';
import { toolHandlers } from '../../mcp/tool-handlers';
import { MEMORY_BANK_MCP_TOOLS } from '../../mcp/tools';
import { createPerformanceLogger, logError } from '../../utils/logger';
import { createZodRawShape } from '../../mcp/utils/schema-utils';
import { MemoryService } from '../../services/memory.service';
import { type ToolHandlerContext } from '../../mcp/types/sdk-custom';

/**
 * Service responsible for registering MCP tools with the server
 * Handles tool registration, argument validation, and execution
 */
export class ToolRegistrationService {
  private mcpServer: McpServer;
  private logger: Logger;
  private repositoryRootMap = new Map<string, string>();

  constructor(mcpServer: McpServer, logger: Logger) {
    this.mcpServer = mcpServer;
    this.logger = logger;
  }
  /**
   * Register all MCP tools with the server
   */
  async registerTools(): Promise<void> {
    this.logger.info('Registering MCP tools...');

    // Add the initialize method handler (this is handled automatically by McpServer)
    this.logger.debug('MCP server will handle initialization automatically');

    for (const tool of MEMORY_BANK_MCP_TOOLS) {
      this.logger.debug({ toolName: tool.name }, `Registering tool: ${tool.name}`);

      const zodRawShape = createZodRawShape(tool);

      // Use the official registerTool method following SDK patterns
      this.mcpServer.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: zodRawShape,
        },
        async (args: ToolArguments): Promise<CallToolResult> => {
          return this.executeToolHandler(tool.name, args);
        },
      );
    }

    this.logger.info(
      { toolCount: MEMORY_BANK_MCP_TOOLS.length },
      `Registered ${MEMORY_BANK_MCP_TOOLS.length} tools`,
    );
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
  private createRepositoryBranchKey(repository: string, branch: string): string {
    return `${repository}:${branch}`;
  }

  /**
   * Execute a tool handler with proper error handling and context
   */
  private async executeToolHandler(toolName: string, args: ToolArguments): Promise<CallToolResult> {
    const toolPerfLogger = createPerformanceLogger(this.logger, `tool-${toolName}`);
    const requestId = randomUUID();
    const toolLogger = this.createToolLogger(toolName);

    toolLogger.debug({ args }, `Executing tool: ${toolName}`);

    try {
      // Handle clientProjectRoot storage for memory-bank init operations
      if (toolName === 'memory-bank' && (args as any).operation === 'init') {
        this.setRepositoryRoot(
          (args as any).repository,
          (args as any).branch,
          (args as any).clientProjectRoot,
        );
      }

      // Get clientProjectRoot from stored map or args
      const effectiveClientProjectRoot = this.resolveClientProjectRoot(args);

      if (!effectiveClientProjectRoot) {
        throw new Error(
          `ClientProjectRoot not established for tool '${toolName}'. Initialize memory bank first.`,
        );
      }

      // Get memory service instance
      const memoryService = await MemoryService.getInstance();

      // Add clientProjectRoot to args with proper typing
      const enhancedArgs: EnhancedToolArguments = {
        ...args,
        clientProjectRoot: effectiveClientProjectRoot,
        repository: ((args as any).repository as string) || 'unknown',
        branch: ((args as any).branch as string) || 'main',
      };

      // Get the tool handler directly
      const handler = toolHandlers[toolName];
      if (!handler) {
        throw new Error(`No handler found for tool: ${toolName}`);
      }

      // Create a properly typed context object
      const handlerContext = this.createToolHandlerContext(
        toolLogger,
        effectiveClientProjectRoot,
        enhancedArgs.repository,
        enhancedArgs.branch,
      );

      // Execute the handler with proper types
      const result: unknown = await handler(enhancedArgs, handlerContext, memoryService);

      toolPerfLogger.complete({ success: !!result });

      // Return the result in the proper MCP format
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      toolPerfLogger.fail(error as Error);
      logError(toolLogger, error as Error, { operation: 'tool-execution' });

      // Return error in proper MCP format
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              errorId: randomUUID(), // Generic error identifier for tracking without exposing internals
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Create tool logger with context
   */
  private createToolLogger(toolName: string): Logger {
    return this.logger.child({
      tool: toolName,
      requestId: randomUUID(),
    });
  }

  /**
   * Create tool handler context
   */
  private createToolHandlerContext(
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
   * Resolve client project root from arguments or stored map
   */
  private resolveClientProjectRoot(args: ToolArguments): string | undefined {
    let effectiveClientProjectRoot = (args as any).clientProjectRoot;
    
    if (!effectiveClientProjectRoot && (args as any).repository) {
      effectiveClientProjectRoot = this.getRepositoryRoot(
        (args as any).repository,
        (args as any).branch || 'main',
      );
    }

    return effectiveClientProjectRoot;
  }

  /**
   * Get list of registered tools
   */
  getRegisteredTools(): string[] {
    return MEMORY_BANK_MCP_TOOLS.map(tool => tool.name);
  }

  /**
   * Check if a tool is registered
   */
  isToolRegistered(toolName: string): boolean {
    return MEMORY_BANK_MCP_TOOLS.some(tool => tool.name === toolName);
  }

  /**
   * Get tool information
   */
  getToolInfo(toolName: string) {
    return MEMORY_BANK_MCP_TOOLS.find(tool => tool.name === toolName);
  }

  /**
   * Get all tool information
   */
  getAllToolsInfo() {
    return MEMORY_BANK_MCP_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: createZodRawShape(tool),
    }));
  }

  /**
   * Start the tool registration service
   */
  async start(): Promise<void> {
    await this.registerTools();
  }

  /**
   * Stop the tool registration service
   */
  async stop(): Promise<void> {
    // Tool registration cleanup if needed
    this.logger.info('Tool registration service stopped');
  }
}
