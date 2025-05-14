import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

/**
 * KuzuDB Configuration
 * Defines default relative paths for KuzuDB storage within a client project.
 * The absolute path is constructed at runtime by combining the client's
 * project root with these defaults.
 */

// Default to empty string for DB_RELATIVE_DIR to place DB file directly in clientProjectRoot
const KUZU_DB_RELATIVE_DIR = process.env.KUZU_DB_RELATIVE_DIR || '';
// If KUZU_DB_FILENAME is not set via environment, default to a test-specific name.
// For production/development, KUZU_DB_FILENAME should be explicitly set in .env to 'memory-bank.kuzu' or desired name.
const KUZU_DB_FILENAME = process.env.KUZU_DB_FILENAME || 'test-memory-bank.kuzu';

console.log(
  `KuzuDB default relative directory (should be empty for root placement): '${KUZU_DB_RELATIVE_DIR}'`,
);
console.log(`KuzuDB default database filename: '${KUZU_DB_FILENAME}'`);

/**
 * KuzuDB configuration object
 */
const config = {
  /**
   * Default relative directory name for storing KuzuDB instances within a project.
   * An empty string means the DB_FILENAME will be joined directly to clientProjectRoot.
   * (e.g., '')
   */
  DB_RELATIVE_DIR: KUZU_DB_RELATIVE_DIR,
  /**
   * Default filename for the KuzuDB database file.
   * (e.g., 'memory-bank.kuzu')
   */
  DB_FILENAME: KUZU_DB_FILENAME,
};

export default config;
