// node:fs / node:path are declared in node-builtins.d.ts — this browser-typed
// package has no @types/node, deliberately.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The defect this pins: VerificationConfigProvider is mounted with an EXPLICIT prop
// list, so a workflow key that reaches the merged props but is missing from
// that list silently never exists for any step. It is a quiet failure — types
// pass, tests on the pure helpers pass, and the feature simply does not run.
// It shipped three times before this test: `requiredIdTypes` (multi-ID flows
// never looped), `resubmit` (hosted send-backs walked the full flow), and
// `deviceIntelligence` (a workflow's opt-out never reached fingerprint
// collection). A source scan is crude, but it is the check that would have
// caught all three.

const SRC = join(new URL('..', import.meta.url).pathname);
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * The provider-mount JSX block of a file (first VerificationConfigProvider opening
 * tag). The tag terminator is the lone `>` on its own line — searching for the
 * first bare `>` cut the block short at a generic inside an attribute cast
 * (`Array<{...}> | undefined`), silently exempting every key after it.
 */
function providerMount(source: string): string {
  const start = source.indexOf('<VerificationConfigProvider');
  expect(start).toBeGreaterThan(-1);
  const end = source.slice(start).search(/\n\s*>\s*\n/);
  expect(end).toBeGreaterThan(-1);
  return source.slice(start, start + end);
}

function workflowKeys(): string[] {
  const merge = read('lib/workflow-merge.ts');
  const list = merge.slice(merge.indexOf('const WORKFLOW_KEYS'), merge.indexOf('] as const'));
  return [...list.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!);
}

describe('every workflow key survives the Verification provider mount', () => {
  // Keys that deliberately do NOT ride the config context: they are consumed
  // in Verification itself (before the provider) or threaded to VerificationModal as
  // component props. Adding a key here is a claim that some step will never
  // need it — check every `config.<key>` consumer before you do.
  const PROP_THREADED = new Set(['voiceGuidance', 'showThemeToggle', 'fullScreen', 'disableClose']);
  // The hosted page's chrome consumes these outside the provider (HostedChrome
  // / the handoff gate). `disableClose` is consumed nowhere on a hosted page:
  // a hosted session is never closable, so the key has nothing to reach.
  const HOSTED_CHROME = new Set(['voiceGuidance', 'showThemeToggle', 'fullScreen']);
  const HOSTED_UNUSED = new Set(['disableClose']);

  it('Verification passes each key (or documents why not)', () => {
    const mount = providerMount(read('Verification.tsx'));
    const missing = workflowKeys().filter(
      (key) => !PROP_THREADED.has(key) && !mount.includes(`${key}={`),
    );
    expect(missing).toEqual([]);
  });

  it('the prop-threaded exceptions really are threaded to VerificationModal', () => {
    const source = read('Verification.tsx');
    const modal = source.slice(source.indexOf('<VerificationModal'), source.indexOf('/>', source.indexOf('<VerificationModal')));
    for (const key of ['showThemeToggle', 'fullScreen', 'disableClose']) {
      expect(modal).toContain(`${key}={`);
    }
    // voiceGuidance is consumed in Verification itself (configureSpeech).
    expect(source).toContain('configureSpeech(voiceGuidance)');
  });

  it('the hosted mount passes every key too (it burned us a fourth time)', () => {
    // `consentStep` shipped on Verification and never reached HostedFlow, so a
    // re-authentication link with consent switched off still opened on the
    // consent screen (user report 2026-09-07). Same defect, same check: the
    // hosted mount is held to the whole list, with the chrome-threaded keys
    // named rather than assumed.
    const source = read('hosted/HostedFlow.tsx');
    const mount = providerMount(source);
    const missing = workflowKeys().filter(
      (key) => !HOSTED_CHROME.has(key) && !HOSTED_UNUSED.has(key) && !mount.includes(`${key}={`),
    );
    expect(missing).toEqual([]);
    for (const key of HOSTED_CHROME) expect(source).toContain(`${key}={`);
  });
});
