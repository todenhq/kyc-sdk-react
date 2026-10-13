import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The hosted page's lifecycle exists so a HOST (a native WebView, an iframe)
// can listen. Every callback the entry point accepts must reach the place
// that fires it: a callback accepted and dropped is worse than none, because
// the integrator wires it and hears silence.

// The house idiom for source-scan tests (see CaptureRing.test.ts): no node
// type definitions here, so the path comes off the URL itself.
const read = (p: string) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8');

describe('HostedVerification lifecycle', () => {
  const entry = read('../HostedVerification.tsx');
  const flow = read('./HostedFlow.tsx');

  it('forwards every flow callback to HostedFlow', () => {
    for (const cb of ['onStart', 'onStepChange', 'onSubmit', 'onResult', 'onError', 'onClose']) {
      expect(entry).toMatch(new RegExp(`\\b${cb}=\\{${cb}\\}`));
    }
  });

  it('fires ready after the bootstrap and completed on a returning applicant', () => {
    expect(entry).toMatch(/onReady\?\.\(\{\s*sessionId: data\.sessionId/);
    expect(entry).toMatch(/onCompleted\?\.\(data\)/);
    expect(entry).toMatch(/onCompleted\?\.\(null\)/);
  });

  it('HostedFlow hands submit/error to the config provider and start/step to the lifecycle', () => {
    expect(flow).toMatch(/onSubmit=\{onSubmit\}/);
    expect(flow).toMatch(/onResult=\{onResult\}/);
    expect(flow).toMatch(/onError=\{onError\}/);
    expect(flow).toMatch(/<HostedLifecycle onStart=\{onStart\} onStepChange=\{onStepChange\} \/>/);
  });
});
