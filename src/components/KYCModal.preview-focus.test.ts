import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The builder preview is one pane of a page somebody is typing in. A modal
// dialog takes focus when it mounts and traps it, so every config edit that
// remounted a step pulled the caret out of the builder's own field.
//
// Pinned on the source because the wiring is two props on one element: nothing
// errors when either is dropped, and the only symptom is a lost caret in a
// different application.
describe('the preview dialog', () => {
  const modal = readFileSync(join(new URL('.', import.meta.url).pathname, 'KYCModal.tsx'), 'utf8');

  it('is not modal in preview mode, and is in every real flow', () => {
    expect(modal).toContain('<Dialog modal={!config.previewMode}');
  });

  it('leaves focus where it was on mount, in preview mode only', () => {
    expect(modal).toContain('onOpenAutoFocus={(event) => { if (config.previewMode) event.preventDefault(); }}');
  });
});
