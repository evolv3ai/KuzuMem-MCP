import { createServer, type Server } from 'node:http';

import { BaseHttpStreamServer } from '../base/base-httpstream-server';
import { ToolRegistrationService } from './tool-registration.service';
import { HttpRequestRouter } from './http-request-router';
import { SessionTransportManager } from './session-transport-manager';
import { logError } from '../../utils/logger';

/**
 * Service responsible for server lifecycle management
 * Handles server startup, shutdown, and process signal handling
 */
export class ServerLifecycleManager extends BaseHttpStreamServer {
  private toolRegistration: ToolRegistrationService;
  private requestRouter: HttpRequestRouter;
  private sessionManager: SessionTransportManager;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config?: any) {
    super(config);
    this.toolRegistration = new ToolRegistrationService(this.getMcpServer(), this.getLogger());
    this.requestRouter = new HttpRequestRouter(config, this.getMcpServer());
    this.sessionManager = new SessionTransportManager(config);
  }

  /**
   * Start the HTTP stream server
   */
  async start(): Promise<void> {
    this.logger.info('Starting MCP HTTP Stream server...');

    try {
      // IMPORTANT: Register tools FIRST before starting any HTTP handling
      // This ensures tools are available when the server starts accepting connections
      this.logger.info('Registering MCP tools...');
      await this.toolRegistration.start();
      this.logger.info('MCP tools registered successfully');

      // Initialize other services
      await this.requestRouter.start();
      await this.sessionManager.start();

      // Create HTTP server
      const server = createServer(async (req, res) => {
        await this.requestRouter.routeRequest(req, res);
      });

      this.setHttpServer(server);

      // Set up server event handlers
      this.setupServerEventHandlers(server);

      // Start listening
      await this.startListening(server);

      // Start periodic cleanup
      this.cleanupInterval = this.sessionManager.startPeriodicCleanup();

      this.logger.info('MCP HTTP Stream server started successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start server');
      throw error;
    }
  }

  /**
   * Stop the HTTP stream server
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping MCP HTTP Stream server...');

    try {
      // Clear periodic cleanup
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }

      // Stop all services
      await this.sessionManager.stop();
      await this.requestRouter.stop();
      await this.toolRegistration.stop();

      // Close HTTP server
      if (this.server) {
        await this.closeServer();
      }

      // Shutdown memory service
      try {
        const memoryService = await this.getMemoryService();
        await memoryService.shutdown();
        this.logger.info('MemoryService shutdown completed');
      } catch (error) {
        logError(this.logger, error as Error, { operation: 'memory-service-shutdown' });
      }

      this.logger.info('MCP HTTP Stream server stopped successfully');
    } catch (error) {
      this.logger.error({ error }, 'Error during server shutdown');
      throw error;
    }
  }

  /**
   * Perform graceful shutdown
   */
  async gracefulShutdown(signal: string): Promise<void> {
    this.logger.info({ signal }, `Received ${signal}, starting graceful shutdown`);

    // Start the shutdown timer to ensure process doesn't hang
    const shutdownTimer = setTimeout(() => {
      this.logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, this.config.shutdownTimeout);

    try {
      await this.stop();
      clearTimeout(shutdownTimer);
      process.exit(0);
    } catch (error) {
      this.logger.error({ error }, 'Error during graceful shutdown');
      clearTimeout(shutdownTimer);
      process.exit(1);
    }
  }

  /**
   * Set up server event handlers
   */
  private setupServerEventHandlers(server: Server): void {
    server.on('error', (err: Error) => {
      logError(this.logger, err, { operation: 'http-server-error' });
      process.exit(1);
    });

    server.on('close', () => {
      this.logger.info('HTTP server closed');
    });

    server.on('connection', (socket) => {
      this.logger.debug('New connection established');
      
      socket.on('error', (err) => {
        this.logger.debug({ error: err }, 'Socket error');
      });
    });
  }

  /**
   * Start server listening
   */
  private async startListening(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
      server.listen(this.config.port, this.config.host, () => {
        const message = `MCP HTTP stream server listening at http://${this.config.host}:${this.config.port}`;
        this.logger.info({ host: this.config.host, port: this.config.port }, message);

        // EXPLICIT test detection message - required for E2E tests to detect server readiness
        if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
          // Use stderr for test detection to avoid stdout pollution
          process.stderr.write(message + '\n');
        }

        resolve();
      });

      server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Close the HTTP server
   */
  private async closeServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('HTTP server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Set up process signal handlers
   */
  setupProcessSignalHandlers(): void {
    process.on('SIGTERM', () => {
      this.gracefulShutdown('SIGTERM').catch((error) => {
        this.logger.error({ error }, 'Error in SIGTERM handler');
        process.exit(1);
      });
    });

    process.on('SIGINT', () => {
      this.gracefulShutdown('SIGINT').catch((error) => {
        this.logger.error({ error }, 'Error in SIGINT handler');
        process.exit(1);
      });
    });

    process.on('uncaughtException', (error) => {
      logError(this.logger, error, { operation: 'uncaught-exception' });
      this.gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error(
        { reason, promise },
        'Unhandled promise rejection',
      );
      this.gracefulShutdown('unhandledRejection').catch(() => {
        process.exit(1);
      });
    });
  }

  /**
   * Get server status information
   */
  getServerStatus(): {
    isRunning: boolean;
    address: { host: string; port: number } | null;
    uptime: number;
    sessions: any;
    config: any;
  } {
    const addressInfo = this.getAddressInfo();
    const sessionStats = this.sessionManager.getSessionStatistics();

    return {
      isRunning: this.isRunning(),
      address: addressInfo,
      uptime: process.uptime() * 1000, // Convert to milliseconds
      sessions: sessionStats,
      config: this.getConfig(),
    };
  }

  /**
   * Get tool registration service
   */
  getToolRegistrationService(): ToolRegistrationService {
    return this.toolRegistration;
  }

  /**
   * Get request router service
   */
  getRequestRouterService(): HttpRequestRouter {
    return this.requestRouter;
  }

  /**
   * Get session manager service
   */
  getSessionManagerService(): SessionTransportManager {
    return this.sessionManager;
  }
}
