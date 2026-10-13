// Device Intelligence: `fingerprint.entropy` (wire contract 2026-10-01).
// Signals that make the fingerprint distinctive, kept OUT of `components` on
// purpose: the server hashes `components`, so a new key there would move every
// device's hash. Best-effort and SSR-safe; a signal that can't be read is
// omitted, and nothing here throws.
//
// The audio render is async, so it is PRIMED early (VerificationConfigProvider, on
// mount) and read from a cache at submit; the submit path stays sync. A submit
// that beats the render simply sends no `audioHash`.

import { fnv1a } from './fnv1a';

export interface FingerprintEntropy {
  audioHash?: string;
  fonts?: string[];
}

/** The render may take no longer than this; past it the hash is omitted. */
export const AUDIO_TIMEOUT_MS = 300;
const MAX_FONTS = 60;

/** A FIXED probe list. Changing it changes what `fonts` means; add only. */
export const FONT_PROBES = [
  'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria', 'Candara',
  'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
  'Courier New', 'DejaVu Sans', 'Franklin Gothic Medium', 'Futura', 'Garamond',
  'Geneva', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Impact',
  'Liberation Sans', 'Lucida Console', 'Lucida Grande', 'Lucida Sans Unicode',
  'Menlo', 'Monaco', 'MS Gothic', 'Noto Sans', 'Optima', 'Palatino',
  'Palatino Linotype', 'Roboto', 'Segoe UI', 'SF Pro Text', 'Tahoma',
  'Times New Roman', 'Trebuchet MS', 'Ubuntu', 'Verdana',
] as const;

const FALLBACKS = ['monospace', 'sans-serif', 'serif'] as const;
const PROBE_TEXT = 'mmmmmmmmmmlli1WwQq@#';

/** Fonts that render differently from every fallback they sit in front of. */
export function detectFonts(): string[] | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx || typeof ctx.measureText !== 'function') return undefined;
    const width = (font: string) => {
      ctx.font = `72px ${font}`;
      return ctx.measureText(PROBE_TEXT).width;
    };
    const base = FALLBACKS.map((f) => width(f));
    const found = FONT_PROBES.filter((name) =>
      FALLBACKS.some((f, i) => width(`"${name}", ${f}`) !== base[i]),
    );
    return [...found].sort().slice(0, MAX_FONTS);
  } catch {
    return undefined;
  }
}

type AudioCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

/** FNV-1a of an OfflineAudioContext render; undefined on any failure or timeout. */
export async function audioHash(timeoutMs = AUDIO_TIMEOUT_MS): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const w = window as unknown as { OfflineAudioContext?: AudioCtor; webkitOfflineAudioContext?: AudioCtor };
    const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
    if (!Ctor) return undefined;
    const ctx = new Ctor(1, 5000, 44100);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0;
    comp.release.value = 0.25;
    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);
    const rendered = new Promise<AudioBuffer>((resolve, reject) => {
      // Older Safari renders by callback and returns undefined.
      ctx.oncomplete = (e) => resolve(e.renderedBuffer);
      const p = ctx.startRendering() as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs));
    const buffer = await Promise.race([rendered, timeout]);
    if (!buffer) return undefined;
    const samples = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) sum += Math.abs(samples[i] ?? 0);
    return fnv1a(sum.toString());
  } catch {
    return undefined;
  }
}

let cached: FingerprintEntropy | null = null;
let priming: Promise<FingerprintEntropy> | null = null;

/** Collect once (audio bounded to 300 ms). Safe to call repeatedly. */
export function primeFingerprintEntropy(): Promise<FingerprintEntropy> {
  if (!priming) {
    priming = (async () => {
      const fonts = detectFonts();
      const audio = await audioHash();
      cached = {
        ...(audio !== undefined && { audioHash: audio }),
        ...(fonts !== undefined && { fonts }),
      };
      return cached;
    })().catch(() => (cached = {}));
  }
  return priming;
}

/**
 * The entropy for a sync submit: the primed result, else fonts alone (sync).
 * Undefined when nothing could be read, so the key is omitted entirely.
 */
export function entropySnapshot(): FingerprintEntropy | undefined {
  const value = cached ?? (() => {
    const fonts = detectFonts();
    return fonts !== undefined ? { fonts } : {};
  })();
  return Object.keys(value).length > 0 ? value : undefined;
}

/** Tests only: forget the primed result. */
export function resetFingerprintEntropyForTests(): void {
  cached = null;
  priming = null;
}
