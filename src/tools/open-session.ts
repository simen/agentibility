/**
 * open_session tool - Opens a new browser session
 */

import { openSession, getSession } from '../session.js';

export const schema = {
  name: 'open_session',
  description: 'Opens a new browser tab and navigates to the specified URL. Returns session info including title and URL.',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'A unique name for this browser session (e.g., "main", "test-1")',
      },
      url: {
        type: 'string',
        description: 'The URL to navigate to',
      },
    },
    required: ['session', 'url'],
  },
};

export interface OpenSessionParams {
  session: string;
  url: string;
}

export async function handler(params: OpenSessionParams) {
  const { session: sessionId, url } = params;

  // Check if session already exists
  if (getSession(sessionId)) {
    return {
      error: `Session '${sessionId}' already exists. Use close_session to close it first, or choose a different name.`,
    };
  }

  try {
    const session = await openSession(sessionId, url);
    const title = await session.page.title();
    const finalUrl = session.page.url();

    return {
      success: true,
      session: sessionId,
      title,
      url: finalUrl,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
