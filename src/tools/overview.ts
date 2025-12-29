/**
 * overview tool - Get page summary with landmarks and counts
 */

import { getSession, listSessions } from '../session.js';
import { getOverview } from '../browser/accessibility.js';

export const schema = {
  name: 'overview',
  description: 'Returns a summary of the current page including title, URL, accessibility landmarks, and counts of key elements (headings, links, buttons, forms, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name to query',
      },
    },
    required: ['session'],
  },
};

export interface OverviewParams {
  session: string;
}

export async function handler(params: OverviewParams) {
  const { session: sessionId } = params;

  const session = getSession(sessionId);
  if (!session) {
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: listSessions(),
    };
  }

  try {
    return await getOverview(session.page);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
