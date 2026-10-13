import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe } from 'vitest';

// ─── Reading across the monorepo, and skipping outside it ────────────────────
//
// A few suites read a SIBLING package: the shared vector files under
// sdk-flutter/test, one rule written down as data for all three SDKs. The
// public repo (todenhq/kyc-sdk-react) carries this package alone, so those
// files do not exist there and such a suite fails with ENOENT rather than
// running (the React Native and Flutter mirrors refused their 2026-09-08
// releases exactly that way). Outside the monorepo the cross-package suites
// SKIP; the monorepo's own CI still runs every one of them.

const PACKAGE_ROOT = new URL('../..', import.meta.url).pathname;
const PACKAGES = join(PACKAGE_ROOT, '..');

export const IN_MONOREPO =
  existsSync(join(PACKAGES, 'sdk-flutter')) && existsSync(join(PACKAGES, 'sdk-react-native'));

/** `describe` in the monorepo, `describe.skip` on the public mirror. */
export function describeInMonorepo(name: string, fn: () => void): void {
  if (IN_MONOREPO) describe(name, fn);
  else describe.skip(name, fn);
}

/** A shared vector file, or `empty` outside the monorepo: `describe.skip`
 *  still runs its callback to register the skipped tests, so a read at
 *  collection time has to answer with something. */
export function sharedVectors<T>(rel: string, empty: T): T {
  return IN_MONOREPO ? (JSON.parse(readFileSync(join(PACKAGES, rel), 'utf8')) as T) : empty;
}
