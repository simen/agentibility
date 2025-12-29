/**
 * section tool - Extract content under a heading
 */

import { getSession, listSessions } from '../session.js';
import { getSection } from '../browser/accessibility.js';

export const schema = {
  name: 'section',
  description: 'Extracts content from under a heading. Finds a heading containing the specified text and returns all content until the next same-or-higher level heading.',
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'The session name to query',
      },
      name: {
        type: 'string',
        description: 'Text to match in the heading (case-insensitive)',
      },
      extract: {
        type: 'string',
        enum: ['structure', 'text'],
        description: 'What to extract: "structure" or "text". Default: text',
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
    required: ['session', 'name'],
  },
};

export interface SectionParams {
  session: string;
  name: string;
  extract?: 'structure' | 'text';
  depth?: number;
  limit?: number;
}

export async function handler(params: SectionParams) {
  const {
    session: sessionId,
    name,
    extract = 'text',
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
    return await getSection(session.page, name, extract, depth, limit);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
