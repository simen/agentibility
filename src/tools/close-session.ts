/**
 * close_session tool - Closes a browser session
 */

import { closeSession, listSessions } from '../session.js';

export const schema = {
  name: 'close_session',
  description: 'Closes a browser session and releases its resources.',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name to close',
      },
    },
    required: ['session'],
  },
};

export interface CloseSessionParams {
  session: string;
}

export async function handler(params: CloseSessionParams) {
  const { session: sessionId } = params;

  const closed = await closeSession(sessionId);

  if (!closed) {
    const available = listSessions();
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: available,
    };
  }

  return {
    success: true,
    session: sessionId,
    message: `Session '${sessionId}' closed`,
  };
}
