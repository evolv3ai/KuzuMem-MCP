console.log(
  'This is the main index.ts. Previously, this started the default HTTP server (src/app.ts), which has been removed. \n' +
    'Please use specific commands to start servers, e.g.: \n' +
    '  - For STDIN/STDOUT SDK server: npm run start:stdio \n' +
    '  - For HTTP Streaming server: npx ts-node src/mcp-httpstream-server.ts',
);

// // import { startServer } from './app'; // Removed
// // import { initializeKuzuDB } from './db/kuzu'; // Removed

// // KuzuDB initialization is now handled by MemoryService on demand for each clientProjectRoot
// (async () => {
//   // await initializeKuzuDB(); // Removed call
//   // startServer(); // Removed
// })();
