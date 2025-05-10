import type { Knex } from 'knex';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Default to SQLite if not specified
const client = process.env.DB_CLIENT || 'sqlite3';

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
    directory: path.join(__dirname, 'src/db/migrations'),
  },
  useNullAsDefault: client === 'sqlite3',
};

export default config;
