import { startServer } from './app';
// import { initializeKuzuDB } from './db/kuzu'; // Removed

// KuzuDB initialization is now handled by MemoryService on demand for each clientProjectRoot
(async () => {
  // await initializeKuzuDB(); // Removed call
  startServer();
})();
