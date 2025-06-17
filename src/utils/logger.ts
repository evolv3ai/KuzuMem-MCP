import pino, { Logger } from 'pino';

/**
 * Simplified logging context for basic structured logging
 */
export interface LogContext {
  component?: string;
  operation?: string;
  requestId?: string;
  [key: string]: any; // Allow additional context
}

/**
 * Simple logger configuration
 */
function createSimpleLogger(): Logger {
  const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  // Allow info level in test mode for server startup messages
  const level = isTest ? 'info' : 'info';

  return pino({
    level,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    redact: ['password', 'token', 'secret', 'apiKey', 'authorization'],
  }, process.stderr);
}

/**
 * Root logger instance
 */
let rootLogger: Logger;

/**
 * Get or create the root logger
 */
export function getRootLogger(): Logger {
  if (!rootLogger) {
    rootLogger = createSimpleLogger();
  }
  return rootLogger;
}

/**
 * Create a child logger with component-specific context
 */
export function createLogger(componentName: string, baseContext: LogContext = {}): Logger {
  const root = getRootLogger();
  return root.child({ component: componentName, ...baseContext });
}

/**
 * Create a request-scoped logger with correlation ID
 */
export function createRequestLogger(
  componentName: string,
  requestId: string,
  baseContext: LogContext = {},
): Logger {
  return createLogger(componentName, { ...baseContext, requestId });
}

/**
 * Component-specific logger factories (simplified)
 */
export const loggers = {
  kuzudb: () => createLogger('KuzuDB'),
  memoryService: () => createLogger('MemoryService'),
  controller: () => createLogger('Controller'),
  mcpStdio: () => createLogger('MCP-Stdio'),
  mcpHttp: () => createLogger('MCP-HTTP'),
  repository: () => createLogger('Repository'),
  search: () => createLogger('Search'),
} as const;

/**
 * Simplified performance logging utility
 */
export class PerformanceLogger {
  private logger: Logger;
  private startTime: number;
  private operation: string;

  constructor(logger: Logger, operation: string) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = Date.now();
  }

  complete(context: Record<string, any> = {}): void {
    const duration = Date.now() - this.startTime;
    this.logger.info({ operation: this.operation, duration, ...context }, 'Operation completed');
  }

  fail(error: Error, context: Record<string, any> = {}): void {
    const duration = Date.now() - this.startTime;
    this.logger.error(
      {
        operation: this.operation,
        duration,
        error: error.message,
        ...context
      },
      'Operation failed'
    );
  }

  checkpoint(message: string, context: Record<string, any> = {}): void {
    const elapsed = Date.now() - this.startTime;
    this.logger.debug({ operation: this.operation, elapsed, ...context }, message);
  }
}

/**
 * Create a performance logger for timing operations
 */
export function createPerformanceLogger(logger: Logger, operation: string): PerformanceLogger {
  return new PerformanceLogger(logger, operation);
}

/**
 * Simplified error logging utility
 */
export function logError(logger: Logger, error: Error, context: Record<string, any> = {}): void {
  logger.error({ error: error.message, stack: error.stack, ...context }, 'Error occurred');
}

/**
 * Middleware function to redirect console.log to stderr for MCP compliance
 * This should be called early in stdio server initialization
 */
export function enforceStdioCompliance(): void {
  // For MCP stdio servers, we need absolutely minimal output to stderr
  // The sophisticated logging was causing protocol interference

  // Simple redirection without structured logging to avoid pino-pretty interference
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]): void => {
    // Direct stderr output without any formatting to avoid MCP protocol interference
    console.error(...args);
  };

  // Keep console.error as-is for backward compatibility
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]): void => {
    originalConsoleError(...args);
  };

  // Use a simple stderr message instead of structured logging to avoid pretty-printing
  console.error('stdio compliance enforced - console.log redirected to stderr');
}

/**
 * Export default logger for simple usage
 */
export const logger = getRootLogger();

/**
 * Export configured loggers for immediate use
 */
export const kuzuLogger = loggers.kuzudb();
export const memoryLogger = loggers.memoryService();
export const controllerLogger = loggers.controller();
export const mcpStdioLogger = loggers.mcpStdio();
export const searchLogger = loggers.search();
