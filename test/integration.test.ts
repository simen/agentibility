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

    // ============================================
    // SPA CLIENT-SIDE ROUTING TESTS
    // ============================================
    console.log('\n--- SPA Routing Tests ---');

    await test('SPA: initial page load with correct structure', async () => {
      await openSession('spa', `http://localhost:${server.port}/spa-routing.html`);
      const session = getSession('spa');
      assert(session !== undefined, 'Session should exist');

      const overview = await getOverview(session!.page);
      assert(overview.title.includes('SPA'), 'Title should contain SPA');
      assert(overview.counts.buttons >= 4, 'Should have navigation and action buttons');
      assert(overview.landmarks.some(l => l.role === 'navigation'), 'Should have navigation landmark');
    })();

    await test('SPA: can navigate to different routes', async () => {
      const session = getSession('spa');

      // Navigate to products page
      await performAction(session!.page, {
        type: 'click',
        selector: '[data-route="products"]',
      });

      // Wait for route change
      await new Promise(r => setTimeout(r, 200));

      // Verify products page is showing
      const section = await getSection(session!.page, 'Products', 'text');
      assert(!section.error, 'Should find Products section');
      assert(section.text?.includes('Widget Pro'), 'Products should show Widget Pro');
    })();

    await test('SPA: dynamic content updates (add to cart)', async () => {
      const session = getSession('spa');

      // Add item to cart
      await performAction(session!.page, {
        type: 'click',
        selector: '[data-product="widget-pro"]',
      });

      // Wait for update
      await new Promise(r => setTimeout(r, 100));

      // Check cart count updated
      const result = await queryElements(session!.page, '#cart-count', 'text');
      assert(result.text?.includes('1 item'), 'Cart should show 1 item');
    })();

    await test('SPA: form on different route works', async () => {
      const session = getSession('spa');

      // Navigate to contact
      await performAction(session!.page, {
        type: 'click',
        selector: '[data-route="contact"]',
      });
      await new Promise(r => setTimeout(r, 200));

      // Fill contact form
      await performAction(session!.page, { type: 'fill', selector: '#contact-name', value: 'Test User' });
      await performAction(session!.page, { type: 'fill', selector: '#contact-email', value: 'test@example.com' });
      await performAction(session!.page, { type: 'fill', selector: '#contact-message', value: 'Hello world' });

      // Submit form
      await performAction(session!.page, {
        type: 'click',
        selector: '#contact-form button[type="submit"]',
      });

      // Check success message
      const result = await queryElements(session!.page, '#contact-result', 'text');
      assert(result.text?.includes('Thank you'), 'Should show thank you message');
      assert(result.text?.includes('Test User'), 'Should include user name');

      await closeSession('spa');
    })();

    // ============================================
    // FORM VALIDATION TESTS
    // ============================================
    console.log('\n--- Form Validation Tests ---');

    await test('form validation: detects required field errors', async () => {
      await openSession('form-val', `http://localhost:${server.port}/form-validation.html`);
      const session = getSession('form-val');

      // Submit empty form
      await performAction(session!.page, {
        type: 'click',
        selector: '#submit-btn',
      });

      // Check for error messages
      const usernameError = await queryElements(session!.page, '#username-error', 'text');
      assert(usernameError.text?.includes('required'), 'Username error should show required');

      const emailError = await queryElements(session!.page, '#email-error', 'text');
      assert(emailError.text?.includes('required'), 'Email error should show required');
    })();

    await test('form validation: validates email format', async () => {
      const session = getSession('form-val');

      // Fill invalid email
      await performAction(session!.page, { type: 'fill', selector: '#email', value: 'notanemail' });
      await performAction(session!.page, { type: 'click', selector: '#submit-btn' });

      const emailError = await queryElements(session!.page, '#email-error', 'text');
      assert(emailError.text?.includes('valid email'), 'Should show invalid email error');
    })();

    await test('form validation: password complexity requirements', async () => {
      const session = getSession('form-val');

      // Fill weak password
      await performAction(session!.page, { type: 'fill', selector: '#password', value: 'weak' });
      await performAction(session!.page, { type: 'click', selector: '#submit-btn' });

      const pwError = await queryElements(session!.page, '#password-error', 'text');
      assert(pwError.text?.includes('8 characters'), 'Should require minimum length');
    })();

    await test('form validation: password match check', async () => {
      const session = getSession('form-val');

      await performAction(session!.page, { type: 'fill', selector: '#password', value: 'StrongPass1' });
      await performAction(session!.page, { type: 'fill', selector: '#confirm-password', value: 'DifferentPass1' });
      await performAction(session!.page, { type: 'click', selector: '#submit-btn' });

      const confirmError = await queryElements(session!.page, '#confirm-error', 'text');
      assert(confirmError.text?.includes('do not match'), 'Should show passwords do not match');
    })();

    await test('form validation: successful submission', async () => {
      const session = getSession('form-val');

      // Reset form first to clear validation state
      await performAction(session!.page, { type: 'click', selector: '#reset-btn' });

      // Fill form correctly
      await performAction(session!.page, { type: 'fill', selector: '#username', value: 'validuser' });
      await performAction(session!.page, { type: 'fill', selector: '#email', value: 'valid@example.com' });
      await performAction(session!.page, { type: 'fill', selector: '#password', value: 'ValidPass123' });
      await performAction(session!.page, { type: 'fill', selector: '#confirm-password', value: 'ValidPass123' });
      await performAction(session!.page, { type: 'select', selector: '#country', value: 'us' });
      await performAction(session!.page, { type: 'click', selector: '#terms' }); // Use click instead of check
      await performAction(session!.page, { type: 'click', selector: '#submit-btn' });

      // Check success message
      const success = await queryElements(session!.page, '#success-message', 'text');
      assert(success.text?.includes('Registration Successful'), 'Should show success message');
      assert(success.text?.includes('validuser'), 'Should include username');

      await closeSession('form-val');
    })();

    // ============================================
    // COMPLEX TABLES TESTS
    // ============================================
    console.log('\n--- Complex Tables Tests ---');

    await test('tables: employee table with sortable headers', async () => {
      await openSession('tables', `http://localhost:${server.port}/complex-tables.html`);
      const session = getSession('tables');

      const result = await getElements(session!.page, 'tables');
      assert(result.count >= 4, 'Should have at least 4 tables');

      // Find employee table
      const employeeTable = result.elements.find((t: any) => t.caption?.includes('employees'));
      assert(employeeTable !== undefined, 'Should find employee table');
      assert(employeeTable!.headers?.includes('Name'), 'Should have Name header');
      assert(employeeTable!.headers?.includes('Salary'), 'Should have Salary header');
    })();

    await test('tables: sales table with row headers', async () => {
      const session = getSession('tables');

      const section = await getSection(session!.page, 'Quarterly Sales', 'text');
      assert(!section.error, 'Should find sales section');
      assert(section.text?.includes('North America'), 'Should have regional data');
      assert(section.text?.includes('$2,060'), 'Should have totals');
    })();

    await test('tables: expandable rows work', async () => {
      const session = getSession('tables');

      // Click to expand a row
      await performAction(session!.page, {
        type: 'click',
        selector: '[data-sku="WDG-001"]',
      });

      // Check expanded content
      const detail = await queryElements(session!.page, '#detail-WDG-001', 'text');
      assert(detail.text?.includes('WidgetCorp'), 'Expanded row should show supplier');
      assert(detail.text?.includes('Professional-grade'), 'Should show description');
    })();

    await test('tables: pagination controls', async () => {
      const session = getSession('tables');

      // Check initial state
      const status = await queryElements(session!.page, '#pagination-status', 'text');
      assert(status.text?.includes('1-3'), 'Should show first page items');

      // Click next
      await performAction(session!.page, { type: 'click', selector: '#next-page' });

      // Check updated state
      const newStatus = await queryElements(session!.page, '#pagination-status', 'text');
      assert(newStatus.text?.includes('4-6'), 'Should show second page items');
    })();

    await test('tables: nested headers (weather table)', async () => {
      const session = getSession('tables');

      const result = await getElements(session!.page, 'tables');
      const weatherTable = result.elements.find((t: any) => t.caption?.includes('weather'));
      assert(weatherTable !== undefined, 'Should find weather table');
      assert(weatherTable!.headers?.includes('High'), 'Should have nested High header');
      assert(weatherTable!.headers?.includes('Low'), 'Should have nested Low header');

      await closeSession('tables');
    })();

    // ============================================
    // EDGE CASES TESTS
    // ============================================
    console.log('\n--- Edge Cases Tests ---');

    await test('edge: live regions detected', async () => {
      await openSession('edge', `http://localhost:${server.port}/edge-cases.html`);
      const session = getSession('edge');

      const overview = await getOverview(session!.page);
      assert(overview.landmarks.some(l => l.role === 'main'), 'Should have main landmark');
      assert(overview.landmarks.some(l => l.role === 'banner'), 'Should have banner');
    })();

    await test('edge: dynamic live region updates', async () => {
      const session = getSession('edge');

      // Click update button
      await performAction(session!.page, { type: 'click', selector: '#update-live' });
      await new Promise(r => setTimeout(r, 100));

      // Check live region updated
      const result = await queryElements(session!.page, '#live-region', 'text');
      assert(result.text?.includes('Update #1'), 'Live region should update');
    })();

    await test('edge: ARIA tabs pattern', async () => {
      const session = getSession('edge');

      // Check initial tab - verify via panel visibility
      const panel1 = await queryElements(session!.page, '#panel-1', 'text');
      assert(panel1.text?.includes('Tab 1'), 'Panel 1 should be visible initially');

      // Click tab 2
      await performAction(session!.page, { type: 'click', selector: '#tab-2' });

      // Verify panel changed
      const panel2 = await queryElements(session!.page, '#panel-2', 'text');
      assert(panel2.text?.includes('Tab 2'), 'Panel 2 content should be visible');
    })();

    await test('edge: accordion expand/collapse', async () => {
      const session = getSession('edge');

      // Expand accordion
      await performAction(session!.page, { type: 'click', selector: '#accordion-btn-1' });

      // Check content is visible (region is no longer hidden)
      const content = await queryElements(session!.page, '#accordion-1', 'text');
      assert(content.text?.includes('getting started'), 'Accordion content should be visible');
      assert(content.count > 0, 'Accordion region should have content');
    })();

    await test('edge: modal dialog opens', async () => {
      const session = getSession('edge');

      // Open modal
      await performAction(session!.page, { type: 'click', selector: '#open-modal' });
      await new Promise(r => setTimeout(r, 100));

      // Check modal content
      const modal = await queryElements(session!.page, '#demo-modal', 'text');
      assert(modal.text?.includes('Confirmation'), 'Modal should show title');
      assert(modal.text?.includes('proceed'), 'Modal should show description');

      // Close modal
      await performAction(session!.page, { type: 'click', selector: '#modal-cancel' });
    })();

    await test('edge: lazy loaded content', async () => {
      const session = getSession('edge');

      // Click load button
      await performAction(session!.page, { type: 'click', selector: '#load-content' });
      await new Promise(r => setTimeout(r, 600));

      // Check loaded content
      const lazy = await queryElements(session!.page, '#lazy-container', 'text');
      assert(lazy.text?.includes('Loaded Content'), 'Should show loaded content');
      assert(lazy.text?.includes('Dynamic item'), 'Should show dynamic items');
    })();

    await test('edge: multiple label sources (aria-labelledby)', async () => {
      const session = getSession('edge');

      const result = await getElements(session!.page, 'forms');
      const labelForm = result.elements.find((f: any) => f.name?.includes('Label testing'));
      assert(labelForm !== undefined, 'Should find label testing form');
      assert(labelForm!.fields?.length >= 4, 'Form should have multiple fields');
    })();

    await test('edge: skip link present', async () => {
      const session = getSession('edge');

      const links = await getElements(session!.page, 'links');
      const skipLink = links.elements.find((l: any) => l.text?.includes('Skip to main'));
      assert(skipLink !== undefined, 'Should have skip link');
      assert(skipLink!.href?.includes('#main-content'), 'Skip link should target main');

      await closeSession('edge');
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
