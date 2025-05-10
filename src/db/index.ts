import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import config from './config';

// Singleton instance for database
let dbInstance: Knex | null = null;

/**
 * Initialize database with migrations
 * This ensures the database file is created and schema is up-to-date
 */
export const initializeDatabase = async (): Promise<Knex> => {
  if (dbInstance) {
    return dbInstance;
  }
  
  // Ensure SQLite directory exists
  if (config.client === 'sqlite3' && config.connection && typeof config.connection === 'object') {
    const filename = (config.connection as any).filename;
    if (filename) {
      const dbDir = path.dirname(filename);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Create an empty file if it doesn't exist
      if (!fs.existsSync(filename)) {
        fs.writeFileSync(filename, '');
      }
    }
  }
  
  // Create database instance
  dbInstance = knex(config);
  
  // Run migrations
  try {
    await dbInstance.migrate.latest();
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running database migrations:', error);
    throw error;
  }
  
  return dbInstance;
};

// Create lazy-loaded database instance
const db = knex(config);

// Ensure migrations are run when imported
initializeDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
});

export default db;
