import { startServer } from './app';
import { initializeKuzuDB } from './db/kuzu';

// Ensure KuzuDB schema is created before server starts
(async () => {
  await initializeKuzuDB();
  startServer();
})();
