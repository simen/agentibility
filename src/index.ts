/**
 * Agentibility - MCP Server for web browsing
 *
 * Accessibility for agents. Browse the web using semantic accessibility patterns.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { shutdown, setHeadless } from './session.js';

// Import tool definitions
import * as openSessionTool from './tools/open-session.js';
import * as closeSessionTool from './tools/close-session.js';
import * as overviewTool from './tools/overview.js';
import * as queryTool from './tools/query.js';
import * as sectionTool from './tools/section.js';
import * as elementsTool from './tools/elements.js';
import * as actionTool from './tools/action.js';
import * as screenshotTool from './tools/screenshot.js';
import * as diagnosticsTool from './tools/diagnostics.js';
import * as runSequenceTool from './tools/run-sequence.js';

const tools = [
  openSessionTool,
  closeSessionTool,
  overviewTool,
  queryTool,
  sectionTool,
  elementsTool,
  actionTool,
  screenshotTool,
  diagnosticsTool,
  runSequenceTool,
];

export function createServer(options: { headless?: boolean } = {}) {
  if (options.headless !== undefined) {
    setHeadless(options.headless);
  }

  const server = new Server(
    {
      name: 'agentibility',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => t.schema),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find((t) => t.schema.name === name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
          },
        ],
      };
    }

    try {
      const result = await tool.handler(args as any);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  });

  return server;
}

export async function startServer(options: { headless?: boolean } = {}) {
  const server = createServer(options);
  const transport = new StdioServerTransport();

  // Cleanup on exit
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });

  await server.connect(transport);

  return server;
}
