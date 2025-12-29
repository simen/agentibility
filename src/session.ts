/**
 * Session management for Playwright browser instances.
 * Each session is a named browser page that agents can control.
 */

import { chromium, Browser, Page } from 'playwright';

export interface Session {
  id: string;
  page: Page;
  createdAt: Date;
}

let browser: Browser | null = null;
const sessions = new Map<string, Session>();

let headless = true;

export function setHeadless(value: boolean) {
  headless = value;
}

async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless });
  }
  return browser;
}

export async function openSession(sessionId: string, url: string): Promise<Session> {
  if (sessions.has(sessionId)) {
    throw new Error(`Session '${sessionId}' already exists`);
  }

  const b = await ensureBrowser();
  const page = await b.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const session: Session = {
    id: sessionId,
    page,
    createdAt: new Date(),
  };

  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export async function closeSession(sessionId: string): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  await session.page.close();
  sessions.delete(sessionId);

  // If no more sessions, close browser to free resources
  if (sessions.size === 0 && browser) {
    await browser.close();
    browser = null;
  }

  return true;
}

export function listSessions(): string[] {
  return Array.from(sessions.keys());
}

export async function shutdown(): Promise<void> {
  for (const session of sessions.values()) {
    await session.page.close();
  }
  sessions.clear();

  if (browser) {
    await browser.close();
    browser = null;
  }
}
