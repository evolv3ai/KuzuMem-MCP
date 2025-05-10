import knex from 'knex';
import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Default to SQLite if not specified
const client = process.env.DB_CLIENT || 'sqlite3';

// Define a consistent absolute path for the database file
// This ensures the same path is used regardless of how the application is run
let dbFilename = process.env.DB_FILENAME || 'memory-bank.sqlite';

// Convert to absolute path if relative
if (!path.isAbsolute(dbFilename)) {
  // Always use the project root directory as base
  const projectRoot = path.resolve(__dirname, '../..');
  dbFilename = path.join(projectRoot, dbFilename);
}

// Store the resolved path back in environment variables for consistency
process.env.DB_FILENAME = dbFilename;

// Ensure database directory exists
if (client === 'sqlite3') {
  const dbDir = path.dirname(dbFilename);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created database directory: ${dbDir}`);
  }
  
  // Log the database path for debugging
  console.log(`Using SQLite database at: ${dbFilename}`);
}

const config: Knex.Config = {
  client,
  connection: client === 'sqlite3' 
    ? {
        filename: dbFilename
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'memory_bank',
      },
  migrations: {
    tableName: 'knex_migrations',
    directory: path.join(__dirname, 'migrations'),
  },
  useNullAsDefault: client === 'sqlite3',
};

export default config;
