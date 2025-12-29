/**
 * query tool - Query elements using CSS selectors
 */

import { getSession, listSessions } from '../session.js';
import { queryElements } from '../browser/accessibility.js';

export const schema = {
  name: 'query',
  description: 'Query elements on the page using CSS selectors. Can extract structure (HTML-like representation with accessible names) or text content.',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name to query',
      },
      selector: {
        type: 'string',
        description: 'CSS selector to match elements (e.g., "main", "form", "#content")',
      },
      extract: {
        type: 'string',
        enum: ['structure', 'text'],
        description: 'What to extract: "structure" for HTML-like tree with accessible names, "text" for plain text content. Default: structure',
      },
      depth: {
        type: 'number',
        description: 'Maximum depth for structure extraction. Default: 10',
      },
      limit: {
        type: 'number',
        description: 'Character limit for text extraction (0 = no limit). Default: 0',
      },
    },
    required: ['session', 'selector'],
  },
};

export interface QueryParams {
  session: string;
  selector: string;
  extract?: 'structure' | 'text';
  depth?: number;
  limit?: number;
}

export async function handler(params: QueryParams) {
  const {
    session: sessionId,
    selector,
    extract = 'structure',
    depth = 10,
    limit = 0,
  } = params;

  const session = getSession(sessionId);
  if (!session) {
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: listSessions(),
    };
  }

  try {
    return await queryElements(session.page, selector, extract, depth, limit);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
