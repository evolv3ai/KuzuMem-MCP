import knex from 'knex';
import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Default to SQLite if not specified
const client = process.env.DB_CLIENT || 'sqlite3';

// Ensure db directory exists for SQLite
const dbFilename = process.env.DB_FILENAME || path.join(__dirname, '../../memory-bank.sqlite');
if (client === 'sqlite3') {
  const dbDir = path.dirname(dbFilename);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
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
