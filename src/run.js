#!/usr/bin/env node

// Simple script to run the server with environment variables

const { spawn } = require('child_process');
const path = require('path');
const { parseArgs } = require('node:util');

// Parse command line arguments
const options = {
  'api-key': { type: 'string' },
  'save-to-desktop': { type: 'boolean', default: false },
  'debug': { type: 'boolean', default: false },
  'help': { type: 'boolean', default: false }
};

try {
  const { values } = parseArgs({ 
    args: process.argv.slice(2),
    options,
    allowPositionals: true
  });

  // Show help and exit
  if (values.help) {
    console.log(`
MCP Storybook Image Generator

Usage:
  npx mcp-storybook-image-generator [options]

Options:
  --api-key <key>        Set the Gemini API key
  --save-to-desktop      Save generated files to desktop
  --debug                Enable debug logging
  --help                 Show this help message
`);
    process.exit(0);
  }

  // Prepare environment for child process
  const env = { ...process.env };
  
  if (values['api-key']) {
    env.GEMINI_API_KEY = values['api-key'];
  }
  
  if (values['save-to-desktop'] !== undefined) {
    env.SAVE_TO_DESKTOP = values['save-to-desktop'].toString();
  }
  
  if (values['debug'] !== undefined) {
    env.DEBUG = values['debug'].toString();
  }

  // Get the directory of the current file
  const scriptDir = __dirname;
  
  // Path to the server module
  const serverPath = path.join(scriptDir, 'index.js');
  
  // Run the server as a child process with the environment variables
  const server = spawn('node', [serverPath], {
    env,
    stdio: 'inherit'
  });
  
  // Exit with the same code when the server exits
  server.on('close', (code) => {
    process.exit(code || 0);
  });
  
  // Handle errors
  server.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
} 