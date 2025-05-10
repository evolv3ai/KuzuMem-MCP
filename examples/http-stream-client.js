/**
 * Example client for the MCP HTTP Streaming Server
 * 
 * This example demonstrates how to connect to and interact with
 * the MCP HTTP Streaming Server using server-sent events (SSE).
 */

const EventSource = require('eventsource');
const fetch = require('node-fetch');
const readline = require('readline');

// Configuration
const BASE_URL = 'http://localhost:3000';

// Create a readline interface for interactive input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Initialize the MCP protocol connection
 */
async function initialize() {
  try {
    const response = await fetch(`${BASE_URL}/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: 'mcp',
        version: '0.6.0',
        supportedFeatures: ['tools', 'resources']
      })
    });
    
    const data = await response.json();
    console.log('MCP protocol initialized:');
    console.log(JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Failed to initialize MCP protocol:', error);
    process.exit(1);
  }
}

/**
 * List available tools
 */
async function listTools() {
  try {
    const response = await fetch(`${BASE_URL}/tools/list`);
    const data = await response.json();
    console.log('Available MCP tools:');
    console.log(JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Failed to retrieve tool list:', error);
    return null;
  }
}

/**
 * Call a tool with streaming response
 * @param {string} toolName - The name of the tool to call
 * @param {Object} parameters - Parameters to pass to the tool
 * @returns {Promise<void>}
 */
async function callToolWithStreaming(toolName, parameters) {
  console.log(`Calling tool '${toolName}' with streaming...`);
  
  try {
    // First, make the request to start the stream
    const url = `${BASE_URL}/tools/${toolName}/stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(parameters)
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    
    // Create event source for SSE
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(url);
      
      // Event handlers with proper error handling
      eventSource.addEventListener('start', event => {
        try {
          const data = JSON.parse(event.data);
          console.log(`\n[START] Tool execution started: ${data.toolName}`);
        } catch (err) {
          console.error('Error parsing start event:', err);
        }
      });
      
      eventSource.addEventListener('progress', event => {
        try {
          const data = JSON.parse(event.data);
          process.stdout.write(`\r[PROGRESS] ${data.percentage}% - ${data.message}`);
        } catch (err) {
          console.error('Error parsing progress event:', err);
        }
      });
      
      eventSource.addEventListener('result', event => {
        try {
          const data = JSON.parse(event.data);
          console.log('\n[RESULT] Tool execution completed:');
          console.log(JSON.stringify(data, null, 2));
          eventSource.close();
          resolve(data);
        } catch (err) {
          console.error('Error parsing result event:', err);
          eventSource.close();
          reject(err);
        }
      });
      
      eventSource.addEventListener('error', event => {
        try {
          // Handle SSE error events from the server
          if (event.data) {
            const data = JSON.parse(event.data);
            console.error('\n[ERROR] Tool execution failed:', data.message);
          } else {
            console.error('\n[ERROR] Unknown error during streaming');
          }
          eventSource.close();
          reject(new Error('Tool execution failed'));
        } catch (err) {
          console.error('Error parsing error event:', err);
          eventSource.close();
          reject(err);
        }
      });
      
      // Handle connection errors
      eventSource.onerror = err => {
        console.error('\n[CONNECTION ERROR] EventSource connection error');
        eventSource.close();
        reject(err);
      };
    });
  } catch (error) {
    console.error('Failed to call tool:', error);
    throw error;
  }
}

/**
 * Interactive menu for testing the MCP server
 */
async function showMenu() {
  console.log('\nMCP HTTP Streaming Client');
  console.log('========================');
  console.log('1. Initialize MCP Protocol');
  console.log('2. List available tools');
  console.log('3. Initialize Memory Bank');
  console.log('4. Get Metadata');
  console.log('5. Update Metadata');
  console.log('6. Exit');
  
  rl.question('\nSelect an option: ', async (answer) => {
    try {
      switch (answer) {
        case '1':
          await initialize();
          break;
          
        case '2':
          await listTools();
          break;
          
        case '3':
          await new Promise(resolve => {
            rl.question('Repository name: ', async (repository) => {
              try {
                await callToolWithStreaming('init-memory-bank', { repository });
              } catch (err) {
                console.error('Error initializing memory bank:', err);
              }
              resolve();
            });
          });
          break;
          
        case '4':
          await new Promise(resolve => {
            rl.question('Repository name: ', async (repository) => {
              try {
                await callToolWithStreaming('get-metadata', { repository });
              } catch (err) {
                console.error('Error getting metadata:', err);
              }
              resolve();
            });
          });
          break;
          
        case '5':
          await new Promise(resolve => {
            rl.question('Repository name: ', async (repository) => {
              try {
                await callToolWithStreaming('update-metadata', { 
                  repository, 
                  metadata: {
                    project: {
                      name: repository,
                      updated: new Date().toISOString()
                    },
                    tech_stack: {
                      language: 'TypeScript',
                      framework: 'Express',
                      datastore: 'SQLite'
                    }
                  }
                });
              } catch (err) {
                console.error('Error updating metadata:', err);
              }
              resolve();
            });
          });
          break;
          
        case '6':
          console.log('Exiting...');
          rl.close();
          process.exit(0);
          break;
          
        default:
          console.log('Invalid option');
          break;
      }
    } catch (error) {
      console.error('Error during operation:', error);
    }
    
    // Return to menu after operation completes
    showMenu();
  });
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nExiting...');
  rl.close();
  process.exit(0);
});

// Start the client
console.log('Starting MCP HTTP Streaming Client...');
showMenu();
