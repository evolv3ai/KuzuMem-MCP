import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create repositories table if it doesn't exist
  const hasRepositories = await knex.schema.hasTable('repositories');
  if (!hasRepositories) {
    await knex.schema.createTable('repositories', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  }

  // Create metadata table if it doesn't exist
  const hasMetadata = await knex.schema.hasTable('metadata');
  if (!hasMetadata) {
    await knex.schema.createTable('metadata', (table) => {
    table.increments('id').primary();
    table.integer('repository_id').unsigned().notNullable();
    table.string('yaml_id').notNullable();
    table.json('content').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
    table.unique(['repository_id', 'yaml_id']);
  });
  }

  // Create context table if it doesn't exist
  const hasContexts = await knex.schema.hasTable('contexts');
  if (!hasContexts) {
    await knex.schema.createTable('contexts', (table) => {
    table.increments('id').primary();
    table.integer('repository_id').unsigned().notNullable();
    table.string('yaml_id').notNullable();
    table.date('iso_date').notNullable();
    table.string('agent').nullable();
    table.string('related_issue').nullable();
    table.string('summary').nullable();
    table.json('decisions').nullable();
    table.json('observations').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
    table.unique(['repository_id', 'yaml_id']);
    table.index('iso_date');
  });
  }

  // Create components table if it doesn't exist
  const hasComponents = await knex.schema.hasTable('components');
  if (!hasComponents) {
    await knex.schema.createTable('components', (table) => {
    table.increments('id').primary();
    table.integer('repository_id').unsigned().notNullable();
    table.string('yaml_id').notNullable();
    table.string('name').notNullable();
    table.string('kind').nullable();
    table.json('depends_on').nullable();
    table.string('status').defaultTo('active');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
    table.unique(['repository_id', 'yaml_id']);
  });
  }

  // Create decisions table if it doesn't exist
  const hasDecisions = await knex.schema.hasTable('decisions');
  if (!hasDecisions) {
    await knex.schema.createTable('decisions', (table) => {
    table.increments('id').primary();
    table.integer('repository_id').unsigned().notNullable();
    table.string('yaml_id').notNullable();
    table.string('name').notNullable();
    table.text('context').nullable();
    table.date('date').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
    table.unique(['repository_id', 'yaml_id']);
  });
  }

  // Create rules table if it doesn't exist
  const hasRules = await knex.schema.hasTable('rules');
  if (!hasRules) {
    await knex.schema.createTable('rules', (table) => {
    table.increments('id').primary();
    table.integer('repository_id').unsigned().notNullable();
    table.string('yaml_id').notNullable();
    table.string('name').notNullable();
    table.date('created').notNullable();
    table.json('triggers').nullable();
    table.text('content').nullable();
    table.string('status').defaultTo('active');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('repository_id').references('repositories.id').onDelete('CASCADE');
    table.unique(['repository_id', 'yaml_id']);
  });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rules');
  await knex.schema.dropTableIfExists('decisions');
  await knex.schema.dropTableIfExists('components');
  await knex.schema.dropTableIfExists('contexts');
  await knex.schema.dropTableIfExists('metadata');
  await knex.schema.dropTableIfExists('repositories');
}
