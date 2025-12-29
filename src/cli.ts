#!/usr/bin/env node

/**
 * Agentibility CLI
 *
 * Usage: npx agentibility [--headless=false]
 */

import { startServer } from './index.js';

const args = process.argv.slice(2);

// Parse --headless flag
let headless = true;
for (const arg of args) {
  if (arg === '--headless=false' || arg === '--no-headless') {
    headless = false;
  } else if (arg === '--headless=true' || arg === '--headless') {
    headless = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Agentibility - Accessibility for agents

Usage: npx agentibility [options]

Options:
  --headless=true   Run browser in headless mode (default)
  --headless=false  Run browser in headed mode (visible window)
  --no-headless     Same as --headless=false
  --help, -h        Show this help message

The server exposes MCP tools for web browsing:
  - open_session   Open a browser tab to a URL
  - close_session  Close a browser tab
  - overview       Get page summary (landmarks, counts)
  - query          Query elements with CSS selectors
  - section        Extract content under a heading
  - elements       List elements by type (headings, links, etc.)
  - action         Interact (click, fill, navigate, etc.)
`);
    process.exit(0);
  }
}

// Start the server
startServer({ headless }).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
