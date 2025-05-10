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

  // Implement streamed tool calls
  app.post('/tools/:toolName/stream', (req, res) => {
    const toolName = req.params.toolName;
    const params = req.body;
    
    log(LogLevel.INFO, `Received stream request for tool: ${toolName}`, params, req.requestId);
    
    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Handler for sending stream events
    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // Process the tool call asynchronously
    (async () => {
      try {
        const memoryService = await MemoryService.getInstance();
        
        // Send start event
        sendEvent('start', { toolName });
        
        switch (toolName) {
          case 'init-memory-bank': {
            const { repository } = params || {};
            if (!repository) {
              sendEvent('error', { message: 'Missing repository parameter' });
              res.end();
              return;
            }
            
            await memoryService.initMemoryBank(repository);
            sendEvent('progress', { percentage: 100, message: 'Memory bank initialized' });
            sendEvent('result', { success: true, message: 'Memory bank initialized' });
            res.end();
            break;
          }
          
          case 'get-metadata': {
            const { repository } = params || {};
            if (!repository) {
              sendEvent('error', { message: 'Missing repository parameter' });
              res.end();
              return;
            }
            
            const metadata = await memoryService.getMetadata(repository);
            if (!metadata) {
              sendEvent('error', { message: 'Metadata not found' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 100, message: 'Metadata retrieved' });
            sendEvent('result', { metadata });
            res.end();
            break;
          }
          
          case 'update-metadata': {
            const { repository, metadata } = params || {};
            if (!repository || !metadata) {
              sendEvent('error', { message: 'Missing repository or metadata parameter' });
              res.end();
              return;
            }
            
            const updated = await memoryService.updateMetadata(repository, metadata);
            if (!updated) {
              sendEvent('error', { message: 'Failed to update metadata' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 100, message: 'Metadata updated' });
            sendEvent('result', { success: true, metadata: updated });
            res.end();
            break;
          }
          
          case 'get-context': {
            const { repository, latest = true, limit = 10 } = params || {};
            if (!repository) {
              sendEvent('error', { message: 'Missing repository parameter' });
              res.end();
              return;
            }
            
            let context;
            if (latest) {
              context = await memoryService.getTodayContext(repository);
              sendEvent('progress', { percentage: 100, message: 'Latest context retrieved' });
              sendEvent('result', { context: [context] });
            } else {
              const contexts = await memoryService.getLatestContexts(repository, limit);
              sendEvent('progress', { percentage: 100, message: `Retrieved ${contexts.length} contexts` });
              sendEvent('result', { context: contexts });
            }
            
            res.end();
            break;
          }
          
          case 'update-context': {
            const { repository, ...contextUpdate } = params || {};
            if (!repository) {
              sendEvent('error', { message: 'Missing repository parameter' });
              res.end();
              return;
            }
            
            const updated = await memoryService.updateTodayContext(repository, contextUpdate);
            if (!updated) {
              sendEvent('error', { message: 'Failed to update context' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 100, message: 'Context updated' });
            sendEvent('result', { success: true, context: updated });
            res.end();
            break;
          }
          
          case 'add-component': {
            const { repository, id, ...component } = params || {};
            if (!repository || !id) {
              sendEvent('error', { message: 'Missing repository or id parameter' });
              res.end();
              return;
            }
            
            const updated = await memoryService.upsertComponent(repository, id, component);
            if (!updated) {
              sendEvent('error', { message: 'Failed to add component' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 100, message: 'Component added' });
            sendEvent('result', { success: true, component: updated });
            res.end();
            break;
          }
          
          case 'add-decision': {
            const { repository, id, ...decision } = params || {};
            if (!repository || !id) {
              sendEvent('error', { message: 'Missing repository or id parameter' });
              res.end();
              return;
            }
            
            const updated = await memoryService.upsertDecision(repository, id, decision);
            if (!updated) {
              sendEvent('error', { message: 'Failed to add decision' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 100, message: 'Decision added' });
            sendEvent('result', { success: true, decision: updated });
            res.end();
            break;
          }
          
          case 'add-rule': {
            const { repository, id, ...rule } = params || {};
            if (!repository || !id) {
              sendEvent('error', { message: 'Missing repository or id parameter' });
              res.end();
              return;
            }
            
            const updated = await memoryService.upsertRule(repository, id, rule);
            if (!updated) {
              sendEvent('error', { message: 'Failed to add rule' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 100, message: 'Rule added' });
            sendEvent('result', { success: true, rule: updated });
            res.end();
            break;
          }
          
          case 'export-memory-bank': {
            const { repository } = params || {};
            if (!repository) {
              sendEvent('error', { message: 'Missing repository parameter' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 50, message: 'Exporting memory bank' });
            const files = await memoryService.exportMemoryBank(repository);
            
            sendEvent('progress', { percentage: 100, message: 'Export complete' });
            sendEvent('result', { files });
            res.end();
            break;
          }
          
          case 'import-memory-bank': {
            const { repository, content, type, id: itemId } = params || {};
            if (!repository || !content || !type || !itemId) {
              sendEvent('error', { message: 'Missing repository, content, type, or id parameter' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 50, message: 'Importing memory bank' });
            const success = await memoryService.importMemoryBank(repository, content, type, itemId);
            
            if (!success) {
              sendEvent('error', { message: 'Failed to import memory bank' });
              res.end();
              return;
            }
            
            sendEvent('progress', { percentage: 100, message: 'Import complete' });
            sendEvent('result', { success: true });
            res.end();
            break;
          }
          
          default: {
            sendEvent('error', { message: `Tool not implemented: ${toolName}` });
            res.end();
          }
        }
        
      } catch (err: any) {
        log(LogLevel.ERROR, `ERROR: ${err.message || String(err)}`, err, req.requestId);
        sendEvent('error', { message: `Internal error: ${err.message || String(err)}` });
        res.end();
      }
    })();
  });

  // Regular (non-streaming) tool calls
  app.post('/tools/:toolName', async (req, res) => {
    const toolName = req.params.toolName;
    const params = req.body;
    
    log(LogLevel.INFO, `Received request for tool: ${toolName}`, params, req.requestId);
    
    try {
      const memoryService = await MemoryService.getInstance();
      
      switch (toolName) {
        case 'init-memory-bank': {
          const { repository } = params || {};
          if (!repository) {
            res.json(createToolError('Missing repository parameter'));
            return;
          }
          
          await memoryService.initMemoryBank(repository);
          res.json({ success: true, message: 'Memory bank initialized' });
          break;
        }
        
        case 'get-metadata': {
          const { repository } = params || {};
          if (!repository) {
            res.json(createToolError('Missing repository parameter'));
            return;
          }
          
          const metadata = await memoryService.getMetadata(repository);
          if (!metadata) {
            res.json(createToolError('Metadata not found'));
            return;
          }
          
          res.json({ metadata });
          break;
        }
        
        // Add implementations for other tools similar to the streaming version
        // but without the streaming events
        
        default:
          res.status(404).json({ error: `Tool not implemented: ${toolName}` });
      }
      
    } catch (err: any) {
      log(LogLevel.ERROR, `ERROR: ${err.message || String(err)}`, err, req.requestId);
      res.status(500).json(createToolError(`Internal error: ${err.message || String(err)}`));
    }
  });

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Close the configureServer function
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

export default app;
