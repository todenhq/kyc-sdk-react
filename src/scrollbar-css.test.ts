import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The SDK sheet also ships as dist/styles.css, which integrators import into
// their own pages (styleIsolation={false}, the hosted page). A bare
// `::-webkit-scrollbar` in it would restyle the whole host page, so every
// scrollbar rule must stay anchored to the SDK's own elements.

// House idiom for source-scan tests (see CaptureRing.test.ts): the path comes
// off the URL itself.
const read = (p: string) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector in a style rule's prelude (at-rules excluded). */
function ruleSelectors(css: string): string[] {
  const out: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const prelude = (match[1] ?? '').trim();
    if (!prelude || prelude.startsWith('@')) continue;
    out.push(...prelude.split(',').map((s) => s.trim()));
  }
  return out;
}

/** The body of the first block whose prelude starts at `prefix`. */
function blockBody(css: string, prefix: string): string {
  const start = css.indexOf(prefix);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

describe('SDK scrollbar sheet', () => {
  const sheet = stripComments(read('./scrollbar.css'));

  it('is compiled into the SDK stylesheet', () => {
    expect(read('./globals.css')).toMatch(/@import\s+["']\.\/scrollbar\.css["'];/);
  });

  it('anchors every rule to the SDK, never the host page', () => {
    const selectors = ruleSelectors(sheet);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^(\.verification-root|\[data-verification-frame\])/);
    }
  });

  it('keeps the standard properties behind the Firefox-only gate', () => {
    // Chrome 121+ drops every ::-webkit-scrollbar rule on an element whose
    // scrollbar-width or scrollbar-color is not auto, so declaring them for
    // every engine would swap the pill for the native bar.
    const gated = blockBody(sheet, '@supports not selector(::-webkit-scrollbar)');
    expect(gated).toMatch(/scrollbar-color\s*:/);
    expect(sheet.replace(gated, '')).not.toMatch(/scrollbar-(width|color)\s*:/);
  });
});
