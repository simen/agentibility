/**
 * Assertions module for run_sequence tool.
 * Validates page state conditions, failing fast when assertions don't pass.
 */

import { Page } from 'playwright';

const DEFAULT_TIMEOUT = 5000;

export type AssertCondition =
  | { url_contains: string }
  | { url_equals: string }
  | { title_contains: string }
  | { title_equals: string }
  | { element_exists: string }
  | { element_not_exists: string }
  | { element_visible: string }
  | { element_text_contains: { selector: string; text: string } }
  | { element_count: { selector: string; count: number } }
  | { element_count_gte: { selector: string; count: number } }
  | { element_count_lte: { selector: string; count: number } };

export interface AssertionResult {
  success: boolean;
  condition: string;
  expected?: string | number;
  actual?: string | number;
  error?: string;
}

/**
 * Check an assertion condition against the current page state.
 * Uses Playwright's built-in waiting where possible.
 */
export async function checkAssertion(
  page: Page,
  condition: AssertCondition,
  timeout: number = DEFAULT_TIMEOUT
): Promise<AssertionResult> {
  // URL assertions
  if ('url_contains' in condition) {
    const expected = condition.url_contains;
    const actual = page.url();
    const success = actual.includes(expected);
    return {
      success,
      condition: 'url_contains',
      expected,
      actual,
      error: success ? undefined : `URL "${actual}" does not contain "${expected}"`,
    };
  }

  if ('url_equals' in condition) {
    const expected = condition.url_equals;
    const actual = page.url();
    const success = actual === expected;
    return {
      success,
      condition: 'url_equals',
      expected,
      actual,
      error: success ? undefined : `URL "${actual}" does not equal "${expected}"`,
    };
  }

  // Title assertions
  if ('title_contains' in condition) {
    const expected = condition.title_contains;
    const actual = await page.title();
    const success = actual.includes(expected);
    return {
      success,
      condition: 'title_contains',
      expected,
      actual,
      error: success ? undefined : `Title "${actual}" does not contain "${expected}"`,
    };
  }

  if ('title_equals' in condition) {
    const expected = condition.title_equals;
    const actual = await page.title();
    const success = actual === expected;
    return {
      success,
      condition: 'title_equals',
      expected,
      actual,
      error: success ? undefined : `Title "${actual}" does not equal "${expected}"`,
    };
  }

  // Element existence assertions
  if ('element_exists' in condition) {
    const selector = condition.element_exists;
    try {
      await page.waitForSelector(selector, { timeout, state: 'attached' });
      return {
        success: true,
        condition: 'element_exists',
        expected: selector,
      };
    } catch {
      return {
        success: false,
        condition: 'element_exists',
        expected: selector,
        error: `Element "${selector}" not found within ${timeout}ms`,
      };
    }
  }

  if ('element_not_exists' in condition) {
    const selector = condition.element_not_exists;
    try {
      await page.waitForSelector(selector, { timeout, state: 'detached' });
      return {
        success: true,
        condition: 'element_not_exists',
        expected: selector,
      };
    } catch {
      return {
        success: false,
        condition: 'element_not_exists',
        expected: selector,
        error: `Element "${selector}" still exists after ${timeout}ms`,
      };
    }
  }

  if ('element_visible' in condition) {
    const selector = condition.element_visible;
    try {
      await page.waitForSelector(selector, { timeout, state: 'visible' });
      return {
        success: true,
        condition: 'element_visible',
        expected: selector,
      };
    } catch {
      return {
        success: false,
        condition: 'element_visible',
        expected: selector,
        error: `Element "${selector}" not visible within ${timeout}ms`,
      };
    }
  }

  // Element text assertion
  if ('element_text_contains' in condition) {
    const { selector, text } = condition.element_text_contains;
    try {
      const element = await page.waitForSelector(selector, { timeout, state: 'attached' });
      if (!element) {
        return {
          success: false,
          condition: 'element_text_contains',
          expected: text,
          error: `Element "${selector}" not found`,
        };
      }
      const actual = await element.textContent() || '';
      const success = actual.includes(text);
      return {
        success,
        condition: 'element_text_contains',
        expected: text,
        actual,
        error: success ? undefined : `Element text "${actual}" does not contain "${text}"`,
      };
    } catch {
      return {
        success: false,
        condition: 'element_text_contains',
        expected: text,
        error: `Element "${selector}" not found within ${timeout}ms`,
      };
    }
  }

  // Element count assertions
  if ('element_count' in condition) {
    const { selector, count: expected } = condition.element_count;
    const elements = await page.$$(selector);
    const actual = elements.length;
    const success = actual === expected;
    return {
      success,
      condition: 'element_count',
      expected,
      actual,
      error: success ? undefined : `Expected ${expected} elements matching "${selector}", found ${actual}`,
    };
  }

  if ('element_count_gte' in condition) {
    const { selector, count: expected } = condition.element_count_gte;
    const elements = await page.$$(selector);
    const actual = elements.length;
    const success = actual >= expected;
    return {
      success,
      condition: 'element_count_gte',
      expected,
      actual,
      error: success ? undefined : `Expected at least ${expected} elements matching "${selector}", found ${actual}`,
    };
  }

  if ('element_count_lte' in condition) {
    const { selector, count: expected } = condition.element_count_lte;
    const elements = await page.$$(selector);
    const actual = elements.length;
    const success = actual <= expected;
    return {
      success,
      condition: 'element_count_lte',
      expected,
      actual,
      error: success ? undefined : `Expected at most ${expected} elements matching "${selector}", found ${actual}`,
    };
  }

  // Unknown condition type
  return {
    success: false,
    condition: 'unknown',
    error: `Unknown assertion condition: ${JSON.stringify(condition)}`,
  };
}

/**
 * Get a human-readable description of an assertion condition.
 */
export function describeCondition(condition: AssertCondition): string {
  if ('url_contains' in condition) return `URL contains "${condition.url_contains}"`;
  if ('url_equals' in condition) return `URL equals "${condition.url_equals}"`;
  if ('title_contains' in condition) return `title contains "${condition.title_contains}"`;
  if ('title_equals' in condition) return `title equals "${condition.title_equals}"`;
  if ('element_exists' in condition) return `element "${condition.element_exists}" exists`;
  if ('element_not_exists' in condition) return `element "${condition.element_not_exists}" does not exist`;
  if ('element_visible' in condition) return `element "${condition.element_visible}" is visible`;
  if ('element_text_contains' in condition) {
    const { selector, text } = condition.element_text_contains;
    return `element "${selector}" contains text "${text}"`;
  }
  if ('element_count' in condition) {
    const { selector, count } = condition.element_count;
    return `exactly ${count} elements matching "${selector}"`;
  }
  if ('element_count_gte' in condition) {
    const { selector, count } = condition.element_count_gte;
    return `at least ${count} elements matching "${selector}"`;
  }
  if ('element_count_lte' in condition) {
    const { selector, count } = condition.element_count_lte;
    return `at most ${count} elements matching "${selector}"`;
  }
  return 'unknown condition';
}
