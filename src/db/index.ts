/**
 * Database index file for KuzuDB implementation
 * Exports the KuzuDBClient class and initialization function
 */

// Export KuzuDB client for use by repositories
import { KuzuDBClient } from './kuzu';
import * as config from './config';

// Export the KuzuDBClient class and config
export { KuzuDBClient, config };
