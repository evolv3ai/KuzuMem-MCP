import { ToolHandler } from '../types';
import { MemoryService } from '../../services/memory.service';
import { ProgressHandler } from '../streaming/progress-handler';
import { loggers } from '../../utils/logger';

/**
 * Singleton service for executing tools with progress support
 */
export class ToolExecutionService {
  private logger = loggers.tools();
  private static instance: ToolExecutionService;
  private memoryService: MemoryService | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of ToolExecutionService
   */
  public static async getInstance(): Promise<ToolExecutionService> {
    if (!ToolExecutionService.instance) {
      ToolExecutionService.instance = new ToolExecutionService();
    }
    return ToolExecutionService.instance;
  }

  /**
   * Initialize the memory service if not already initialized
   */
  private async ensureMemoryService(): Promise<MemoryService> {
    if (!this.memoryService) {
      this.memoryService = await MemoryService.getInstance();
    }
    return this.memoryService;
  }

  /**
   * Execute a tool with progress support
   */
  public async executeTool(
    toolName: string,
    toolArgs: any,
    toolHandlers: Record<string, ToolHandler>,
    clientProjectRoot: string,
    progressHandler?: ProgressHandler,
    debugLog?: (level: number, message: string, data?: any) => void,
  ): Promise<any> {
    // The clientProjectRoot is passed directly to tool handlers and then to MemoryService methods.
    // Setting it as a process.env variable is problematic for concurrent requests and unnecessary.
    // if (clientProjectRoot) {
    //   process.env.CLIENT_PROJECT_ROOT = clientProjectRoot;
    // }
    const memoryService = await this.ensureMemoryService();

    try {
      const handler = toolHandlers[toolName];
      if (!handler) {
        const errorMsg = `Tool execution handler not implemented for '${toolName}'.`;
        if (progressHandler) {
          // For unhandled tool, send error via both progress and final response
          const errorPayload = { error: errorMsg };
          progressHandler.progress({ ...errorPayload, status: 'error', isFinal: true });
          progressHandler.sendFinalResponse(errorPayload, true);
          return null;
        }
        return { error: errorMsg }; // Batch error response
      }

      // Execute the tool handler with progress support
      // The handler is now responsible for calling sendFinalProgress and sendFinalResponse
      // and returning null if it used the progressHandler.
      return await handler(toolArgs, memoryService, progressHandler, clientProjectRoot);
    } catch (err: any) {
      const errorMsg = `Error executing tool '${toolName}': ${err.message || String(err)}`;
      if (debugLog) {
        debugLog(0, errorMsg, err.stack);
      } else {
        this.logger.error(errorMsg, err.stack);
      }

      if (progressHandler) {
        // If an error is thrown from the handler (or OperationClass it calls),
        // and a progressHandler exists, use it to send final error messages.
        const errorPayload = { error: errorMsg }; // This is for the batch response part
        const progressErrorData = { error: errorMsg, status: 'error' }; // Data for the progress notification
        progressHandler.progress({ ...progressErrorData, isFinal: true });
        progressHandler.sendFinalResponse(errorPayload, true);
        return null; // Signal that error was handled via progress mechanism
      }
      // If no progressHandler, return error as a batch response
      return { error: errorMsg };
    }
  }
}
