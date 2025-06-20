import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { BaseHttpStreamServer, type SessionInfo } from '../base/base-httpstream-server';
import { logError } from '../../utils/logger';

/**
 * Service responsible for managing session transports
 * Handles transport lifecycle, cleanup, and session management
 */
export class SessionTransportManager extends BaseHttpStreamServer {
  private sessionMetadata = new Map<string, { createdAt: Date; lastActivity: Date }>();

  /**
   * Create a new session transport
   */
  createTransport(
    sessionIdGenerator: () => string,
    onSessionInitialized?: (sessionId: string) => void,
  ): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator,
      enableJsonResponse: true,
      onsessioninitialized: (newSessionId: string) => {
        this.setTransport(newSessionId, transport);
        this.sessionMetadata.set(newSessionId, {
          createdAt: new Date(),
          lastActivity: new Date(),
        });

        this.logger.debug({ sessionId: newSessionId }, 'New session initialized');

        if (onSessionInitialized) {
          onSessionInitialized(newSessionId);
        }
      },
    });

    // Set up cleanup when transport closes
    transport.onclose = () => {
      if (transport.sessionId) {
        this.cleanupSession(transport.sessionId);
      }
    };

    return transport;
  }

  /**
   * Get session information with metadata
   */
  getSessionInfoWithMetadata(sessionId: string):
    | (SessionInfo & {
        createdAt: Date;
        lastActivity: Date;
        duration: number;
      })
    | undefined {
    const transport = this.getTransport(sessionId);
    const metadata = this.sessionMetadata.get(sessionId);

    if (!transport || !metadata) {
      return undefined;
    }

    return {
      sessionId,
      transport,
      createdAt: metadata.createdAt,
      lastActivity: metadata.lastActivity,
      duration: Date.now() - metadata.createdAt.getTime(),
    };
  }

  /**
   * Update session activity timestamp
   */
  updateSessionActivity(sessionId: string): void {
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      metadata.lastActivity = new Date();
    }
  }

  /**
   * Get all active sessions with metadata
   */
  getAllSessionsInfo(): Array<
    SessionInfo & {
      createdAt: Date;
      lastActivity: Date;
      duration: number;
    }
  > {
    const sessions: Array<
      SessionInfo & {
        createdAt: Date;
        lastActivity: Date;
        duration: number;
      }
    > = [];

    for (const sessionId of this.getActiveSessionIds()) {
      const sessionInfo = this.getSessionInfoWithMetadata(sessionId);
      if (sessionInfo) {
        sessions.push(sessionInfo);
      }
    }

    return sessions;
  }

  /**
   * Clean up a specific session
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const transport = this.getTransport(sessionId);

    if (transport) {
      try {
        await transport.close();
        this.logger.debug({ sessionId }, 'Transport closed');
      } catch (error) {
        logError(this.logger, error as Error, { sessionId, operation: 'transport-close' });
      }
    }

    this.removeTransport(sessionId);
    this.sessionMetadata.delete(sessionId);
    this.logger.debug({ sessionId }, 'Session cleaned up');
  }

  /**
   * Clean up all active sessions
   */
  async cleanupAllSessions(): Promise<void> {
    this.logger.info('Cleaning up all active sessions');

    const sessionIds = this.getActiveSessionIds();
    const cleanupPromises = sessionIds.map((sessionId) => this.cleanupSession(sessionId));

    try {
      await Promise.allSettled(cleanupPromises);
      this.logger.info({ sessionCount: sessionIds.length }, 'All sessions cleaned up');
    } catch (error) {
      logError(this.logger, error as Error, { operation: 'cleanup-all-sessions' });
    }
  }

  /**
   * Clean up inactive sessions based on timeout
   */
  async cleanupInactiveSessions(inactivityTimeoutMs: number = 30 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const inactiveSessions: string[] = [];

    for (const [sessionId, metadata] of this.sessionMetadata.entries()) {
      const timeSinceLastActivity = now - metadata.lastActivity.getTime();
      if (timeSinceLastActivity > inactivityTimeoutMs) {
        inactiveSessions.push(sessionId);
      }
    }

    if (inactiveSessions.length > 0) {
      this.logger.info(
        { inactiveSessionCount: inactiveSessions.length, inactivityTimeoutMs },
        'Cleaning up inactive sessions',
      );

      const cleanupPromises = inactiveSessions.map((sessionId) => this.cleanupSession(sessionId));
      await Promise.allSettled(cleanupPromises);
    }
  }

  /**
   * Get session statistics
   */
  getSessionStatistics(): {
    totalSessions: number;
    averageDuration: number;
    oldestSession: Date | null;
    newestSession: Date | null;
  } {
    const sessions = this.getAllSessionsInfo();

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        averageDuration: 0,
        oldestSession: null,
        newestSession: null,
      };
    }

    const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
    const averageDuration = totalDuration / sessions.length;

    const sortedByCreation = sessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const oldestSession = sortedByCreation[0]?.createdAt || null;
    const newestSession = sortedByCreation[sortedByCreation.length - 1]?.createdAt || null;

    return {
      totalSessions: sessions.length,
      averageDuration,
      oldestSession,
      newestSession,
    };
  }

  /**
   * Check if session exists and is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.getTransport(sessionId) !== undefined;
  }

  /**
   * Force close a session
   */
  async forceCloseSession(sessionId: string): Promise<boolean> {
    const transport = this.getTransport(sessionId);

    if (!transport) {
      return false;
    }

    try {
      await this.cleanupSession(sessionId);
      this.logger.info({ sessionId }, 'Session force closed');
      return true;
    } catch (error) {
      logError(this.logger, error as Error, { sessionId, operation: 'force-close-session' });
      return false;
    }
  }

  /**
   * Start periodic cleanup of inactive sessions
   */
  startPeriodicCleanup(intervalMs: number = 10 * 60 * 1000): NodeJS.Timeout {
    this.logger.info({ intervalMs }, 'Starting periodic session cleanup');

    return setInterval(async () => {
      try {
        await this.cleanupInactiveSessions();
      } catch (error) {
        logError(this.logger, error as Error, { operation: 'periodic-cleanup' });
      }
    }, intervalMs);
  }

  // Implement abstract methods from base class
  async start(): Promise<void> {
    this.logger.info('Session transport manager initialized');
  }

  async stop(): Promise<void> {
    await this.cleanupAllSessions();
    this.logger.info('Session transport manager stopped');
  }
}
