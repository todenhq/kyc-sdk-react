import { describe, expect, it } from 'vitest';
import { FINGERPRINT_CANVAS_TEXT } from './fingerprint-canvas-text';

const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

describe('the fingerprint canvas text', () => {
  it('is exactly the string every existing device identity was drawn with', async () => {
    // Changing this text changes the canvas pixels, which gives every returning
    // browser a new device identity. If this fails, restore the text; do not
    // update the hash.
    expect(await sha256(FINGERPRINT_CANVAS_TEXT))
      .toBe('410a9a0f2d67227a0df05c24df851982862ee61b25b3d568d1abf9e8ad7be6df');
    expect([...FINGERPRINT_CANVAS_TEXT]).toHaveLength(23);
  });
});
