import knex from 'knex';
import config from './config';

// Create database instance
const db = knex(config);

export default db;
