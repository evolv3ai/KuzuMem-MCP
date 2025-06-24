/**
 * Configuration mappings for repository analysis
 * These mappings define how package dependencies are categorized into frameworks, databases, and tools
 */
export const DEPENDENCY_MAPPINGS = {
  frameworks: {
    express: 'Express.js',
    fastify: 'Fastify',
    koa: 'Koa',
    react: 'React',
    vue: 'Vue.js',
    angular: 'Angular',
    'next.js': 'Next.js',
    nuxt: 'Nuxt.js',
    jest: 'Jest',
    vitest: 'Vitest',
    mocha: 'Mocha',
    cypress: 'Cypress',
    playwright: 'Playwright',
    '@modelcontextprotocol/sdk': 'MCP SDK',
  },
  databases: {
    mongoose: 'MongoDB',
    pg: 'PostgreSQL',
    mysql2: 'MySQL',
    sqlite3: 'SQLite',
    redis: 'Redis',
    kuzu: 'KuzuDB',
  },
  tools: {
    eslint: 'ESLint',
    prettier: 'Prettier',
    webpack: 'Webpack',
    vite: 'Vite',
    rollup: 'Rollup',
    commander: 'Commander.js',
  },
} as const;

/**
 * Configuration files that indicate specific technologies
 */
export const CONFIG_FILE_MAPPINGS = [
  { file: 'tsconfig.json', indicates: 'TypeScript' },
  { file: 'Cargo.toml', indicates: 'Rust' },
  { file: 'requirements.txt', indicates: 'Python' },
  { file: 'pyproject.toml', indicates: 'Python' },
  { file: 'Dockerfile', indicates: 'Docker' },
  { file: 'docker-compose.yml', indicates: 'Docker Compose' },
] as const;

/**
 * File extension to language mappings
 */
export const EXTENSION_LANGUAGE_MAPPINGS = {
  '.ts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.tsx': 'TypeScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.cpp': 'C++',
  '.c': 'C',
  '.cs': 'C#',
  '.php': 'PHP',
  '.rb': 'Ruby',
} as const;

/**
 * Architectural layer mappings for directory names
 */
export const LAYER_MAPPINGS = {
  src: 'Source',
  lib: 'Library',
  services: 'Service Layer',
  controllers: 'Controller Layer',
  repositories: 'Repository Layer',
  models: 'Model Layer',
  utils: 'Utility Layer',
  components: 'Component Layer',
  handlers: 'Handler Layer',
  middleware: 'Middleware Layer',
  db: 'Database Layer',
  api: 'API Layer',
} as const;

/**
 * Complexity assessment thresholds and their rationale
 */
export const COMPLEXITY_THRESHOLDS = {
  // Complexity scoring: sum of top-level directories and identified architectural layers
  simple: {
    max: 4,
    description: 'Small projects with minimal structure (< 5 components)',
  },
  moderate: {
    max: 9,
    description: 'Typical applications with clear structure (5-9 components)',
  },
  complex: {
    min: 10,
    description: 'Enterprise/monolithic applications with extensive structure (10+ components)',
  },
} as const;
