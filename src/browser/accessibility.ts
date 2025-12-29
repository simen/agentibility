/**
 * Accessibility tree building and element extraction.
 * Ported from the Playwright spike.
 */

import { Page } from 'playwright';

// Declare functions that will be eval'd in browser context
// These exist only after eval(helpers) runs in page.evaluate()
declare function getAccessibleName(el: Element): string | null;
declare function elementToStructure(el: Element, depth: number, currentDepth?: number): string | null;
declare function extractText(el: Element, limit?: number): string;

// Helper functions to inject into page context for DOM traversal
export const helperFunctions = `
  function getAccessibleName(el) {
    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\\s+/);
      const labels = ids.map(id => {
        const labelEl = document.getElementById(id);
        return labelEl ? labelEl.textContent.trim() : '';
      }).filter(Boolean);
      if (labels.length) return labels.join(' ');
    }

    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // For inputs, check associated label
    if (el.id) {
      const label = document.querySelector('label[for="' + el.id + '"]');
      if (label) return label.textContent.trim();
    }

    // title attribute
    const title = el.getAttribute('title');
    if (title) return title;

    // alt for images
    if (el.tagName === 'IMG') {
      const alt = el.getAttribute('alt');
      if (alt) return alt;
    }

    // For buttons/links, use text content
    if (['BUTTON', 'A'].includes(el.tagName)) {
      const text = el.textContent.trim();
      if (text) return text.substring(0, 100);
    }

    return null;
  }

  function elementToStructure(el, depth, currentDepth = 0) {
    if (currentDepth >= depth) return null;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const id = el.id || '';
    const classes = el.className && typeof el.className === 'string'
      ? el.className.split(/\\s+/).filter(Boolean).slice(0, 3).join(' ')
      : '';

    // Get accessible name for interactive elements
    let label = null;
    if (['button', 'a', 'input', 'select', 'textarea'].includes(tag) || role) {
      label = getAccessibleName(el);
    }

    // Build attributes string
    const attrs = [];
    if (id) attrs.push('id="' + id + '"');
    if (role) attrs.push('role="' + role + '"');
    if (classes) attrs.push('class="' + classes + '"');
    if (label) attrs.push('label="' + label + '"');

    // For inputs, include type and name
    if (tag === 'input') {
      const type = el.getAttribute('type') || 'text';
      attrs.push('type="' + type + '"');
      const name = el.getAttribute('name');
      if (name) attrs.push('name="' + name + '"');
    }

    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';

    // Get children (elements only, skip text nodes)
    const children = [];
    for (const child of el.children) {
      const childStruct = elementToStructure(child, depth, currentDepth + 1);
      if (childStruct) children.push(childStruct);
    }

    if (children.length === 0) {
      return '<' + tag + attrStr + ' />';
    }

    return '<' + tag + attrStr + '>\\n' + children.join('\\n') + '\\n</' + tag + '>';
  }

  function extractText(el, limit = 0) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const texts = [];
    let charCount = 0;

    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text) {
        if (limit > 0 && charCount + text.length > limit) {
          const remaining = limit - charCount;
          if (remaining > 0) {
            texts.push(text.substring(0, remaining) + '...');
          }
          break;
        }
        texts.push(text);
        charCount += text.length;
      }
    }

    return texts.join(' ');
  }
`;

export interface OverviewResult {
  title: string;
  url: string;
  landmarks: Array<{ role: string; label: string | null }>;
  counts: {
    headings: number;
    links: number;
    buttons: number;
    inputs: number;
    images: number;
    tables: number;
    forms: number;
  };
}

export async function getOverview(page: Page): Promise<OverviewResult> {
  return await page.evaluate(() => {
    const title = document.title || '';
    const url = window.location.href;

    // Collect landmarks with labels
    const landmarks: Array<{ role: string; label: string | null }> = [];
    const landmarkMapping: Record<string, string[]> = {
      banner: ['header', '[role="banner"]'],
      main: ['main', '[role="main"]'],
      navigation: ['nav', '[role="navigation"]'],
      complementary: ['aside', '[role="complementary"]'],
      contentinfo: ['footer', '[role="contentinfo"]'],
      search: ['[role="search"]', 'form[role="search"]'],
      form: ['form[aria-label]', 'form[aria-labelledby]', '[role="form"]'],
      region: ['[role="region"]', 'section[aria-label]', 'section[aria-labelledby]'],
    };

    for (const [role, selectors] of Object.entries(landmarkMapping)) {
      for (const sel of selectors) {
        try {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            // Get accessible name
            let label: string | null = null;
            const labelledBy = el.getAttribute('aria-labelledby');
            if (labelledBy) {
              const ids = labelledBy.split(/\s+/);
              const labels = ids.map(id => {
                const labelEl = document.getElementById(id);
                return labelEl ? labelEl.textContent?.trim() : '';
              }).filter(Boolean);
              if (labels.length) label = labels.join(' ');
            }
            if (!label) {
              label = el.getAttribute('aria-label') || null;
            }
            landmarks.push({ role, label });
          }
        } catch {
          /* invalid selector */
        }
      }
    }

    // Count key elements
    const counts = {
      headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      links: document.querySelectorAll('a[href]').length,
      buttons: document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').length,
      inputs: document.querySelectorAll('input, textarea, select').length,
      images: document.querySelectorAll('img').length,
      tables: document.querySelectorAll('table').length,
      forms: document.querySelectorAll('form').length,
    };

    return { title, url, landmarks, counts };
  });
}

export interface QueryResult {
  elements?: string[];
  text?: string;
  count: number;
}

export async function queryElements(
  page: Page,
  selector: string,
  extract: 'structure' | 'text' = 'structure',
  depth: number = 10,
  limit: number = 0
): Promise<QueryResult> {
  return await page.evaluate(
    ({ selector, extract, depth, limit, helpers }) => {
      eval(helpers);

      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        return { elements: [], count: 0 };
      }

      const results: string[] = [];
      for (const el of elements) {
        if (extract === 'text') {
          results.push(extractText(el, limit));
        } else {
          const struct = elementToStructure(el, depth);
          if (struct) results.push(struct);
        }
      }

      if (extract === 'text') {
        return { text: results.join('\n\n'), count: elements.length };
      }

      return { elements: results, count: elements.length };
    },
    { selector, extract, depth, limit, helpers: helperFunctions }
  );
}

export interface SectionResult {
  text?: string;
  elements?: string[];
  count: number;
  error?: string;
}

export async function getSection(
  page: Page,
  name: string,
  extract: 'structure' | 'text' = 'text',
  depth: number = 10,
  limit: number = 0
): Promise<SectionResult> {
  return await page.evaluate(
    ({ name, extract, depth, limit, helpers }) => {
      eval(helpers);

      // Find all headings
      const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let targetHeading: Element | null = null;
      let headingLevel = 0;

      for (const h of allHeadings) {
        const text = h.textContent?.trim().toLowerCase() || '';
        if (text.includes(name.toLowerCase())) {
          targetHeading = h;
          headingLevel = parseInt(h.tagName[1], 10);
          break;
        }
      }

      if (!targetHeading) {
        return { error: 'Section not found: ' + name, count: 0 };
      }

      // Collect content until next same-or-higher level heading
      const content: Element[] = [];

      // Check if heading is wrapped (Wikipedia-style mw-heading)
      let startNode: Element = targetHeading;
      if (targetHeading.parentElement?.classList.contains('mw-heading')) {
        startNode = targetHeading.parentElement;
      }

      let sibling = startNode.nextElementSibling;

      while (sibling) {
        // Check if it's a heading wrapper
        let checkHeading: Element | null = sibling;
        if (sibling.classList?.contains('mw-heading')) {
          checkHeading = sibling.querySelector('h1, h2, h3, h4, h5, h6');
        }

        // Check if we hit a same-or-higher level heading
        if (checkHeading && /^H[1-6]$/i.test(checkHeading.tagName)) {
          const siblingLevel = parseInt(checkHeading.tagName[1], 10);
          if (siblingLevel <= headingLevel) break;
        }

        content.push(sibling);
        sibling = sibling.nextElementSibling;
      }

      if (content.length === 0) {
        return { text: '', count: 0 };
      }

      // Create temporary container
      const container = document.createElement('div');
      for (const el of content) {
        container.appendChild(el.cloneNode(true));
      }

      if (extract === 'text') {
        return {
          text: extractText(container, limit),
          count: content.length
        };
      }

      const struct = elementToStructure(container, depth);
      return { elements: struct ? [struct] : [], count: content.length };
    },
    { name, extract, depth, limit, helpers: helperFunctions }
  );
}

export interface ElementInfo {
  id?: string;
  level?: number;
  text?: string;
  href?: string;
  alt?: string;
  src?: string;
  action?: string;
  method?: string;
  name?: string | null;
  fields?: Array<{
    type: string;
    name: string;
    label: string | null;
    id?: string;
  }>;
  rows?: number;
  cols?: number;
  caption?: string | null;
  headers?: string[];
}

export interface ElementsResult {
  elements: ElementInfo[];
  count: number;
  type: string;
  error?: string;
}

export type ElementType = 'headings' | 'links' | 'buttons' | 'forms' | 'tables' | 'images';

export async function getElements(
  page: Page,
  type: ElementType,
  limit: number = 0
): Promise<ElementsResult> {
  return await page.evaluate(
    ({ type, limit, helpers }) => {
      eval(helpers);

      const typeSelectors: Record<string, string> = {
        headings: 'h1, h2, h3, h4, h5, h6',
        links: 'a[href]',
        buttons: 'button, [role="button"], input[type="submit"], input[type="button"]',
        forms: 'form',
        tables: 'table',
        images: 'img',
      };

      const selector = typeSelectors[type];
      if (!selector) {
        return { error: 'Unknown type: ' + type, elements: [], count: 0, type };
      }

      const elements = document.querySelectorAll(selector);
      const results: any[] = [];

      for (let i = 0; i < elements.length; i++) {
        if (limit > 0 && i >= limit) break;

        const el = elements[i] as HTMLElement;
        const item: any = {};

        // Common: id for addressing
        if (el.id) item.id = el.id;

        switch (type) {
          case 'headings':
            item.level = parseInt(el.tagName[1], 10);
            item.text = el.textContent?.trim().substring(0, 200) || '';
            break;

          case 'links':
            item.text = el.textContent?.trim().substring(0, 100) ||
              getAccessibleName(el) || '[no text]';
            item.href = el.getAttribute('href');
            break;

          case 'buttons':
            item.text = el.textContent?.trim().substring(0, 100) ||
              getAccessibleName(el) || '[no text]';
            if (el.tagName === 'INPUT') {
              item.text = (el as HTMLInputElement).value || el.getAttribute('aria-label') || '[no text]';
            }
            break;

          case 'forms': {
            item.action = el.getAttribute('action') || '';
            item.method = el.getAttribute('method') || 'get';
            item.name = getAccessibleName(el);
            // List form fields
            const fields = el.querySelectorAll('input, textarea, select');
            item.fields = [];
            for (const field of fields) {
              const fieldEl = field as HTMLInputElement;
              const fieldInfo: any = {
                type: field.tagName.toLowerCase() === 'input'
                  ? (field.getAttribute('type') || 'text')
                  : field.tagName.toLowerCase(),
                name: field.getAttribute('name') || '',
                label: getAccessibleName(field),
              };
              if (fieldEl.id) fieldInfo.id = fieldEl.id;
              item.fields.push(fieldInfo);
            }
            break;
          }

          case 'tables': {
            item.rows = el.querySelectorAll('tr').length;
            const firstRow = el.querySelector('tr');
            item.cols = firstRow?.querySelectorAll('td, th').length || 0;
            item.caption = el.querySelector('caption')?.textContent?.trim() || null;
            // Get headers
            const headers = el.querySelectorAll('th');
            if (headers.length > 0) {
              item.headers = Array.from(headers).slice(0, 10).map(th => th.textContent?.trim() || '');
            }
            break;
          }

          case 'images':
            item.alt = el.getAttribute('alt') || null;
            item.src = el.getAttribute('src');
            break;
        }

        results.push(item);
      }

      return { elements: results, count: elements.length, type };
    },
    { type, limit, helpers: helperFunctions }
  );
}
