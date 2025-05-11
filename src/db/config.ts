import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

/**
 * KuzuDB Configuration
 * Simple configuration for KuzuDB database path
 */

// Define a consistent absolute path for the KuzuDB database file
// This ensures the same path is used regardless of how the application is run

// Use DB_FILENAME as the primary environment variable, falling back to KUZU_DB_PATH, then a default.
let dbPath = process.env.DB_FILENAME || process.env.KUZU_DB_PATH || 'memory-bank.kuzu';

// Convert to absolute path if relative
if (!path.isAbsolute(dbPath)) {
  // Always use the project root directory as base
  const projectRoot = path.resolve(__dirname, '../..');
  dbPath = path.join(projectRoot, dbPath);
}

// Store the resolved path back in DB_FILENAME for consistency if it was set via KUZU_DB_PATH or default
if (process.env.DB_FILENAME !== dbPath) {
  process.env.DB_FILENAME = dbPath;
}
// Also update KUZU_DB_PATH for any part of the code that might still use it, though DB_FILENAME is preferred now.
if (process.env.KUZU_DB_PATH !== dbPath) {
  process.env.KUZU_DB_PATH = dbPath;
}

// Ensure database directory exists
const dbDir = path.dirname(dbPath);

// Create directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created KuzuDB directory: ${dbDir}`);
}

// Log the database path for debugging
console.log(`Using KuzuDB database at: ${dbPath}`);

/**
 * KuzuDB configuration object
 */
const config = {
  dbPath,
  // Add any additional KuzuDB configuration properties here if needed
};

export default config;
