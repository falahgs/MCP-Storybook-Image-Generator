#!/usr/bin/env node

// Parse command line arguments
import { parseArgs } from 'node:util';

// Create a global variable to store CLI values
(global as any).__CLI_VALUES__ = {};

const cliOptions = {
  'api-key': { type: 'string' as const },
  'save-to-desktop': { type: 'boolean' as const, default: false },
  'debug': { type: 'boolean' as const, default: false },
  'help': { type: 'boolean' as const, default: false }
};

try {
  const parsedArgs = parseArgs({
    args: process.argv.slice(2),
    options: cliOptions,
    allowPositionals: true
  });

  const cliValues = parsedArgs.values;
  
  // Store parsed values in global
  (global as any).__CLI_VALUES__ = cliValues;

  // Show help and exit
  if (cliValues.help) {
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

  // Set environment variables from CLI
  if (cliValues['api-key']) {
    process.env.GEMINI_API_KEY = String(cliValues['api-key']);
    console.error('Setting API key:', process.env.GEMINI_API_KEY);
  }

  if (cliValues['save-to-desktop']) {
    process.env.SAVE_TO_DESKTOP = 'true';
  } else {
    process.env.SAVE_TO_DESKTOP = 'false';
  }

  if (cliValues['debug']) {
    process.env.DEBUG = 'true';
  } else {
    process.env.DEBUG = 'false';
  }
} catch (err) {
  console.error('Error parsing arguments:', err);
  process.exit(1);
}

// Now import the main module
import './index.js';

// This file exists to provide the shebang line required for CLI tools 