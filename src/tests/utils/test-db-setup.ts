// src/tests/utils/test-db-setup.ts
import fs from 'fs/promises';
import path from 'path';

const TEST_DB_FILENAME_DEFAULT = 'test-memory-bank.kuzu';
let testDbPath: string;

function getTestDbPath(): string {
  if (!testDbPath) {
    // Allow overriding via environment variable for flexibility in CI/different setups
    const dbFileName = process.env.E2E_TEST_DB_FILENAME || TEST_DB_FILENAME_DEFAULT;
    // Ensure it's in a writable location, e.g., relative to project root or a temp dir.
    // For simplicity, relative to project root for now.
    testDbPath = path.resolve(process.cwd(), dbFileName);
  }
  return testDbPath;
}

export async function setupTestDB(): Promise<string> {
  const currentTestDbPath = getTestDbPath();
  process.env.DB_FILENAME = currentTestDbPath; // Server will use this path

  try {
    // Check if path exists and what it is
    const stats = await fs.stat(currentTestDbPath).catch(() => null);
    if (stats) {
      if (stats.isDirectory()) {
        console.log(
          `E2E Test DB: Path ${currentTestDbPath} is a directory. Removing recursively...`,
        );
        await fs.rm(currentTestDbPath, { recursive: true, force: true });
        console.log(`E2E Test DB: Directory ${currentTestDbPath} removed.`);
      } else {
        console.log(`E2E Test DB: Path ${currentTestDbPath} is a file. Deleting...`);
        await fs.unlink(currentTestDbPath);
        console.log(`E2E Test DB: File ${currentTestDbPath} deleted.`);
      }
    }
    console.log(`E2E Test DB: Ensured path ${currentTestDbPath} is clear for KuzuDB.`);
  } catch (error: any) {
    // This catch is mainly for fs.stat if it somehow throws an unexpected error other than not found
    console.warn(`E2E Test DB: Error during pre-cleanup of ${currentTestDbPath}:`, error.message);
  }

  console.log(`E2E Test DB: Server will use KuzuDB at ${currentTestDbPath}`);
  return currentTestDbPath;
}

export async function cleanupTestDB(): Promise<void> {
  const currentTestDbPath = getTestDbPath();
  try {
    // Attempt to remove recursively in case it became a directory
    await fs.rm(currentTestDbPath, { recursive: true, force: true });
    console.log(`E2E Test DB: Cleaned up path ${currentTestDbPath}.`);
  } catch (error: any) {
    // Check if the error is because the file/directory doesn't exist, which is fine for cleanup.
    if (error.code !== 'ENOENT') {
      console.warn(`E2E Test DB: Could not clean up ${currentTestDbPath}:`, error.message);
    } else {
      console.log(`E2E Test DB: Path ${currentTestDbPath} did not exist, no cleanup needed.`);
    }
  }
}
