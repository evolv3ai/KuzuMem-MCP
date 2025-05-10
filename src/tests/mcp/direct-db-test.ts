import express from 'express';
import { MemoryMcpServer } from '../../mcp';
import db from '../../db';

/**
 * Test script that examines the current database state
 * and then tests the MCP server using the existing structure
 */
async function testWithExistingDb() {
  try {
    console.log('🔍 Examining database structure...');
    
    // Check if database tables exist
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('📊 Database tables found:', tables.map((t: any) => t.name).join(', '));
    
    // Create required tables if they don't exist
    await ensureTablesExist();

    // Start the MCP server
    await startMcpServer();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Ensure all required tables exist in the database
 */
async function ensureTablesExist() {
  // Check if repositories table exists
  const hasRepositories = await hasTable('repositories');
  if (!hasRepositories) {
    console.log('📝 Creating repositories table...');
    await db.schema.createTable('repositories', table => {
      table.string('id').primary();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
  }
  
  // Check and create other tables as needed
  await ensureMetadataTableExists();
  await ensureContextsTableExists();
  await ensureComponentsTableExists();
  await ensureDecisionsTableExists();
  await ensureRulesTableExists();
  
  console.log('✅ Database structure verified');
}

async function hasTable(tableName: string): Promise<boolean> {
  const result = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName]);
  return result && result.length > 0;
}

async function ensureMetadataTableExists() {
  const exists = await hasTable('metadata');
  if (!exists) {
    console.log('📝 Creating metadata table...');
    await db.schema.createTable('metadata', table => {
      table.string('id').primary();
      table.string('repository_id').notNullable().references('id').inTable('repositories').onDelete('CASCADE');
      table.json('data').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
  }
}

async function ensureContextsTableExists() {
  const exists = await hasTable('contexts');
  if (!exists) {
    console.log('📝 Creating contexts table...');
    await db.schema.createTable('contexts', table => {
      table.string('id').primary();
      table.string('repository_id').notNullable().references('id').inTable('repositories').onDelete('CASCADE');
      table.date('date').notNullable();
      table.json('data').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.unique(['repository_id', 'date']);
    });
  }
}

async function ensureComponentsTableExists() {
  const exists = await hasTable('components');
  if (!exists) {
    console.log('📝 Creating components table...');
    await db.schema.createTable('components', table => {
      table.string('id').primary();
      table.string('repository_id').notNullable().references('id').inTable('repositories').onDelete('CASCADE');
      table.json('data').notNullable();
      table.string('status').notNullable().defaultTo('active');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.unique(['repository_id', 'id']);
    });
  }
}

async function ensureDecisionsTableExists() {
  const exists = await hasTable('decisions');
  if (!exists) {
    console.log('📝 Creating decisions table...');
    await db.schema.createTable('decisions', table => {
      table.string('id').primary();
      table.string('repository_id').notNullable().references('id').inTable('repositories').onDelete('CASCADE');
      table.json('data').notNullable();
      table.date('date').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.unique(['repository_id', 'id']);
    });
  }
}

async function ensureRulesTableExists() {
  const exists = await hasTable('rules');
  if (!exists) {
    console.log('📝 Creating rules table...');
    await db.schema.createTable('rules', table => {
      table.string('id').primary();
      table.string('repository_id').notNullable().references('id').inTable('repositories').onDelete('CASCADE');
      table.json('data').notNullable();
      table.string('status').notNullable().defaultTo('active');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.unique(['repository_id', 'id']);
    });
  }
}

/**
 * Start the MCP server
 */
async function startMcpServer() {
  // Create Express app
  const app = express();
  const port = process.env.PORT || 4000;
  
  // Parse JSON request body
  app.use(express.json());
  
  // Initialize MCP server
  console.log('🚀 Initializing MCP server...');
  const mcpServer = new MemoryMcpServer();
  const mcpRouter = await mcpServer.initialize();
  
  // Mount MCP endpoints at /mcp
  app.use('/mcp', mcpRouter);
  
  // Add a simple health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'MCP Server is running with database integration'
    });
  });
  
  // Start server
  const server = app.listen(port, () => {
    console.log(`\n✅ Direct DB Test MCP Server running at http://localhost:${port}`);
    console.log('\nAvailable endpoints:');
    console.log('  GET  /health            - Health check');
    console.log('  GET  /mcp/server        - Get MCP server metadata');
    console.log('  GET  /mcp/tools         - Get MCP tools definitions');
    console.log('\nTest MCP endpoints with curl:');
    console.log(`  curl http://localhost:${port}/mcp/server`);
    console.log(`  curl http://localhost:${port}/mcp/tools`);
    console.log(`  curl -X POST http://localhost:${port}/mcp/tools/init-memory-bank -H "Content-Type: application/json" -d '{"repository": "test-repo"}'`);
    console.log(`  curl -X POST http://localhost:${port}/mcp/tools/get-metadata -H "Content-Type: application/json" -d '{"repository": "test-repo"}'`);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down MCP test server');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// Run the test
testWithExistingDb().catch(console.error);
