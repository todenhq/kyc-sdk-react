import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ─── A test that reads another package goes through __tests__/monorepo ───────
//
// The public mirror carries this package alone; a suite that reaches into
// sdk-flutter or sdk-react-native by a relative path passes here and
// fails there with ENOENT. monorepo.ts skips such suites outside the
// monorepo; this pins that every cross-package read uses it.

const SRC = new URL('..', import.meta.url).pathname;
const SIBLING = /kyc-sdk-(flutter|react-native)\//;

describe('cross-package reads go through __tests__/monorepo', () => {
  const suites = readdirSync(SRC, { recursive: true })
    .filter((rel) => rel.endsWith('.test.ts') && !rel.includes('node_modules'));

  it.each(suites)('%s', (rel) => {
    const source = readFileSync(join(SRC, rel), 'utf8');
    if (!SIBLING.test(source)) return;
    expect(source).toMatch(/__tests__\/monorepo'/);
    expect(source).not.toMatch(/\.\.\/kyc-sdk-(flutter|react-native)\//);
    expect(source).toMatch(/describeInMonorepo\(/);
  });
});
