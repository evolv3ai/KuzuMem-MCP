/**
 * MCP HTTP Streaming Server
 * Refactored implementation using specialized services for better maintainability
 *
 * This is the main orchestrator that delegates to specialized services:
 * - ServerLifecycleManager: Server startup, shutdown, and lifecycle management
 * - ToolRegistrationService: MCP tool registration and handler setup
 * - HttpRequestRouter: HTTP method routing and request handling
 * - SessionTransportManager: Session and transport management
 * - RequestSecurityMiddleware: Request size limiting and security
 */

import { ServerLifecycleManager } from './server/services/server-lifecycle-manager';
import { loggers } from './utils/logger';

// Create HTTP stream specific logger
const httpStreamLogger = loggers.mcpHttp();

// Create server lifecycle manager with configuration
const serverManager = new ServerLifecycleManager({
  port: parseInt(process.env.HTTP_STREAM_PORT || '8001', 10),
  host: process.env.HOST || 'localhost',
});

/**
 * Start the MCP HTTP streaming server
 * Delegates to ServerLifecycleManager for all server operations
 */
async function startServer(): Promise<void> {
  try {
    await serverManager.start();
    httpStreamLogger.info('MCP HTTP Stream server started successfully');
  } catch (error) {
    httpStreamLogger.error({ error }, 'Failed to start MCP HTTP Stream server');
    throw error;
  }
}

/**
 * Stop the MCP HTTP streaming server
 * Delegates to ServerLifecycleManager for graceful shutdown
 */
async function stopServer(): Promise<void> {
  try {
    await serverManager.stop();
    httpStreamLogger.info('MCP HTTP Stream server stopped successfully');
  } catch (error) {
    httpStreamLogger.error({ error }, 'Failed to stop MCP HTTP Stream server');
    throw error;
  }
}

/**
 * Get server status information
 */
function getServerStatus() {
  return serverManager.getServerStatus();
}

/**
 * Get server services for testing or advanced usage
 */
function getServerServices() {
  return {
    toolRegistration: serverManager.getToolRegistrationService(),
    requestRouter: serverManager.getRequestRouterService(),
    sessionManager: serverManager.getSessionManagerService(),
  };
}

// Start the server only if this script is executed directly
if (require.main === module) {
  // Set up process signal handlers
  serverManager.setupProcessSignalHandlers();

  // Start the server
  startServer().catch((error) => {
    httpStreamLogger.error({ error }, 'Failed to start MCP HTTP Stream server');
    process.exit(1);
  });
}

// Export the server manager and utilities for testing and external usage
export { serverManager, startServer, stopServer, getServerStatus, getServerServices };

// Legacy exports for backward compatibility
export const mcpServer = serverManager.getMcpServer();
export const transports = {}; // Placeholder for backward compatibility - actual transports are managed internally
