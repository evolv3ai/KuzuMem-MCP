import type { Knex } from 'knex';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Default to SQLite if not specified
const client = process.env.DB_CLIENT || 'sqlite3';

// Ensure SQLite database file exists if using SQLite
if (client === 'sqlite3') {
  const dbFilename = process.env.DB_FILENAME || path.join(__dirname, 'memory-bank.sqlite');
  
  // Create an absolute path if it's relative
  const absoluteDbPath = path.isAbsolute(dbFilename) 
    ? dbFilename 
    : path.resolve(__dirname, dbFilename);
  
  // Ensure directory exists
  const dbDir = path.dirname(absoluteDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created database directory: ${dbDir}`);
  }
  
  // Create empty database file if it doesn't exist
  if (!fs.existsSync(absoluteDbPath)) {
    fs.writeFileSync(absoluteDbPath, '');
    console.log(`Created empty database file: ${absoluteDbPath}`);
  }
  
  // Override DB_FILENAME with absolute path
  process.env.DB_FILENAME = absoluteDbPath;
}

const config: Knex.Config = {
  client,
  connection: client === 'sqlite3' 
    ? {
        filename: process.env.DB_FILENAME || path.join(__dirname, 'memory-bank.sqlite'),
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
    // Look for migrations in both src (for TS files) and dist (for compiled JS files)
    directory: [
      path.join(__dirname, 'src/db/migrations'),
      path.join(__dirname, 'dist/db/migrations')
    ],
    // Migration file extensions to load (both .ts and .js)
    loadExtensions: ['.ts', '.js'],
  },
  useNullAsDefault: client === 'sqlite3',
};

export default config;
