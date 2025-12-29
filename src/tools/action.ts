/**
 * action tool - Perform browser actions
 */

import { getSession, listSessions } from '../session.js';
import { performAction, ActionType } from '../browser/actions.js';

export const schema = {
  name: 'action',
  description: `Perform an action on the page. Actions block until complete (Playwright auto-waits for elements).

Available actions:
- navigate: Go to a URL (requires: url)
- back: Navigate back in history
- forward: Navigate forward in history
- click: Click an element (requires: selector)
- fill: Fill a text input (requires: selector, value)
- select: Select an option in a dropdown (requires: selector, value)
- check: Check a checkbox (requires: selector)
- uncheck: Uncheck a checkbox (requires: selector)
- press: Press a key (requires: selector or value for key name)
- scroll: Scroll the page or element (optional: selector, value for direction)`,
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name',
      },
      type: {
        type: 'string',
        enum: ['navigate', 'back', 'forward', 'click', 'fill', 'select', 'check', 'uncheck', 'press', 'scroll'],
        description: 'The action to perform',
      },
      selector: {
        type: 'string',
        description: 'CSS selector for the target element (required for most actions)',
      },
      value: {
        type: 'string',
        description: 'Value for fill/select actions, key name for press, direction (up/down) for scroll',
      },
      url: {
        type: 'string',
        description: 'URL for navigate action',
      },
    },
    required: ['session', 'type'],
  },
};

export interface ActionParams {
  session: string;
  type: ActionType;
  selector?: string;
  value?: string;
  url?: string;
}

export async function handler(params: ActionParams) {
  const { session: sessionId, type, selector, value, url } = params;

  const session = getSession(sessionId);
  if (!session) {
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: listSessions(),
    };
  }

  try {
    return await performAction(session.page, { type, selector, value, url });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      action: type,
      selector: selector || null,
    };
  }
}
