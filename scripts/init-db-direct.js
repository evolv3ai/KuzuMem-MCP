/**
 * KuzuDB Direct Initialization Script
 * 
 * This script initializes the KuzuDB database directly without going through the MCP server.
 * It uses the KuzuDB client to create the necessary graph nodes and relationships.
 * 
 * Usage: node scripts/init-db-direct.js [custom-path-to-db]
 */

// Use path module for working with file paths
const path = require('path');
const fs = require('fs');

// Load KuzuDB
const kuzu = require('kuzu');

// Get database path from command line or use default
const defaultDbPath = path.resolve(__dirname, '../memory-bank.kuzu');
const dbPath = process.argv[2] || defaultDbPath;

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created database directory: ${dbDir}`);
}

console.log(`Initializing KuzuDB at: ${dbPath}`);

// Create a database instance
const db = new kuzu.Database(dbPath);
const conn = new kuzu.Connection(db);

/**
 * Initialize the KuzuDB database with necessary nodes and relationships
 * This is a direct implementation outside the MCP server for administrative use
 */
async function initializeDatabase() {
  try {
    console.log('Initializing KuzuDB database...');
    
    // Check if repository nodes exist
    const checkRepoResult = await conn.query(
      'MATCH (r:Repository) RETURN count(r) as count'
    );
    
    const rows = await checkRepoResult.getAll();
    const count = rows.length > 0 ? rows[0].get('count') : 0;
    
    if (count === 0) {
      console.log('Creating default Repository node (main branch)...');
      
      // Create the default repository node with main branch
      await conn.query(
        `CREATE (r:Repository {
          name: 'default', 
          branch: 'main',
          id: 1, 
          created_at: datetime(), 
          updated_at: datetime()
        }) RETURN r`
      );
      
      console.log('Default Repository node created successfully!');
    } else {
      console.log(`Found ${count} existing Repository nodes. No creation needed.`);
      
      // List existing repositories
      const repoList = await conn.query('MATCH (r:Repository) RETURN r.name, r.branch');
      const repositories = await repoList.getAll();
      
      console.log('Existing repositories:');
      for (const repo of repositories) {
        console.log(`- ${repo.get('r.name')} (branch: ${repo.get('r.branch')})`);
      }
    }
    
    // Set up node label constraints and indexes
    try {
      // These are idempotent operations - will succeed even if they already exist
      console.log('Ensuring Repository lookup efficiency by name and branch...');
      await conn.query('CREATE INDEX ON Repository(name, branch) IF NOT EXISTS');
      
      console.log('Setting up node type constraints...');
      await conn.query('CREATE INDEX ON Metadata(repository_id, yaml_id) IF NOT EXISTS');
      await conn.query('CREATE INDEX ON Context(repository_id, yaml_id) IF NOT EXISTS');
      await conn.query('CREATE INDEX ON Component(repository_id, yaml_id) IF NOT EXISTS'); 
      await conn.query('CREATE INDEX ON Decision(repository_id, yaml_id) IF NOT EXISTS');
      await conn.query('CREATE INDEX ON Rule(repository_id, yaml_id) IF NOT EXISTS');
    } catch (error) {
      // Some KuzuDB versions might not support certain index operations
      // Log but continue
      console.warn('Could not create all indexes, but continuing initialization:', error.message);
    }
    
    console.log('KuzuDB initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing KuzuDB database:', error);
  }
}

// Run the initialization
initializeDatabase().then(() => {
  console.log('Database initialization script completed.');
}).catch(error => {
  console.error('Unhandled error during initialization:', error);
  process.exit(1);
});
