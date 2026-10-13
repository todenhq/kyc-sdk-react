import { describe, expect, it } from 'vitest';
import {
  awaitSelfieUpload,
  IDLE_SELFIE_UPLOAD,
  selfieUploadExpected,
  selfieUploadSettled,
  type SelfieUploadSnapshot,
} from './selfie-upload-wait';

// A tiny store: a snapshot the test mutates, and listeners it notifies.
function fakeStore(initial: SelfieUploadSnapshot) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => snapshot,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set(next: SelfieUploadSnapshot) {
      snapshot = next;
      listeners.forEach((l) => l());
    },
    listeners,
  };
}

describe('selfieUploadSettled', () => {
  it('a finished upload, or a restored media id with nothing in flight, is settled', () => {
    expect(selfieUploadSettled({ selfieUpload: { status: 'done', message: null }, selfieMediaId: 'm1' })).toEqual({ ok: true });
    expect(selfieUploadSettled({ selfieUpload: IDLE_SELFIE_UPLOAD, selfieMediaId: 'm1' })).toEqual({ ok: true });
  });

  it('an upload in flight, or one not yet started, keeps the caller waiting', () => {
    expect(selfieUploadSettled({ selfieUpload: { status: 'uploading', message: null }, selfieMediaId: undefined })).toBeNull();
    expect(selfieUploadSettled({ selfieUpload: { status: 'uploading', message: null }, selfieMediaId: 'm1' })).toBeNull();
    expect(selfieUploadSettled({ selfieUpload: IDLE_SELFIE_UPLOAD, selfieMediaId: undefined })).toBeNull();
  });

  it('a failure carries its message', () => {
    expect(selfieUploadSettled({ selfieUpload: { status: 'failed', message: 'No network.' }, selfieMediaId: undefined })).toEqual({
      ok: false,
      message: 'No network.',
    });
  });
});

describe('awaitSelfieUpload', () => {
  it('resolves at once when already settled, without subscribing', async () => {
    const store = fakeStore({ selfieUpload: { status: 'done', message: null }, selfieMediaId: 'm1' });
    await expect(awaitSelfieUpload(store)).resolves.toEqual({ ok: true });
    expect(store.listeners.size).toBe(0);
  });

  it('waits for the store to report done, then unsubscribes', async () => {
    const store = fakeStore({ selfieUpload: { status: 'uploading', message: null }, selfieMediaId: undefined });
    const timers: Array<() => void> = [];
    const wait = awaitSelfieUpload({ ...store, setTimer: (fn) => (timers.push(fn), 1), clearTimer: () => undefined });
    expect(store.listeners.size).toBe(1);
    store.set({ selfieUpload: { status: 'uploading', message: null }, selfieMediaId: 'm1' });
    store.set({ selfieUpload: { status: 'done', message: null }, selfieMediaId: 'm1' });
    await expect(wait).resolves.toEqual({ ok: true });
    expect(store.listeners.size).toBe(0);
  });

  it('a failure ends the wait with its message', async () => {
    const store = fakeStore({ selfieUpload: { status: 'uploading', message: null }, selfieMediaId: undefined });
    const wait = awaitSelfieUpload({ ...store, setTimer: () => 1, clearTimer: () => undefined });
    store.set({ selfieUpload: { status: 'failed', message: 'Upload failed.' }, selfieMediaId: undefined });
    await expect(wait).resolves.toEqual({ ok: false, message: 'Upload failed.' });
  });

  it('gives up at the deadline with a message the person can act on', async () => {
    const store = fakeStore({ selfieUpload: IDLE_SELFIE_UPLOAD, selfieMediaId: undefined });
    let fire: (() => void) | null = null;
    const wait = awaitSelfieUpload({ ...store, timeoutMs: 5, setTimer: (fn) => ((fire = fn), 1), clearTimer: () => undefined });
    fire!();
    const result = await wait;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/try again/i);
      expect(result.message).not.toContain('—');
    }
    expect(store.listeners.size).toBe(0);
  });
});

describe('selfieUploadExpected', () => {
  const idle = { selfieUpload: IDLE_SELFIE_UPLOAD, selfieMediaId: undefined };
  it('a flow with no liveness step and nothing uploading has no selfie to wait for', () => {
    expect(selfieUploadExpected(idle, false)).toBe(false);
  });
  it('a flow with a liveness step waits, even before the upload has started', () => {
    expect(selfieUploadExpected(idle, true)).toBe(true);
  });
  it('an upload already started or failed counts whatever the step order says', () => {
    expect(selfieUploadExpected({ selfieUpload: { status: 'uploading', message: null }, selfieMediaId: undefined }, false)).toBe(true);
    expect(selfieUploadExpected({ selfieUpload: { status: 'failed', message: 'x' }, selfieMediaId: undefined }, false)).toBe(true);
  });
});
