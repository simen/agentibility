/**
 * run_sequence tool - Execute a batch of browser operations and assertions
 *
 * Runs a sequence of steps (actions, assertions, queries) in order,
 * stopping on first failure. Returns a chronological event log.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Page, ConsoleMessage, Request, Response } from 'playwright';
import { getSession, listSessions, Session } from '../session.js';
import { performAction, ActionType } from '../browser/actions.js';
import { checkAssertion, AssertCondition, describeCondition } from '../browser/assertions.js';
import { getOverview } from '../browser/accessibility.js';

// Ensure screenshots directory exists
const screenshotsDir = join(tmpdir(), 'agentibility-screenshots');
try {
  mkdirSync(screenshotsDir, { recursive: true });
} catch {
  // Directory may already exist
}

// Step types
export interface ActionStep {
  type: 'action';
  action: ActionType;
  selector?: string;
  value?: string;
  url?: string;
}

export interface AssertStep {
  type: 'assert';
  condition: AssertCondition;
}

export interface QueryStep {
  type: 'query';
  query: 'overview' | 'screenshot';
  params?: {
    selector?: string;
    fullPage?: boolean;
  };
}

export type Step = ActionStep | AssertStep | QueryStep;

// Capture options
export interface ConsoleCapture {
  enabled: boolean;
  level?: 'all' | 'warn' | 'error';
  filter?: string;
}

export interface NetworkCapture {
  enabled: boolean;
  filter?: string;
  includeBody?: boolean;
}

export interface RunSequenceOptions {
  console?: ConsoleCapture;
  network?: NetworkCapture;
}

// Event types
export interface StepEvent {
  type: 'step';
  index: number;
  step: Step;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
    duration_ms: number;
  };
  timestamp: string;
}

export interface NavigationEvent {
  type: 'navigation';
  from: string;
  to: string;
  timestamp: string;
}

export interface ConsoleEvent {
  type: 'console';
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
}

export interface NetworkEvent {
  type: 'network';
  method: string;
  url: string;
  status?: number;
  error?: string;
  timing?: number;
  timestamp: string;
}

export type Event = StepEvent | NavigationEvent | ConsoleEvent | NetworkEvent;

// Result
export interface RunSequenceResult {
  success: boolean;
  completed: number;
  total: number;
  failed_at?: number;
  failure_reason?: string;
  events: Event[];
  final_state: {
    url: string;
    title: string;
  };
}

export const schema = {
  name: 'run_sequence',
  description: `Execute a sequence of browser operations and assertions in a single call.

Returns a chronological event log of everything that happened - actions, assertions, browser events interleaved.

Step types:
- action: Browser actions (navigate, click, fill, select, check, uncheck, press, scroll, highlight)
- assert: Conditions that fail the sequence if not met (url_contains, element_exists, etc.)
- query: Capture page state mid-sequence (overview, screenshot)

Assertion conditions:
- url_contains, url_equals: Check current URL
- title_contains, title_equals: Check page title
- element_exists, element_not_exists, element_visible: Check element presence
- element_text_contains: Check element contains text
- element_count, element_count_gte, element_count_lte: Check element counts

Options:
- console: Capture console logs (level: 'all'|'warn'|'error', filter: regex)
- network: Capture network requests (filter: regex for URL)

Stops on first assertion failure or action error.`,
  inputSchema: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        description: 'Browser session ID',
      },
      steps: {
        type: 'array',
        description: 'Ordered list of operations to execute',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['action', 'assert', 'query'],
              description: 'Step type',
            },
            action: {
              type: 'string',
              enum: ['navigate', 'back', 'forward', 'click', 'fill', 'select', 'check', 'uncheck', 'press', 'scroll', 'highlight'],
              description: 'Action type (for action steps)',
            },
            condition: {
              type: 'object',
              description: 'Assertion condition (for assert steps)',
            },
            query: {
              type: 'string',
              enum: ['overview', 'screenshot'],
              description: 'Query type (for query steps)',
            },
            selector: { type: 'string' },
            value: { type: 'string' },
            url: { type: 'string' },
            params: { type: 'object' },
          },
          required: ['type'],
        },
      },
      options: {
        type: 'object',
        description: 'Capture options for console and network events',
        properties: {
          console: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              level: { type: 'string', enum: ['all', 'warn', 'error'] },
              filter: { type: 'string', description: 'Regex pattern to filter messages' },
            },
          },
          network: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              filter: { type: 'string', description: 'Regex pattern to filter URLs' },
              includeBody: { type: 'boolean' },
            },
          },
        },
      },
    },
    required: ['session', 'steps'],
  },
};

export interface RunSequenceParams {
  session: string;
  steps: Step[];
  options?: RunSequenceOptions;
}

// Console level priority for filtering
const consoleLevelPriority: Record<string, number> = {
  debug: 0,
  log: 1,
  info: 2,
  warn: 3,
  warning: 3,
  error: 4,
};

function shouldCaptureConsole(
  level: string,
  message: string,
  options?: ConsoleCapture
): boolean {
  if (!options?.enabled) return false;

  // Level filter
  const minLevel = options.level || 'all';
  if (minLevel !== 'all') {
    const minPriority = minLevel === 'warn' ? 3 : minLevel === 'error' ? 4 : 0;
    const msgPriority = consoleLevelPriority[level] ?? 1;
    if (msgPriority < minPriority) return false;
  }

  // Regex filter
  if (options.filter) {
    try {
      const regex = new RegExp(options.filter);
      if (!regex.test(message)) return false;
    } catch {
      // Invalid regex, skip filter
    }
  }

  return true;
}

function shouldCaptureNetwork(url: string, options?: NetworkCapture): boolean {
  if (!options?.enabled) return false;

  // Regex filter
  if (options.filter) {
    try {
      const regex = new RegExp(options.filter);
      if (!regex.test(url)) return false;
    } catch {
      // Invalid regex, skip filter
    }
  }

  return true;
}

export async function handler(params: RunSequenceParams): Promise<RunSequenceResult | { error: string; availableSessions?: string[] }> {
  const { session: sessionId, steps, options } = params;

  const session = getSession(sessionId);
  if (!session) {
    return {
      error: `Session '${sessionId}' not found`,
      availableSessions: listSessions(),
    };
  }

  const page = session.page;
  const events: Event[] = [];
  let lastUrl = page.url();
  const pendingRequests = new Map<string, { start: number; method: string; url: string }>();

  // Set up event listeners
  const consoleHandler = (msg: ConsoleMessage) => {
    const level = msg.type() as ConsoleEvent['level'];
    const message = msg.text();
    if (shouldCaptureConsole(level, message, options?.console)) {
      events.push({
        type: 'console',
        level,
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const requestHandler = (req: Request) => {
    const url = req.url();
    if (shouldCaptureNetwork(url, options?.network)) {
      const requestId = `${url}-${Date.now()}-${Math.random()}`;
      pendingRequests.set(requestId, {
        start: Date.now(),
        method: req.method(),
        url,
      });
      (req as any)._seqRequestId = requestId;
    }
  };

  const responseHandler = (res: Response) => {
    const req = res.request();
    const requestId = (req as any)._seqRequestId;
    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId)!;
      events.push({
        type: 'network',
        method: pending.method,
        url: pending.url,
        status: res.status(),
        timing: Date.now() - pending.start,
        timestamp: new Date().toISOString(),
      });
      pendingRequests.delete(requestId);
    }
  };

  const requestFailedHandler = (req: Request) => {
    const requestId = (req as any)._seqRequestId;
    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId)!;
      events.push({
        type: 'network',
        method: pending.method,
        url: pending.url,
        error: req.failure()?.errorText || 'Request failed',
        timing: Date.now() - pending.start,
        timestamp: new Date().toISOString(),
      });
      pendingRequests.delete(requestId);
    }
  };

  const frameNavigatedHandler = (frame: any) => {
    if (frame === page.mainFrame()) {
      const newUrl = page.url();
      if (newUrl !== lastUrl) {
        events.push({
          type: 'navigation',
          from: lastUrl,
          to: newUrl,
          timestamp: new Date().toISOString(),
        });
        lastUrl = newUrl;
      }
    }
  };

  // Attach listeners
  if (options?.console?.enabled) {
    page.on('console', consoleHandler);
  }
  if (options?.network?.enabled) {
    page.on('request', requestHandler);
    page.on('response', responseHandler);
    page.on('requestfailed', requestFailedHandler);
  }
  page.on('framenavigated', frameNavigatedHandler);

  let completed = 0;
  let failedAt: number | undefined;
  let failureReason: string | undefined;

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const startTime = Date.now();

      try {
        const result = await executeStep(page, step);
        const duration = Date.now() - startTime;

        events.push({
          type: 'step',
          index: i,
          step,
          result: {
            success: result.success,
            data: result.data,
            error: result.error,
            duration_ms: duration,
          },
          timestamp: new Date().toISOString(),
        });

        if (!result.success) {
          failedAt = i;
          failureReason = result.error || 'Step failed';
          break;
        }

        completed++;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        events.push({
          type: 'step',
          index: i,
          step,
          result: {
            success: false,
            error: errorMessage,
            duration_ms: duration,
          },
          timestamp: new Date().toISOString(),
        });

        failedAt = i;
        failureReason = errorMessage;
        break;
      }
    }
  } finally {
    // Clean up listeners
    if (options?.console?.enabled) {
      page.off('console', consoleHandler);
    }
    if (options?.network?.enabled) {
      page.off('request', requestHandler);
      page.off('response', responseHandler);
      page.off('requestfailed', requestFailedHandler);
    }
    page.off('framenavigated', frameNavigatedHandler);
  }

  return {
    success: failedAt === undefined,
    completed,
    total: steps.length,
    failed_at: failedAt,
    failure_reason: failureReason,
    events,
    final_state: {
      url: page.url(),
      title: await page.title(),
    },
  };
}

interface StepExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function executeStep(page: Page, step: Step): Promise<StepExecutionResult> {
  switch (step.type) {
    case 'action':
      return executeAction(page, step);
    case 'assert':
      return executeAssert(page, step);
    case 'query':
      return executeQuery(page, step);
    default:
      return { success: false, error: `Unknown step type: ${(step as any).type}` };
  }
}

async function executeAction(page: Page, step: ActionStep): Promise<StepExecutionResult> {
  const result = await performAction(page, {
    type: step.action,
    selector: step.selector,
    value: step.value,
    url: step.url,
  });

  if ('error' in result && result.error) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result };
}

async function executeAssert(page: Page, step: AssertStep): Promise<StepExecutionResult> {
  const result = await checkAssertion(page, step.condition);

  if (!result.success) {
    const description = describeCondition(step.condition);
    return {
      success: false,
      error: result.error || `Assertion failed: ${description}`,
      data: result,
    };
  }

  return { success: true, data: result };
}

async function executeQuery(page: Page, step: QueryStep): Promise<StepExecutionResult> {
  switch (step.query) {
    case 'overview': {
      const overview = await getOverview(page);
      return { success: true, data: overview };
    }

    case 'screenshot': {
      const params = step.params || {};
      let buffer: Buffer;

      if (params.selector) {
        const element = page.locator(params.selector);
        buffer = await element.screenshot({ type: 'png' });
      } else {
        buffer = await page.screenshot({
          type: 'png',
          fullPage: params.fullPage || false,
        });
      }

      const filename = join(screenshotsDir, `sequence-${Date.now()}.png`);
      writeFileSync(filename, buffer);

      return {
        success: true,
        data: { path: filename, size: buffer.length },
      };
    }

    default:
      return { success: false, error: `Unknown query type: ${step.query}` };
  }
}
