import dotenv from 'dotenv';

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
// Use DB_FILENAME env var for tests, then KUZU_DB_FILENAME, then default to a test-specific name.
const KUZU_DB_FILENAME =
  process.env.DB_FILENAME || process.env.KUZU_DB_FILENAME || 'test-memory-bank.kuzu';

// Use console.error for MCP stdio server compatibility (stdout is reserved for JSON protocol)
console.error(
  `KuzuDB default relative directory (should be empty for root placement): '${KUZU_DB_RELATIVE_DIR}'`,
);
console.error(`KuzuDB default database filename: '${KUZU_DB_FILENAME}'`);

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
