import pino, { Logger, LoggerOptions } from 'pino';

/**
 * Base context interface for structured logging
 */
export interface BaseLogContext {
  component?: string; // 'KuzuDB' | 'MemoryService' | 'Controller' | 'MCP'
  repository?: string; // Repository name
  branch?: string; // Git branch
  operation?: string; // Current operation
  requestId?: string; // Correlation ID for request tracking
  duration?: number; // Operation duration in ms
  clientProjectRoot?: string; // Client project root path
}

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  format: 'json' | 'pretty';
  redaction: string[];
  performance: boolean;
  component?: string;
}

/**
 * Default logger configuration based on environment
 */
function getDefaultConfig(): LoggerConfig {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  const shouldUsePretty = process.env.PINO_PRETTY === 'true' || (isDevelopment && !isTest);

  return {
    level:
      (process.env.LOG_LEVEL as LoggerConfig['level']) ||
      (isTest ? 'error' : isDevelopment ? 'debug' : 'info'),
    format: shouldUsePretty ? 'pretty' : 'json',
    redaction: ['password', 'token', 'secret', 'apiKey', 'authorization', 'cookie', 'sessionId'],
    performance: process.env.LOG_PERFORMANCE === 'true' || (isDevelopment && !isTest),
  };
}

/**
 * Create Pino logger options with stdio-safe configuration
 */
function createLoggerOptions(config: LoggerConfig): LoggerOptions {
  const baseOptions: LoggerOptions = {
    level: config.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: config.redaction,
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: {
      pid: process.pid,
      hostname: undefined, // Remove hostname for cleaner logs
    },
  };

  // SIMPLIFIED: Always write to stderr, use simple JSON format to avoid transport issues
  // The pino-pretty transport was causing server startup hangs in tests
  if (config.format === 'pretty' && process.env.NODE_ENV !== 'test') {
    // Only use pretty format in non-test environments to avoid startup issues
    baseOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: config.component ? `[${config.component}] {msg}` : '{msg}',
        destination: 2, // stderr - CRITICAL for MCP stdio compliance
      },
    };
  }
  // For production JSON format or test mode, pino will use default output
  // We handle stderr redirection through process.stderr in the createLogger call

  return baseOptions;
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
    const config = getDefaultConfig();
    const options = createLoggerOptions(config);

    // Create logger with explicit stderr destination for JSON mode
    if (config.format !== 'pretty' || process.env.NODE_ENV === 'test') {
      rootLogger = pino(options, process.stderr);
    } else {
      rootLogger = pino(options);
    }
  }
  return rootLogger;
}

/**
 * Create a child logger with component-specific context
 */
export function createLogger(componentName: string, baseContext: BaseLogContext = {}): Logger {
  const root = getRootLogger();

  const context = {
    component: componentName,
    ...baseContext,
  };

  return root.child(context);
}

/**
 * Create a request-scoped logger with correlation ID
 */
export function createRequestLogger(
  componentName: string,
  requestId: string,
  baseContext: BaseLogContext = {},
): Logger {
  return createLogger(componentName, {
    ...baseContext,
    requestId,
  });
}

/**
 * Component-specific logger factories
 */
export const loggers = {
  // Core components
  kuzudb: () => createLogger('KuzuDB'),
  memoryService: () => createLogger('MemoryService'),
  controller: () => createLogger('Controller'),

  // MCP servers
  mcpStdio: () => createLogger('MCP-Stdio'),
  mcpSSE: () => createLogger('MCP-SSE'),
  mcpHttp: () => createLogger('MCP-HTTP'),

  // Repositories
  repository: () => createLogger('Repository'),

  // Tools and handlers
  tools: () => createLogger('Tools'),
  handlers: () => createLogger('Handlers'),

  // Search functionality
  search: () => createLogger('Search'),
} as const;

/**
 * Performance logging utility
 */
export class PerformanceLogger {
  private logger: Logger;
  private startTime: number;
  private operation: string;

  constructor(logger: Logger, operation: string) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = Date.now();

    this.logger.debug({ operation }, 'Operation started');
  }

  /**
   * Log completion with duration
   */
  complete(context: Record<string, any> = {}): void {
    const duration = Date.now() - this.startTime;
    this.logger.info(
      {
        operation: this.operation,
        duration,
        ...context,
      },
      'Operation completed',
    );
  }

  /**
   * Log failure with duration
   */
  fail(error: Error, context: Record<string, any> = {}): void {
    const duration = Date.now() - this.startTime;
    this.logger.error(
      {
        operation: this.operation,
        duration,
        error: {
          message: error.message,
          stack: error.stack,
          type: error.constructor.name,
        },
        ...context,
      },
      'Operation failed',
    );
  }

  /**
   * Log intermediate checkpoint
   */
  checkpoint(message: string, context: Record<string, any> = {}): void {
    const elapsed = Date.now() - this.startTime;
    this.logger.debug(
      {
        operation: this.operation,
        elapsed,
        ...context,
      },
      message,
    );
  }
}

/**
 * Create a performance logger for timing operations
 */
export function createPerformanceLogger(logger: Logger, operation: string): PerformanceLogger {
  return new PerformanceLogger(logger, operation);
}

/**
 * Utility to safely log errors with full context
 */
export function logError(logger: Logger, error: Error, context: Record<string, any> = {}): void {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        type: error.constructor.name,
      },
      ...context,
    },
    'Error occurred',
  );
}

/**
 * Middleware function to redirect console.log to stderr for MCP compliance
 * This should be called early in stdio server initialization
 */
export function enforceStdioCompliance(): void {
  const logger = getRootLogger();

  // Redirect console.log to stderr via logger
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]): void => {
    logger.warn(
      {
        args: args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))),
        source: 'console.log',
      },
      'console.log called - should use logger instead',
    );
  };

  // Ensure console.error goes to stderr (already does by default)
  // But add structured context when possible
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]): void => {
    // For backward compatibility, still call original console.error
    originalConsoleError(...args);
  };

  logger.info('stdio compliance enforced - console.log redirected to stderr');
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
