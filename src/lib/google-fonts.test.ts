import { describe, expect, it } from 'vitest';
import { FONT_WEIGHTS, GOOGLE_FONTS, ensureGoogleFont, isGoogleFont } from './google-fonts';

/**
 * The catalogue is a SECURITY boundary, not just a nicer control.
 *
 * `ensureGoogleFont` interpolates the family into a fonts.googleapis.com URL and
 * injects it as a stylesheet, and the value can arrive from a server-stored,
 * dashboard-authored workflow rather than from the integrator's own code. An
 * arbitrary string reaching that URL is an injection vector; a member of a fixed
 * list is not. These tests pin that property.
 */

describe('isGoogleFont — the allowlist', () => {
  it('accepts the catalogue', () => {
    expect(isGoogleFont('Inter')).toBe(true);
    expect(isGoogleFont('Plus Jakarta Sans')).toBe(true);
    expect(isGoogleFont('  Inter  ')).toBe(true); // trimmed, as the loader does
  });

  it('rejects anything not in it', () => {
    expect(isGoogleFont('Comic Sans MS')).toBe(false); // real font, not offered
    expect(isGoogleFont('Inter&text=x')).toBe(false); // URL param smuggling
    expect(isGoogleFont('../../evil')).toBe(false);
    expect(isGoogleFont('')).toBe(false);
    expect(isGoogleFont(undefined)).toBe(false);
  });

  it('lists the SDK defaults so they can be chosen explicitly', () => {
    // Otherwise the default is only reachable by leaving the field blank, which
    // makes the default undiscoverable in the picker.
    const families = GOOGLE_FONTS.map((f) => f.family);
    expect(families).toContain('Bricolage Grotesque');
    // The earlier defaults stay, since published workflows name them.
    expect(families).toContain('Karla');
    expect(families).toContain('Space Grotesk');
  });

  it('has no duplicate families', () => {
    const families = GOOGLE_FONTS.map((f) => f.family);
    expect(new Set(families).size).toBe(families.length);
  });
});

describe('ensureGoogleFont', () => {
  it('is a no-op without a document, rather than throwing', () => {
    // Runs in a Node/SSR context here — the SDK is imported by Next.js apps, so
    // a module-scope crash would take the host's server render down.
    expect(() => ensureGoogleFont('Inter')).not.toThrow();
    expect(() => ensureGoogleFont(undefined)).not.toThrow();
    expect(() => ensureGoogleFont('Not A Real Font')).not.toThrow();
  });
});

describe('the request we make of Google', () => {
  it('asks only for the weights the SDK renders', () => {
    // A full variable axis is several times the payload for weights nothing on
    // screen uses — on a camera flow that bandwidth is not free.
    expect(FONT_WEIGHTS).toBe('400;500;600;700');
  });
});
