/**
 * screenshot tool - Capture page screenshot
 *
 * Always saves to disk to avoid context window bloat from base64 data.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getSession, listSessions } from '../session.js';

// Ensure screenshots directory exists
const screenshotsDir = join(tmpdir(), 'agentibility-screenshots');
try {
  mkdirSync(screenshotsDir, { recursive: true });
} catch {
  // Directory may already exist
}

export const schema = {
  name: 'screenshot',
  description: 'Captures a screenshot of the current page or a specific element. Saves to disk and returns the file path.',
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
      savePath: {
        type: 'string',
        description: 'Custom file path to save the PNG. If omitted, saves to a temp directory.',
      },
    },
    required: ['session'],
  },
};

export interface ScreenshotParams {
  session: string;
  selector?: string;
  fullPage?: boolean;
  savePath?: string;
}

export async function handler(params: ScreenshotParams) {
  const { session: sessionId, selector, fullPage = false, savePath } = params;

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

    // Determine save path - use provided path or generate temp path
    const filename = savePath || join(screenshotsDir, `screenshot-${Date.now()}.png`);
    writeFileSync(filename, buffer);

    return {
      success: true,
      path: filename,
      size: buffer.length,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      selector: selector || null,
    };
  }
}
