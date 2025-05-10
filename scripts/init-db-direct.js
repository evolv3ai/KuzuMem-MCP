// Direct database initialization script to bypass migration issues
const knex = require('knex');
const fs = require('fs');
const path = require('path');

// Database file path
const dbFilename = path.resolve(__dirname, '../memory-bank.sqlite');
console.log(`Using database at: ${dbFilename}`);

// Ensure directory exists
const dbDir = path.dirname(dbFilename);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created database directory: ${dbDir}`);
}

// Create empty database file if it doesn't exist
if (!fs.existsSync(dbFilename)) {
  fs.writeFileSync(dbFilename, '');
  console.log(`Created empty database file: ${dbFilename}`);
}

// Set file permissions to be writable by all
fs.chmodSync(dbFilename, 0o666);
console.log('Set database file permissions to 666 (rw-rw-rw-)');

// Create database connection - using singleton pattern
let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    dbInstance = knex({
      client: 'sqlite3',
      connection: {
        filename: dbFilename
      },
      useNullAsDefault: true
    });
  }
  return dbInstance;
}

const db = getDatabase();

// Initialize schema - recreating what's in the migration file
async function initializeDatabase() {
  try {
    console.log('Creating tables...');
    
    // Create repositories table
    const hasRepositories = await db.schema.hasTable('repositories');
    if (!hasRepositories) {
      await db.schema.createTable('repositories', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable().unique();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
      });
      console.log('Created repositories table');
    }

    // Create metadata table
    const hasMetadata = await db.schema.hasTable('metadata');
    if (!hasMetadata) {
      await db.schema.createTable('metadata', (table) => {
        table.increments('id').primary();
        table.integer('repository_id').unsigned().notNullable();
        table.string('yaml_id').notNullable();
        table.json('content').notNullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        
        table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
        table.unique(['repository_id', 'yaml_id']);
      });
      console.log('Created metadata table');
    }

    // Create context table
    const hasContexts = await db.schema.hasTable('contexts');
    if (!hasContexts) {
      await db.schema.createTable('contexts', (table) => {
        table.increments('id').primary();
        table.integer('repository_id').unsigned().notNullable();
        table.string('yaml_id').notNullable();
        table.date('iso_date').notNullable();
        table.string('agent').nullable();
        table.string('related_issue').nullable();
        table.string('summary').nullable();
        table.json('decisions').nullable();
        table.json('observations').nullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        
        table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
        table.unique(['repository_id', 'yaml_id']);
        table.index('iso_date');
      });
      console.log('Created contexts table');
    }

    // Create components table
    const hasComponents = await db.schema.hasTable('components');
    if (!hasComponents) {
      await db.schema.createTable('components', (table) => {
        table.increments('id').primary();
        table.integer('repository_id').unsigned().notNullable();
        table.string('yaml_id').notNullable();
        table.string('name').notNullable();
        table.string('kind').nullable();
        table.json('depends_on').nullable();
        table.string('status').defaultTo('active');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        
        table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
        table.unique(['repository_id', 'yaml_id']);
      });
      console.log('Created components table');
    }

    // Create decisions table
    const hasDecisions = await db.schema.hasTable('decisions');
    if (!hasDecisions) {
      await db.schema.createTable('decisions', (table) => {
        table.increments('id').primary();
        table.integer('repository_id').unsigned().notNullable();
        table.string('yaml_id').notNullable();
        table.string('name').notNullable();
        table.text('context').nullable();
        table.date('date').notNullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        
        table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
        table.unique(['repository_id', 'yaml_id']);
      });
      console.log('Created decisions table');
    }

    // Create rules table
    const hasRules = await db.schema.hasTable('rules');
    if (!hasRules) {
      await db.schema.createTable('rules', (table) => {
        table.increments('id').primary();
        table.integer('repository_id').unsigned().notNullable();
        table.string('yaml_id').notNullable();
        table.string('name').notNullable();
        table.date('created').notNullable();
        table.json('triggers').nullable();
        table.text('content').nullable();
        table.string('status').defaultTo('active');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        
        table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
        table.unique(['repository_id', 'yaml_id']);
      });
      console.log('Created rules table');
    }

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    await db.destroy();
  }
}

// Run the initialization
initializeDatabase();
