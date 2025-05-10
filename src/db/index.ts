/**
 * Database index file for KuzuDB implementation
 * Exports the KuzuDBClient class and initialization function
 */

// Export KuzuDB client for use by repositories
import { KuzuDBClient, initializeKuzuDB } from './kuzu';

// Export the KuzuDB initialization function and KuzuDBClient class
export { KuzuDBClient, initializeKuzuDB };

/**
 * Legacy support for code that might still expect default db export
 * This will allow a smoother transition from SQLite/Knex to KuzuDB
 */
export default {
  // Noop functions that return empty arrays or null to prevent runtime errors
  // during transition from Knex to KuzuDB
  select: () => Promise.resolve([]),
  where: () => ({
    select: () => Promise.resolve([]),
    first: () => Promise.resolve(null),
    delete: () => Promise.resolve(),
    update: () => Promise.resolve()
  }),
  
  // Allow initializing KuzuDB via the exported function
  initialize: async () => {
    await initializeKuzuDB();
    console.log('KuzuDB initialized successfully');
    return {};
  }
};

