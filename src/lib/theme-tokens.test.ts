import { describe, expect, it } from 'vitest';
import { buildThemeVars } from './theme';
import { fontVars, radiusVars, sanitizeFontFamily } from './theme-tokens';

describe('radiusVars', () => {
  it('moves the whole ladder, not just --radius', () => {
    // THE TRAP, and it shipped broken once. globals.css overrides every
    // `rounded-*` utility inside `.verification-root` with a LITERAL, to keep a host
    // app's @theme out. So setting `--radius` — or even `--radius-xl` — changed
    // nothing on screen: the utility never read either. The rules now read
    // `--verification-radius-*`, a namespace only this SDK sets.
    const vars = radiusVars(4);
    expect(vars['--radius']).toBe('4px');
    expect(vars['--verification-radius-xl']).toBe('4px'); // the base rung buttons/inputs use
    expect(vars['--verification-radius-lg']).toBeDefined();
    expect(vars['--verification-radius-2xl']).toBeDefined();
  });

  it('keeps the rungs in proportion so relationships survive', () => {
    // A card (2xl) must stay rounder than an input (xl), at every setting.
    const vars = radiusVars(24); // 2× the 12px default
    expect(vars['--verification-radius-xl']).toBe('24px');
    expect(vars['--verification-radius-2xl']).toBe('32px'); // 16 × 2
    expect(vars['--verification-radius-lg']).toBe('16px'); // 8 × 2
  });

  it('squares everything off at 0', () => {
    const vars = radiusVars(0);
    for (const [token, value] of Object.entries(vars)) {
      expect(value, token).toBe('0px');
    }
  });

  it('NEVER emits --verification-radius-full', () => {
    // It renders avatars, badges, the camera oval and the liveness ring.
    // Scaling it turns circles into squircles — a bug wearing a brand costume.
    for (const r of [0, 4, 12, 32]) {
      expect(radiusVars(r)['--verification-radius-full']).toBeUndefined();
    }
  });

  it('clamps out-of-range values instead of trusting them', () => {
    expect(radiusVars(500)['--radius']).toBe('32px');
    expect(radiusVars(-8)['--radius']).toBe('0px');
  });

  it('emits nothing when unset, so the CSS defaults stand', () => {
    expect(radiusVars(undefined)).toEqual({});
    expect(radiusVars(Number.NaN)).toEqual({});
  });
});

describe('sanitizeFontFamily', () => {
  it('accepts the shapes a real font stack takes', () => {
    expect(sanitizeFontFamily('Inter')).toBe('Inter');
    expect(sanitizeFontFamily('"SF Pro Text", Helvetica')).toBe('"SF Pro Text", Helvetica');
    expect(sanitizeFontFamily('  Space Grotesk  ')).toBe('Space Grotesk');
  });

  it('DROPS a value that could carry more than a font list', () => {
    // This value can arrive from a published workflow — server-stored and
    // dashboard-authored — so it is not necessarily written by the integrator.
    // Dropped whole rather than stripped, so we never render something subtly
    // different from what the author wrote.
    expect(sanitizeFontFamily('Inter; background: url(http://evil)')).toBeUndefined();
    expect(sanitizeFontFamily('Inter</style><script>')).toBeUndefined();
    expect(sanitizeFontFamily('a'.repeat(200))).toBeUndefined();
    expect(sanitizeFontFamily('   ')).toBeUndefined();
  });
});

describe('fontVars', () => {
  it('always keeps a fallback chain', () => {
    // A brand font that fails to load must land on system-ui, never the
    // browser's serif default — which looks broken rather than unbranded.
    expect(fontVars('Inter')['--font-sans']).toBe('Inter, system-ui, sans-serif');
  });

  it('uses the body font for headings when only one is given', () => {
    const vars = fontVars('Inter');
    expect(vars['--font-heading']).toBe('Inter, system-ui, sans-serif');
  });

  it('sets large body text to the body font, never the heading font', () => {
    // Text at 16px and up reads --font-copy. With an org font it must follow
    // their BODY font, or their paragraphs and buttons would take the heading face.
    expect(fontVars('Inter', 'Playfair Display')['--font-copy']).toBe('Inter, system-ui, sans-serif');
    expect(fontVars(undefined, 'Playfair Display')['--font-copy']).toBeUndefined();
  });

  it('keeps headings separate when both are given', () => {
    const vars = fontVars('Inter', 'Playfair Display');
    expect(vars['--font-body']).toContain('Inter');
    expect(vars['--font-heading']).toContain('Playfair Display');
  });

  it('falls back to the body font when the heading font is rejected', () => {
    const vars = fontVars('Inter', 'evil; }');
    expect(vars['--font-heading']).toBe('Inter, system-ui, sans-serif');
  });
});

describe('buildThemeVars integration', () => {
  it('carries shape and type alongside colour', () => {
    const vars = buildThemeVars({
      primaryColor: '#FF0000',
      borderRadius: 4,
      fontFamily: 'Inter',
    }) as Record<string, string>;
    expect(vars['--primary']).toBe('#FF0000');
    expect(vars['--verification-radius-xl']).toBe('4px');
    expect(vars['--font-sans']).toContain('Inter');
  });

  it('stays empty for an appearance that sets none of them', () => {
    // Unset tokens must fall through to globals.css rather than being pinned to
    // a computed default here — otherwise dark mode can't override them.
    expect(buildThemeVars({ primaryColor: '#FF0000' })).toEqual({
      '--primary': '#FF0000',
      '--ring': '#FF0000',
    });
  });
});
