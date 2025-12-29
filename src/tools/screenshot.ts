/**
 * screenshot tool - Capture page screenshot
 */

import { getSession, listSessions } from '../session.js';

export const schema = {
  name: 'screenshot',
  description: 'Captures a screenshot of the current page. Returns base64-encoded PNG image data.',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name',
      },
      fullPage: {
        type: 'boolean',
        description: 'Capture full scrollable page instead of viewport only. Default: false',
      },
    },
    required: ['session'],
  },
};

export interface ScreenshotParams {
  session: string;
  fullPage?: boolean;
}

export async function handler(params: ScreenshotParams) {
  const { session: sessionId, fullPage = false } = params;

  const session = getSession(sessionId);
  if (!session) {
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: listSessions(),
    };
  }

  try {
    const buffer = await session.page.screenshot({
      type: 'png',
      fullPage,
    });

    return {
      success: true,
      image: buffer.toString('base64'),
      encoding: 'base64',
      mimeType: 'image/png',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
