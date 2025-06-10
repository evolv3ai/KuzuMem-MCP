#!/usr/bin/env npx ts-node

/**
 * Test script to verify database connection recovery
 * This tests that the memory bank can handle existing databases properly
 * even after rebuilds or connection issues
 */

import { MemoryService } from './src/services/memory.service';
import path from 'path';

const TEST_PROJECT_ROOT = path.join(__dirname, 'test-memory-bank-recovery');
const TEST_REPO_NAME = 'test-recovery-repo';
const TEST_BRANCH = 'main';

// Mock MCP context for testing
const createMockContext = () => ({
  logger: console,
  session: {
    clientProjectRoot: TEST_PROJECT_ROOT,
    repository: TEST_REPO_NAME,
    branch: TEST_BRANCH,
  },
  sendProgress: async (progress: any) => {
    console.log(`[PROGRESS] ${progress.status}: ${progress.message} (${progress.percent}%)`);
  },
  memoryService: null as any,
  signal: new AbortController().signal,
  requestId: 'test-request-id',
  sendNotification: async (notification: any) => {
    console.log('[NOTIFICATION]', notification);
  },
  sendRequest: async (request: any) => {
    console.log('[REQUEST]', request);
    return {};
  },
});

async function runTest() {
  console.log('=== Database Connection Recovery Test ===\n');
  
  try {
    // Step 1: Initialize memory bank for the first time
    console.log('Step 1: Initializing memory bank for the first time...');
    const memoryService1 = await MemoryService.getInstance();
    const context1 = createMockContext();
    
    const initResult1 = await memoryService1.initMemoryBank(
      context1,
      TEST_PROJECT_ROOT,
      TEST_REPO_NAME,
      TEST_BRANCH
    );
    
    if (!initResult1.success) {
      throw new Error(`First initialization failed: ${initResult1.message}`);
    }
    console.log(`✓ First initialization successful at: ${initResult1.dbPath}\n`);

    // Step 2: Add some test data
    console.log('Step 2: Adding test component...');
    const componentResult = await memoryService1.upsertComponent(
      context1,
      TEST_PROJECT_ROOT,
      TEST_REPO_NAME,
      TEST_BRANCH,
      {
        id: 'comp-TestService',
        name: 'Test Service',
        kind: 'service',
        status: 'active',
      }
    );
    
    if (!componentResult) {
      throw new Error('Failed to create test component');
    }
    console.log(`✓ Test component created: ${componentResult.name}\n`);

    // Step 3: Simulate connection cleanup (like after a rebuild)
    console.log('Step 3: Simulating connection cleanup...');
    await memoryService1.shutdown();
    console.log('✓ Connections closed\n');

    // Step 4: Wait a moment to simulate rebuild time
    console.log('Step 4: Waiting 2 seconds to simulate rebuild...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✓ Wait complete\n');

    // Step 5: Re-initialize with existing database
    console.log('Step 5: Re-initializing with existing database...');
    const memoryService2 = await MemoryService.getInstance();
    const context2 = createMockContext();
    
    const initResult2 = await memoryService2.initMemoryBank(
      context2,
      TEST_PROJECT_ROOT,
      TEST_REPO_NAME,
      TEST_BRANCH
    );
    
    if (!initResult2.success) {
      throw new Error(`Re-initialization failed: ${initResult2.message}`);
    }
    console.log(`✓ Re-initialization successful\n`);

    // Step 6: Verify data persistence
    console.log('Step 6: Verifying data persistence...');
    const components = await memoryService2.getActiveComponents(
      context2,
      TEST_PROJECT_ROOT,
      TEST_REPO_NAME,
      TEST_BRANCH
    );
    
    const foundComponent = components.find(c => c.id === 'comp-TestService');
    if (!foundComponent) {
      throw new Error('Test component not found after re-initialization');
    }
    console.log(`✓ Test component found: ${foundComponent.name}\n`);

    // Step 7: Test rapid re-initialization (should use cached connection)
    console.log('Step 7: Testing rapid re-initialization...');
    const startTime = Date.now();
    
    const initResult3 = await memoryService2.initMemoryBank(
      context2,
      TEST_PROJECT_ROOT,
      TEST_REPO_NAME,
      TEST_BRANCH
    );
    
    const elapsed = Date.now() - startTime;
    if (!initResult3.success) {
      throw new Error(`Rapid re-initialization failed: ${initResult3.message}`);
    }
    console.log(`✓ Rapid re-initialization successful (${elapsed}ms)\n`);

    // Cleanup
    console.log('Cleaning up...');
    await memoryService2.shutdown();
    
    console.log('\n=== TEST PASSED ===');
    console.log('The memory bank successfully handles existing databases');
    console.log('and recovers from connection issues without data loss.');
    
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
runTest().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});