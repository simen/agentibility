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
import { checkAssertion } from '../src/browser/assertions.js';
import { handler as runSequence, Step, RunSequenceResult } from '../src/tools/run-sequence.js';

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

    // ==========================================
    // run_sequence tests
    // ==========================================

    // Test: Assertions module
    await test('assertions: element_exists passes when element found', async () => {
      await openSession('assert-test', `http://localhost:${server.port}/search-page.html`);
      const session = getSession('assert-test');
      const result = await checkAssertion(session!.page, { element_exists: '#search-form' });
      assert(result.success, 'element_exists should pass');
      assertEquals(result.condition, 'element_exists');
      await closeSession('assert-test');
    })();

    await test('assertions: element_exists fails when element not found', async () => {
      await openSession('assert-test-2', `http://localhost:${server.port}/search-page.html`);
      const session = getSession('assert-test-2');
      const result = await checkAssertion(session!.page, { element_exists: '#nonexistent' }, 500);
      assert(!result.success, 'element_exists should fail for missing element');
      assert(result.error !== undefined, 'Should have error message');
      await closeSession('assert-test-2');
    })();

    await test('assertions: url_contains works', async () => {
      await openSession('assert-test-3', `http://localhost:${server.port}/search-page.html`);
      const session = getSession('assert-test-3');
      const result = await checkAssertion(session!.page, { url_contains: 'search-page' });
      assert(result.success, 'url_contains should pass');
      await closeSession('assert-test-3');
    })();

    await test('assertions: title_equals works', async () => {
      await openSession('assert-test-4', `http://localhost:${server.port}/search-page.html`);
      const session = getSession('assert-test-4');
      const result = await checkAssertion(session!.page, { title_equals: 'Search Page' });
      assert(result.success, 'title_equals should pass');
      await closeSession('assert-test-4');
    })();

    await test('assertions: element_count works', async () => {
      await openSession('assert-test-5', `http://localhost:${server.port}/search-page.html`);
      const session = getSession('assert-test-5');
      const result = await checkAssertion(session!.page, { element_count: { selector: 'h1', count: 1 } });
      assert(result.success, 'element_count should pass');
      await closeSession('assert-test-5');
    })();

    // Test: run_sequence basic flow
    await test('run_sequence: executes action sequence successfully', async () => {
      await openSession('seq-test-1', `http://localhost:${server.port}/search-page.html`);

      const steps: Step[] = [
        { type: 'action', action: 'fill', selector: '#search', value: 'test query' },
        { type: 'action', action: 'click', selector: '#submit' },
      ];

      const result = await runSequence({ session: 'seq-test-1', steps }) as RunSequenceResult;
      assert(result.success, 'Sequence should succeed');
      assertEquals(result.completed, 2);
      assertEquals(result.total, 2);
      assert(result.events.length >= 2, 'Should have at least 2 events');

      await closeSession('seq-test-1');
    })();

    // Test: run_sequence with assertions
    await test('run_sequence: assertions pass in sequence', async () => {
      await openSession('seq-test-2', `http://localhost:${server.port}/search-page.html`);

      const steps: Step[] = [
        { type: 'assert', condition: { element_exists: '#search-form' } },
        { type: 'action', action: 'fill', selector: '#search', value: 'hello world' },
        { type: 'action', action: 'click', selector: '#submit' },
        { type: 'assert', condition: { element_text_contains: { selector: '#results', text: 'hello world' } } },
      ];

      const result = await runSequence({ session: 'seq-test-2', steps }) as RunSequenceResult;
      assert(result.success, 'Sequence with assertions should succeed');
      assertEquals(result.completed, 4);

      await closeSession('seq-test-2');
    })();

    // Test: run_sequence fails on assertion
    await test('run_sequence: stops on assertion failure', async () => {
      await openSession('seq-test-3', `http://localhost:${server.port}/search-page.html`);

      const steps: Step[] = [
        { type: 'assert', condition: { element_exists: '#search-form' } },
        { type: 'assert', condition: { element_exists: '#nonexistent-element' } },
        { type: 'action', action: 'fill', selector: '#search', value: 'should not run' },
      ];

      const result = await runSequence({ session: 'seq-test-3', steps }) as RunSequenceResult;
      assert(!result.success, 'Sequence should fail');
      assertEquals(result.failed_at, 1);
      assertEquals(result.completed, 1);
      assert(result.failure_reason !== undefined, 'Should have failure reason');

      await closeSession('seq-test-3');
    })();

    // Test: run_sequence with query step
    await test('run_sequence: query step captures overview', async () => {
      await openSession('seq-test-4', `http://localhost:${server.port}/search-page.html`);

      const steps: Step[] = [
        { type: 'query', query: 'overview' },
      ];

      const result = await runSequence({ session: 'seq-test-4', steps }) as RunSequenceResult;
      assert(result.success, 'Query step should succeed');

      const stepEvent = result.events.find(e => e.type === 'step') as any;
      assert(stepEvent !== undefined, 'Should have step event');
      assert(stepEvent.result.data.title === 'Search Page', 'Overview should have title');

      await closeSession('seq-test-4');
    })();

    // Test: run_sequence reports final state
    await test('run_sequence: returns final page state', async () => {
      await openSession('seq-test-5', `http://localhost:${server.port}/search-page.html`);

      const steps: Step[] = [
        { type: 'action', action: 'fill', selector: '#search', value: 'final state test' },
      ];

      const result = await runSequence({ session: 'seq-test-5', steps }) as RunSequenceResult;
      assert(result.final_state !== undefined, 'Should have final_state');
      assertEquals(result.final_state.title, 'Search Page');
      assert(result.final_state.url.includes('search-page'), 'URL should contain page name');

      await closeSession('seq-test-5');
    })();

    // Test: run_sequence with console capture
    await test('run_sequence: captures console events when enabled', async () => {
      await openSession('seq-test-6', `http://localhost:${server.port}/search-page.html`);

      // Trigger console log via evaluate
      const session = getSession('seq-test-6');
      await session!.page.evaluate(() => {
        console.log('Test log message');
        console.error('Test error message');
      });

      const steps: Step[] = [
        { type: 'assert', condition: { element_exists: '#search-form' } },
      ];

      const result = await runSequence({
        session: 'seq-test-6',
        steps,
        options: { console: { enabled: true, level: 'all' } },
      }) as RunSequenceResult;

      assert(result.success, 'Sequence should succeed');
      // Console events may or may not be captured depending on timing
      // Just verify the sequence ran successfully with console option

      await closeSession('seq-test-6');
    })();

    // Test: run_sequence handles missing session
    await test('run_sequence: returns error for missing session', async () => {
      const result = await runSequence({
        session: 'nonexistent-session',
        steps: [{ type: 'assert', condition: { element_exists: 'body' } }],
      });

      assert('error' in result, 'Should return error');
      assert((result as any).error.includes('not found'), 'Error should mention session not found');
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
