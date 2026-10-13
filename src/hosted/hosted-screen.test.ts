import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The screens around a hosted flow must never wear the SDK default while the
// workflow's colours are known. The hosted page reads the appearance on the
// server and hands it in; every screen the entry renders before (and instead
// of) the flow must be themed from it.
const read = (p: string) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8');

describe('hosted screens are themed from the page-supplied appearance', () => {
  const entry = read('../HostedVerification.tsx');
  const screen = read('./HostedScreen.tsx');

  it('the entry hands the appearance to the loading screen and the terminal screens', () => {
    expect(entry).toMatch(/<HostedLoadingScreen appearance=\{appearance\}/);
    expect(entry).not.toMatch(/<HostedScreen(?![^>]*appearance=)/);
  });

  it('the screen paints from the appearance inline, dark palette included, so a server render is right', () => {
    expect(screen).toMatch(/buildThemeVars\(appearance, dark\)/);
    expect(screen).toMatch(/dark \? <div className="dark">/);
  });

  it('the loading screen is public, for the page to render before it has a session', () => {
    expect(read('../index.ts')).toMatch(/export \{ HostedLoadingScreen \} from '\.\/hosted\/HostedScreen'/);
  });
});
