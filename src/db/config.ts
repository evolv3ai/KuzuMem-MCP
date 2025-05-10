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
let dbPath = process.env.KUZU_DB_PATH || 'memory-bank.kuzu';

// Convert to absolute path if relative
if (!path.isAbsolute(dbPath)) {
  // Always use the project root directory as base
  const projectRoot = path.resolve(__dirname, '../..');
  dbPath = path.join(projectRoot, dbPath);
}

// Store the resolved path back in environment variables for consistency
process.env.KUZU_DB_PATH = dbPath;

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
