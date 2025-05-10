/**
 * MCP HTTP Streaming Server
 * Implements the Model Context Protocol using HTTP streaming approach
 * Based on the TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { MEMORY_BANK_MCP_TOOLS } from './mcp/tools';
import { MemoryService } from './services/memory.service';

// Extend Express Request interface to include our custom properties
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

// Load environment variables
dotenv.config();

// Debug levels
const DEBUG_LEVEL = process.env.DEBUG ? parseInt(process.env.DEBUG, 10) || 1 : 0;

/**
 * Enhanced logging system with severity levels and structured output
 */
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  component: string;
  data?: any;
  requestId?: string;
}

function log(level: LogLevel, message: string, data?: any, requestId?: string): void {
  const debugLevel = parseInt(process.env.DEBUG || '0', 10);
  
  // Only log if the current debug level is sufficient
  if (debugLevel >= level) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      component: 'mcp-httpstream-server',
      requestId
    };
    
    // Only include data at higher debug levels or for errors
    if ((data && debugLevel >= 3) || level === LogLevel.ERROR) {
      entry.data = data;
    }
    
    console.log(JSON.stringify(entry));
  }
}

// Legacy debug logger for backward compatibility
function debugLog(level: number, message: string, data?: any): void {
  const logLevel = level === 0 ? LogLevel.ERROR 
    : level === 1 ? LogLevel.WARN
    : level === 2 ? LogLevel.INFO
    : level === 3 ? LogLevel.DEBUG
    : LogLevel.TRACE;
    
  log(logLevel, message, data);
}

// Helper for tool errors
function createToolError(message: string): any {
  return {
    error: message
  };
}

// Create Express app
export const app = express();
const port = process.env.PORT || 3001; // Default to 3001 to avoid conflict with main server
const host = process.env.HOST || 'localhost';

// Configure the server
export async function configureServer(app: express.Application): Promise<void> {
  // Middleware
  app.use(express.json({ limit: '5mb' }));
  app.use(cors());
  
  // Generate a unique request ID for correlation
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const requestId = crypto.randomUUID();
    // Add requestId to the request object 
    req.requestId = requestId;
    
    // Add the request ID to response headers for client-side correlation
    res.setHeader('X-Request-ID', requestId);
    
    // Log all incoming requests
    log(LogLevel.INFO, `${req.method} ${req.path}`, { 
      query: req.query,
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      userAgent: req.get('User-Agent') 
    }, requestId);
    
    // Capture response completion to log the outcome
    res.on('finish', () => {
      const responseTime = Date.now() - (req.startTime || Date.now());
      log(LogLevel.INFO, `${req.method} ${req.path} - ${res.statusCode}`, {
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`
      }, requestId);
    });
    
    // Store request start time for calculating response time
    req.startTime = Date.now();
    
    next();
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    log(LogLevel.ERROR, `Error: ${err.message}`, err, req.requestId);
    
    // Determine if this is a client error or server error
    const statusCode = err.statusCode || 500;
    
    res.status(statusCode).json({
      error: {
        message: err.message || 'Internal Server Error',
        type: statusCode >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
        code: err.code || 'UNKNOWN_ERROR'
      }
    });
  });

  // MCP protocol version negotiation
  app.post('/initialize', (req, res) => {
    const requestedVersion = req.body?.protocolVersion || '0.1';
    log(LogLevel.INFO, `Received initialize request with protocolVersion: ${requestedVersion}`, req.body, req.requestId);
  
    res.json({
      protocolVersion: requestedVersion,
      capabilities: {
        memory: { list: true },
        tools: { list: true, call: true },
      },
      serverInfo: {
        name: 'memory-bank-mcp',
        version: '1.0.0',
      },
    });
  });

  // MCP tools listing
  app.get('/tools/list', (req, res) => {
    log(LogLevel.INFO, `Returning tools/list with ${MEMORY_BANK_MCP_TOOLS.length} tools`, req.query, req.requestId);
    
    // Convert our tool format to what MCP clients expect
    const convertedTools = MEMORY_BANK_MCP_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      // Map parameters to inputSchema
      inputSchema: tool.parameters,
      // Map returns to outputSchema
      outputSchema: tool.returns,
      // Keep annotations
      annotations: tool.annotations
    }));
    
    res.json({
      tools: convertedTools
    });
  });

  // MCP resources listing
  app.get('/resources/list', (req, res) => {
    log(LogLevel.INFO, 'Handling resources/list request', req.query, req.requestId);
    
    res.json({
      resources: [],
      cursor: null
    });
  });

  // MCP resources templates listing
  app.get('/resources/templates/list', (req, res) => {
    log(LogLevel.INFO, 'Handling resources/templates/list request', req.query, req.requestId);
    
    res.json({
      templates: [],
      cursor: null
    });
  });

  // MCP-compliant unified /mcp endpoint
  app.post('/mcp', async (req, res) => {
    // Validate Origin header (DNS rebinding protection)
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost').split(',');
    const origin = req.get('Origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      log(LogLevel.WARN, `Rejected connection due to invalid Origin: ${origin}`, {}, req.requestId);
      res.status(403).json({ error: 'Forbidden: Invalid Origin header' });
      return;
    }

    const sessionId = req.get('Mcp-Session-Id');
    const body = req.body;
    log(LogLevel.INFO, `Received /mcp POST`, body, req.requestId);

    // Batch support
    const isBatch = Array.isArray(body);
    const messages = isBatch ? body : [body];
    const responses: any[] = [];

    // Handle POST: notifications/responses only
    const onlyNotificationsOrResponses = messages.every(msg => !msg.method);
    if (onlyNotificationsOrResponses) {
      // Accept and return 202
      res.status(202).end();
      return;
    }

    // If any requests, respond with SSE or JSON
    const wantsSSE = req.get('Accept') && req.get('Accept')!.includes('text/event-stream');
    if (wantsSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      let eventCounter = 0;
      const sendEvent = (event: string, data: any) => {
        const eventId = `${Date.now()}-${eventCounter++}`;
        res.write(`id: ${eventId}\n`);
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      const lastEventId = req.get('Last-Event-ID');
      if (lastEventId) {
        log(LogLevel.INFO, `Client requested stream resume from Last-Event-ID: ${lastEventId}`, {}, req.requestId);
        // TODO: Implement replay logic if required
      }
      try {
        const memoryService = await MemoryService.getInstance();
        for (const msg of messages) {
          // Strict JSON-RPC 2.0 validation
          if (!msg || msg.jsonrpc !== '2.0' || !msg.method) {
            sendEvent('error', { code: -32600, message: 'Invalid Request: Must be JSON-RPC 2.0 with method', id: msg && msg.id !== undefined ? msg.id : null });
            continue;
          }
          // Dispatch tool/resource logic by method
          const { method, params, id } = msg;
          let result, error;
          try {
            switch (method) {
              case 'init-memory-bank':
                if (!params || !params.repository) throw new Error('Missing repository parameter');
                await memoryService.initMemoryBank(params.repository, params.branch ?? 'main');
                result = { success: true, message: 'Memory bank initialized' };
                break;
              case 'get-metadata':
                if (!params || !params.repository) throw new Error('Missing repository parameter');
                result = await memoryService.getMetadata(params.repository, params.branch ?? 'main');
                if (!result) throw new Error('Metadata not found');
                break;
              // Add more MCP methods as needed
              default:
                throw new Error(`Method not implemented: ${method}`);
            }
          } catch (err: any) {
            error = { code: -32603, message: err.message };
          }
          // Send JSON-RPC response
          if (error) {
            sendEvent('result', { jsonrpc: '2.0', error, id });
          } else {
            sendEvent('result', { jsonrpc: '2.0', result, id });
          }
        }
        res.end();
      } catch (err: any) {
        log(LogLevel.ERROR, `ERROR: ${err.message || String(err)}`, err, req.requestId);
        sendEvent('error', { message: `Internal error: ${err.message || String(err)}` });
        res.end();
      }
    } else {
      // Non-streaming JSON response
      try {
        const memoryService = await MemoryService.getInstance();
        for (const msg of messages) {
          // Strict JSON-RPC 2.0 validation
          if (!msg || msg.jsonrpc !== '2.0' || !msg.method) {
            responses.push({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request: Must be JSON-RPC 2.0 with method' }, id: msg && msg.id !== undefined ? msg.id : null });
            continue;
          }
          // Dispatch tool/resource logic by method
          const { method, params, id } = msg;
          let result, error;
          try {
            switch (method) {
              case 'init-memory-bank':
                if (!params || !params.repository) throw new Error('Missing repository parameter');
                await memoryService.initMemoryBank(params.repository, params.branch ?? 'main');
                result = { success: true, message: 'Memory bank initialized' };
                break;
              case 'get-metadata':
                if (!params || !params.repository) throw new Error('Missing repository parameter');
                result = await memoryService.getMetadata(params.repository, params.branch ?? 'main');
                if (!result) throw new Error('Metadata not found');
                break;
              // Add more MCP methods as needed
              default:
                throw new Error(`Method not implemented: ${method}`);
            }
          } catch (err: any) {
            error = { code: -32603, message: err.message };
          }
          if (error) {
            responses.push({ jsonrpc: '2.0', error, id });
          } else {
            responses.push({ jsonrpc: '2.0', result, id });
          }
        }
        if (isBatch) {
          res.json(responses);
        } else {
          res.json(responses[0]);
        }
      } catch (err: any) {
        log(LogLevel.ERROR, `ERROR: ${err.message || String(err)}`, err, req.requestId);
        res.status(500).json({ error: `Internal error: ${err.message || String(err)}` });
      }
    }
  });

  // DELETE /mcp for session termination
  app.delete('/mcp', (req, res) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost').split(',');
    const origin = req.get('Origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      log(LogLevel.WARN, `Rejected DELETE /mcp due to invalid Origin: ${origin}`, {}, req.requestId);
      res.status(403).json({ error: 'Forbidden: Invalid Origin header' });
      return;
    }
    // Invalidate session (stub)
    log(LogLevel.INFO, `Session termination requested via DELETE /mcp`, {}, req.requestId);
    res.status(200).json({ success: true, message: 'Session terminated (stub)' });
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
}

// Graceful shutdown handling
let server: any;

// Handler for graceful shutdown
function gracefulShutdown(signal: string) {
  log(LogLevel.INFO, `Received ${signal}, starting graceful shutdown`);
  
  if (server) {
    // Stop accepting new connections
    server.close(() => {
      log(LogLevel.INFO, 'HTTP server closed, all connections drained');
      process.exit(0);
    });
    
    // Set a timeout to force exit if graceful shutdown takes too long
    setTimeout(() => {
      log(LogLevel.ERROR, 'Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds timeout
  } else {
    process.exit(0);
  }
}

// Start the server
if (require.main === module) {
  // Handle signals for graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  configureServer(app).then(() => {
    server = app.listen(Number(port), host as string, () => {
      log(LogLevel.INFO, `MCP HTTP Streaming Server running at http://${host}:${port}`);
      console.log(`MCP HTTP Streaming Server running at http://${host}:${port}`);
    });
    
    // Handle server errors
    server.on('error', (err: Error) => {
      log(LogLevel.ERROR, `Server error: ${err.message}`, err);
      process.exit(1);
    });
  }).catch(err => {
    log(LogLevel.ERROR, `Failed to start server: ${err.message}`, err);
    process.exit(1);
  });
}
