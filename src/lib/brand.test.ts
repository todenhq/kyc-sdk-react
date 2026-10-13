import { describe, expect, it } from 'vitest';
import { BRAND_FONT_STACK, PRODUCT_NAME, brandMarkColor } from './brand';
import { fontVars } from './theme-tokens';

/**
 * The "TRUST" half of the footer lockup is part of the MARK, not UI copy, so an
 * org's typography settings must not restyle it. The failure mode is quiet:
 * everything still renders, just in the customer's brand font instead of ours.
 */
describe('the brand face is immune to org typography', () => {
  it('is a literal stack, never a CSS variable', () => {
    // `var(--font-heading)` / `var(--font-sans)` would read exactly the tokens
    // `appearance.headingFontFamily` / `fontFamily` overwrite — which is the bug
    // this constant exists to prevent.
    expect(BRAND_FONT_STACK).not.toContain('var(');
    expect(BRAND_FONT_STACK).not.toContain('--font');
  });

  it('is set in the brand font', () => {
    // Bricolage Grotesque, the face the console and the Toden logo use.
    expect(BRAND_FONT_STACK).toContain('Bricolage Grotesque');
    expect(BRAND_FONT_STACK).toContain('system-ui');
  });

  it('is untouched by an org overriding every font token', () => {
    // The org's choice lands on the tokens; the mark reads neither of them.
    const vars = fontVars('Poppins', 'Playfair Display');
    expect(vars['--font-sans']).toContain('Poppins');
    expect(vars['--font-heading']).toContain('Playfair Display');
    expect(BRAND_FONT_STACK).not.toContain('Poppins');
    expect(BRAND_FONT_STACK).not.toContain('Playfair');
  });

  it('names the product Toden', () => {
    expect(PRODUCT_NAME).toBe('Toden');
  });
});

describe('brandMarkColor — the footer mark stays OURS and stays visible', () => {
  const lum = (h: string) => {
    const x = h.replace('#', '');
    const c = (i: number) => {
      const s = parseInt(x.slice(i, i + 2), 16) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4);
  };
  const cr = (a: string, b: string) => {
    const la = lum(a);
    const lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  it('is always NEUTRAL, never a brand hue', () => {
    // Attribution, not advertising. A saturated mark clashes on an org whose
    // palette is yellow or green, and draws the eye to the least important
    // element on screen. The logo icon still carries the brand.
    const NEUTRALS = ['#080A12', '#F6F5FE'];
    for (const bg of ['#FFFFFF', '#080A12', '#fcf7f2', '#FF6B00', '#0EA5E9', '#1a0f00']) {
      expect(NEUTRALS).toContain(brandMarkColor(bg));
    }
  });

  it('stays legible on the SDK defaults', () => {
    expect(cr(brandMarkColor('#FFFFFF'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(cr(brandMarkColor('#080A12'), '#080A12')).toBeGreaterThanOrEqual(4.5);
  });

  it('stays legible on a saturated brand background', () => {
    // Including our own purple — a neutral has to work there too.
    for (const bg of ['#5645F5', '#FFC107', '#14532D']) {
      expect(cr(brandMarkColor(bg), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('handles an arbitrary org background, not just light and dark', () => {
    // `backgroundColor` is free-form, so a theme flag is not enough.
    for (const bg of ['#fcf7f2', '#110c1a', '#40196d', '#FFEB3B', '#14532D']) {
      expect(cr(brandMarkColor(bg), bg), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('returns the best available rather than failing on a pathological mid-grey', () => {
    // Nothing in a fixed brand palette clears AA against mid-grey. Picking the
    // most visible option beats returning a fixed guess that may be worse.
    const mark = brandMarkColor('#808080');
    expect(cr(mark, '#808080')).toBeGreaterThan(3);
  });

  it('falls back safely on a malformed background', () => {
    expect(brandMarkColor('not-a-colour')).toBe(brandMarkColor('#ffffff'));
  });
});

describe('the background the mark resolves against', () => {
  // Mirrors the resolution in PoweredBy.tsx. It is not simply
  // `appearance.backgroundColor`, and getting that wrong made the footer
  // invisible on a branded dark flow.
  const resolve = (
    isDark: boolean,
    appearance?: { backgroundColor?: string; dark?: { backgroundColor?: string } },
  ) =>
    isDark
      ? (appearance?.dark?.backgroundColor ?? appearance?.backgroundColor ?? '#080A12')
      : (appearance?.backgroundColor ?? '#FFFFFF');

  it('uses the DARK palette background on a dark flow', () => {
    // THE BUG. An imported palette puts the light background on the base
    // tokens, so resolving against it on a dark flow picked the ink tone and
    // the mark vanished into the dark surface.
    const appearance = { backgroundColor: '#fcf7f2', dark: { backgroundColor: '#1a0f00' } };
    expect(resolve(true, appearance)).toBe('#1a0f00');
    expect(brandMarkColor(resolve(true, appearance))).toBe('#F6F5FE');
  });

  it('uses the light background on a light flow', () => {
    const appearance = { backgroundColor: '#fcf7f2', dark: { backgroundColor: '#1a0f00' } };
    expect(brandMarkColor(resolve(false, appearance))).toBe('#080A12');
  });

  it('falls back to the SDK surface when the org set nothing', () => {
    expect(brandMarkColor(resolve(true))).toBe('#F6F5FE');
    expect(brandMarkColor(resolve(false))).toBe('#080A12');
  });

  it('falls back to the base colour when only a light palette was set', () => {
    // An org with light-only colours on a dark flow: better to resolve against
    // what they actually set than to assume the SDK default.
    expect(resolve(true, { backgroundColor: '#ffffff' })).toBe('#ffffff');
  });
});
