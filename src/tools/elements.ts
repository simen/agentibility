/**
 * elements tool - List elements by type (rotor pattern)
 */

import { getSession, listSessions } from '../session.js';
import { getElements, ElementType } from '../browser/accessibility.js';

export const schema = {
  name: 'elements',
  description: 'Lists all elements of a specific type on the page (like a screen reader rotor). Returns accessible information about each element.',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name to query',
      },
      type: {
        type: 'string',
        enum: ['headings', 'links', 'buttons', 'forms', 'tables', 'images'],
        description: 'Type of elements to list',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of elements to return (0 = no limit). Default: 0',
      },
    },
    required: ['session', 'type'],
  },
};

export interface ElementsParams {
  session: string;
  type: ElementType;
  limit?: number;
}

export async function handler(params: ElementsParams) {
  const { session: sessionId, type, limit = 0 } = params;

  const session = getSession(sessionId);
  if (!session) {
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: listSessions(),
    };
  }

  try {
    return await getElements(session.page, type, limit);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
