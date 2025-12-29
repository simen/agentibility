/**
 * Integration tests for agentibility MCP server
 *
 * Run with: npx tsx test/integration.test.ts
 */

import { startTestServer } from './test-server.js';
import {
  openSession,
  closeSession,
  getSession,
  shutdown,
  setHeadless,
} from '../src/session.js';
import { getOverview, queryElements, getSection, getElements } from '../src/browser/accessibility.js';
import { performAction } from '../src/browser/actions.js';

// Always run headless in tests
setHeadless(true);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => Promise<void>) {
  return async () => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  ✓ ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, passed: false, error: message });
      console.log(`  ✗ ${name}`);
      console.log(`    ${message}`);
    }
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log('Starting integration tests...\n');

  // Start test server
  const server = await startTestServer(3456);
  console.log(`Test server running on port ${server.port}\n`);

  try {
    // Test: Open session
    await test('can open a session', async () => {
      const session = await openSession('test-1', `http://localhost:${server.port}/search-page.html`);
      assert(session.id === 'test-1', 'Session ID should match');
      assert(session.page !== null, 'Page should exist');
    })();

    // Test: Overview
    await test('overview returns page info', async () => {
      const session = getSession('test-1');
      assert(session !== undefined, 'Session should exist');
      const overview = await getOverview(session!.page);
      assertEquals(overview.title, 'Search Page');
      assert(overview.counts.forms === 1, 'Should have 1 form');
      assert(overview.counts.headings >= 2, 'Should have at least 2 headings');
      assert(overview.landmarks.length > 0, 'Should have landmarks');
    })();

    // Test: Elements - headings
    await test('elements returns headings', async () => {
      const session = getSession('test-1');
      const result = await getElements(session!.page, 'headings');
      assertEquals(result.type, 'headings');
      assert(result.elements.length >= 2, 'Should have at least 2 headings');
      const h1 = result.elements.find((h: any) => h.level === 1);
      assert(h1 !== undefined, 'Should have an h1');
      assert(h1!.text?.includes('Search'), 'H1 should contain "Search"');
    })();

    // Test: Elements - forms
    await test('elements returns form with fields', async () => {
      const session = getSession('test-1');
      const result = await getElements(session!.page, 'forms');
      assertEquals(result.count, 1);
      const form = result.elements[0] as any;
      assertEquals(form.id, 'search-form');
      assert(form.fields.length >= 2, 'Form should have at least 2 fields');
      const searchField = form.fields.find((f: any) => f.name === 'q');
      assert(searchField !== undefined, 'Should have search field');
      assertEquals(searchField.label, 'Search term');
    })();

    // Test: Query
    await test('query extracts element structure', async () => {
      const session = getSession('test-1');
      const result = await queryElements(session!.page, 'form', 'structure', 3);
      assertEquals(result.count, 1);
      assert(result.elements !== undefined, 'Should have elements');
      assert(result.elements![0].includes('<form'), 'Should contain form tag');
    })();

    // Test: Action - fill
    await test('action fill works', async () => {
      const session = getSession('test-1');
      const result = await performAction(session!.page, {
        type: 'fill',
        selector: '#search',
        value: 'accessibility testing',
      });
      assert(result.success, 'Fill should succeed');
    })();

    // Test: Action - click (form submit)
    await test('action click submits form and updates page', async () => {
      const session = getSession('test-1');
      await performAction(session!.page, {
        type: 'click',
        selector: '#submit',
      });

      // Check that results updated
      const section = await getSection(session!.page, 'Results', 'text');
      assert(!section.error, 'Should find Results section');
      assert(section.text?.includes('accessibility testing'), 'Results should contain search term');
    })();

    // Test: Close session
    await test('can close a session', async () => {
      const closed = await closeSession('test-1');
      assert(closed, 'Close should succeed');
      assert(getSession('test-1') === undefined, 'Session should not exist');
    })();

    // Test: Article page with sections
    await test('section extraction works on article', async () => {
      await openSession('article', `http://localhost:${server.port}/article.html`);
      const session = getSession('article');
      assert(session !== undefined, 'Session should exist');

      const section = await getSection(session!.page, 'Key Principles', 'text');
      assert(!section.error, 'Should find section');
      assert(section.text?.includes('WCAG'), 'Section should mention WCAG');
      assert(section.text?.includes('Perceivable'), 'Section should mention Perceivable');

      await closeSession('article');
    })();

    // Test: Elements - tables
    await test('elements returns table info', async () => {
      await openSession('table-test', `http://localhost:${server.port}/article.html`);
      const session = getSession('table-test');
      const result = await getElements(session!.page, 'tables');
      assertEquals(result.count, 1);
      const table = result.elements[0] as any;
      assert(table.headers !== undefined, 'Table should have headers');
      assert(table.headers.includes('Element'), 'Headers should include Element');
      assert(table.rows >= 4, 'Table should have at least 4 rows');
      await closeSession('table-test');
    })();

  } finally {
    // Cleanup
    await shutdown();
    await server.close();
  }

  // Summary
  console.log('\n--- Results ---');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
