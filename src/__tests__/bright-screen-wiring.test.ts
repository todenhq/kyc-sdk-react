// node:fs / node:path are declared in node-builtins.d.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The pure rules are tested beside their modules; this pins the two places
// they have to be USED, since leaving either out compiles and fails silently.
const SRC = join(new URL('..', import.meta.url).pathname);
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('bright screen during the selfie is wired', () => {
  it('the flash overlay paints the resolved colour, never the raw flash colour', () => {
    // Painting `liveness.flashColor` directly shows the step UI for the
    // baseline, which the light palette turns white, inverting the check.
    const step = read('steps/LivenessStep.tsx');
    expect(step).toContain('flashOverlayColor(liveness.flashing, liveness.flashColor)');
    expect(step).toContain('backgroundColor: overlayColor');
    expect(step).not.toContain('backgroundColor: liveness.flashColor');
    expect(step).toContain('useReportLivenessCamera(');
  });

  it('the modal holds the light theme and hides the toggle meanwhile', () => {
    const modal = read('components/VerificationModal.tsx');
    expect(modal).toContain('useLivenessLight(');
    expect(modal).toContain('<LivenessCameraContext.Provider value={reportCameraShown}>');
    expect(modal).toContain('showThemeToggle={forceLight ? false : showThemeToggle}');
  });
});
