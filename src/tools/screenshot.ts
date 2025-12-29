/**
 * screenshot tool - Capture page screenshot
 */

import { getSession, listSessions } from '../session.js';

export const schema = {
  name: 'screenshot',
  description: 'Captures a screenshot of the current page or a specific element. Returns base64-encoded PNG image data.',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name',
      },
      selector: {
        type: 'string',
        description: 'CSS selector for a specific element to capture. If omitted, captures the full page/viewport.',
      },
      fullPage: {
        type: 'boolean',
        description: 'Capture full scrollable page instead of viewport only. Ignored if selector is provided. Default: false',
      },
    },
    required: ['session'],
  },
};

export interface ScreenshotParams {
  session: string;
  selector?: string;
  fullPage?: boolean;
}

export async function handler(params: ScreenshotParams) {
  const { session: sessionId, selector, fullPage = false } = params;

  const session = getSession(sessionId);
  if (!session) {
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: listSessions(),
    };
  }

  try {
    let buffer: Buffer;

    if (selector) {
      // Capture specific element
      const element = session.page.locator(selector);
      buffer = await element.screenshot({ type: 'png' });
    } else {
      // Capture page/viewport
      buffer = await session.page.screenshot({
        type: 'png',
        fullPage,
      });
    }

    // Return special format for MCP image content block
    return {
      _type: 'image',
      data: buffer.toString('base64'),
      mimeType: 'image/png',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      selector: selector || null,
    };
  }
}
