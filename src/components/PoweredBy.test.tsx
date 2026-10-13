import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PRODUCT_URL } from '../lib/brand';
import { PoweredBy, TrustAttributionMark } from './PoweredBy';

describe('TrustAttributionMark', () => {
  it.each(['#080A12', '#F6F5FE'])(
    'places the custom logo directly on the surface (%s)',
    (markColor) => {
      const html = renderToStaticMarkup(
        <TrustAttributionMark
          markColor={markColor}
          attribution={{ mode: 'custom', logo: '/transparent-logo.png', companyName: 'Acme' }}
        />,
      );
      expect(html).toContain('src="/transparent-logo.png"');
      expect(html).toContain('object-contain');
      // Same 24px height as the Myaza wordmark it replaces.
      expect(html).toContain('h-6 w-auto');
      expect(html).not.toMatch(
        /\b(?:bg-white|shadow-\S+|ring-\S+|rounded-\S+|border-\S+|invert|brightness-\S+)\b/,
      );
    },
  );

  it.each(['#080A12', '#F6F5FE'])(
    'keeps the name fallback readable on the active surface (%s)',
    (markColor) => {
      const html = renderToStaticMarkup(
        <TrustAttributionMark
          markColor={markColor}
          attribution={{ mode: 'custom', logo: '', companyName: 'Acme' }}
        />,
      );
      expect(html).toMatch(new RegExp(`style="color:${markColor}"[^>]*>Acme`));
    },
  );

  it('uses the Toden logo when an older server sends no attribution', () => {
    const html = renderToStaticMarkup(<TrustAttributionMark markColor="#111827" />);
    expect(html).toContain('Protected by');
    expect(html).toContain('aria-label="Toden"');
    expect(html).toContain(PRODUCT_URL);
    expect(html).not.toContain('Secured by');
  });

  it('renders without a KYC config provider', () => {
    const html = renderToStaticMarkup(<PoweredBy />);
    expect(html).toContain('aria-label="Toden"');
    expect(html).toContain('safe-area-inset-bottom');
  });

  it('shows only the organisation in custom mode, with no Toden mark or link', () => {
    const html = renderToStaticMarkup(
      <TrustAttributionMark
        markColor="#111827"
        attribution={{ mode: 'custom', logo: 'https://cdn.example.com/acme.png', companyName: 'Acme' }}
      />,
    );
    expect(html).toContain('Protected by');
    expect(html).toContain('https://cdn.example.com/acme.png');
    expect(html).toContain('Acme logo');
    expect(html.toLowerCase()).not.toContain('myaza');
    expect(html).not.toContain(PRODUCT_URL);
  });

  it('never falls back to Toden for a malformed custom attribution', () => {
    const html = renderToStaticMarkup(
      <TrustAttributionMark
        markColor="#111827"
        attribution={{ mode: 'custom', companyName: 'Acme' } as never}
      />,
    );
    expect(html).toContain('Acme');
    expect(html.toLowerCase()).not.toContain('myaza');
    expect(html).not.toContain(PRODUCT_URL);
  });

  it('uses the dark-theme logo on a dark flow, and the main logo otherwise', () => {
    const attribution = {
      mode: 'custom' as const,
      logo: 'https://cdn.example.com/acme.png',
      logoDark: 'https://cdn.example.com/acme-dark.png',
      companyName: 'Acme',
    };
    const light = renderToStaticMarkup(<TrustAttributionMark markColor="#070330" attribution={attribution} />);
    const dark = renderToStaticMarkup(<TrustAttributionMark markColor="#F6F5FE" attribution={attribution} dark />);
    expect(light).toContain('src="https://cdn.example.com/acme.png"');
    expect(dark).toContain('src="https://cdn.example.com/acme-dark.png"');
  });

  it('keeps the main logo on a dark flow when no dark-theme version was supplied', () => {
    const html = renderToStaticMarkup(
      <TrustAttributionMark markColor="#F6F5FE" dark attribution={{ mode: 'custom', logo: '/acme.png' }} />,
    );
    expect(html).toContain('src="/acme.png"');
  });
});
