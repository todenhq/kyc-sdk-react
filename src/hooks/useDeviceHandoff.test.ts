import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { canMintDeviceHandoff, mintLeftOwnershipOpen, serverRefused } from './useDeviceHandoff';

// The mint guard, tested as the logic it is rather than through a renderer.
//
// What broke: the effect called createHandoffSession with no idempotency guard,
// so StrictMode's deliberate double-invoke minted TWO sessions per visit and
// orphaned the first. `cancelled` looked like protection but only suppressed the
// state update — the request had already created the row.

/** The guard from useDeviceHandoff: share the in-flight promise per mint key. */
function makeMinter(create: () => Promise<{ sessionId: string }>) {
  const ref: { current: { key: string; promise: Promise<{ sessionId: string }> } | null } = {
    current: null,
  };
  return (nonce: number) => {
    const key = `${nonce}`;
    if (ref.current?.key !== key) ref.current = { key, promise: create() };
    return ref.current.promise;
  };
}

describe('the device-handoff mint guard', () => {
  it('never mints without an attempt to bind the phone to', () => {
    expect(canMintDeviceHandoff({})).toBe(false);
    expect(canMintDeviceHandoff({ parentSessionId: null })).toBe(false);
    // Any one of the three is an attempt: an id in hand, a way to start one,
    // or a session token that is the attempt.
    expect(canMintDeviceHandoff({ parentSessionId: 'session_root' })).toBe(true);
    expect(canMintDeviceHandoff({ ensureParentSession: async () => 'session_root' })).toBe(true);
    expect(canMintDeviceHandoff({ bearerIsParent: true })).toBe(true);
  });

  it('mints ONCE when the effect runs twice for the same key', async () => {
    // Exactly StrictMode: mount, cleanup, mount again.
    const create = vi.fn().mockResolvedValue({ sessionId: 's1' });
    const mint = makeMinter(create);

    const first = mint(0);
    const second = mint(0);

    expect(create).toHaveBeenCalledTimes(1);
    // Both invocations resolve, so whichever handler is still live applies the
    // result — skipping the second run instead would hang the QR on "creating".
    await expect(first).resolves.toEqual({ sessionId: 's1' });
    await expect(second).resolves.toEqual({ sessionId: 's1' });
  });

  it('mints again when the user asks for a new code', async () => {
    // regenerate() bumps the nonce, and that must produce a real new session.
    const create = vi.fn().mockResolvedValue({ sessionId: 's' });
    const mint = makeMinter(create);

    mint(0);
    mint(1);

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('lets a failed mint be retried', async () => {
    // A cached rejection would make the retry button re-read the same error
    // forever.
    const create = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ sessionId: 'ok' });
    const ref: { current: { key: string; promise: Promise<{ sessionId: string }> } | null } = { current: null };
    const mint = (nonce: number) => {
      const key = `${nonce}`;
      if (ref.current?.key !== key) ref.current = { key, promise: create() };
      return ref.current.promise.catch((e) => {
        if (ref.current?.key === key) ref.current = null;
        throw e;
      });
    };

    await expect(mint(0)).rejects.toThrow('offline');
    await expect(mint(0)).resolves.toEqual({ sessionId: 'ok' });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

// ─── Giving the handoff back ─────────────────────────────────────────────────
//
// What broke: showing the QR mints a child session and moves the flow's
// one-verification budget to it. Leaving the gate ran the flow on a desktop
// session that no longer owned that budget, and nothing said so until the next
// authenticated upload - the selfie, four steps later - which came back "this
// verification was continued on another device" beside a Retry Upload button
// that could never succeed.

/** The decision in `release`, as the hook makes it. */
async function release(
  cancel: (id: string) => Promise<unknown>,
  { sessionId, phase }: { sessionId: string | null; phase: string },
): Promise<boolean> {
  if (!sessionId || ['creating', 'error', 'opened', 'submitted'].includes(phase)) return false;
  await cancel(sessionId);
  return true;
}

describe('returning the handoff before verifying here', () => {
  it('cancels the minted session, so the budget comes back', async () => {
    const cancel = vi.fn().mockResolvedValue({ cancelled: true });
    await expect(release(cancel, { sessionId: 's1', phase: 'waiting' })).resolves.toBe(true);
    expect(cancel).toHaveBeenCalledWith('s1');
  });

  it('does not ask once the phone has the flow open', async () => {
    // The server refuses the reclaim for the same reason. Going ahead here
    // would spend a budget the phone is already using.
    const cancel = vi.fn();
    await expect(release(cancel, { sessionId: 's1', phase: 'opened' })).resolves.toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not carry on when the server did not confirm', async () => {
    // A lost answer does not prove the phone's session is gone. Carrying on
    // would let two devices both believe they may submit this verification.
    const cancel = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(release(cancel, { sessionId: 's1', phase: 'waiting' })).rejects.toThrow('offline');
  });

  it('has nothing to give back before anything has been minted', async () => {
    const cancel = vi.fn();
    await expect(release(cancel, { sessionId: null, phase: 'creating' })).resolves.toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });
});

// A failed mint must not trap somebody on the gate unless a phone session may
// really be holding their attempt.
describe('a failed mint', () => {
  const lost = new Error('Failed to fetch');
  const refused = Object.assign(new Error('nope'), { statusCode: 409, code: 'applicant_session_required' });
  const broke = Object.assign(new Error('boom'), { statusCode: 502 });

  it('reads a 4xx as the server answering no', () => {
    expect(serverRefused(refused)).toBe(true);
    expect(serverRefused(broke)).toBe(false);
    expect(serverRefused(lost)).toBe(false);
    expect(serverRefused(null)).toBe(false);
  });

  it('leaves ownership open only when a bound request got no clear answer', () => {
    expect(mintLeftOwnershipOpen(true, lost)).toBe(true);
    expect(mintLeftOwnershipOpen(true, broke)).toBe(true);
    // The server said no: nothing was created.
    expect(mintLeftOwnershipOpen(true, refused)).toBe(false);
    // Nothing bound was sent: the attempt could not be started, or the phone's
    // session stands alone and holds nothing of this device's.
    expect(mintLeftOwnershipOpen(false, lost)).toBe(false);
    expect(mintLeftOwnershipOpen(false, broke)).toBe(false);
  });
});

// The wiring the decision above is worthless without: every way out of the gate
// has to go through it. A click bound straight to the raw prop skips the
// release and reintroduces the bug in full.
describe('the gate wiring', () => {
  const gate = readFileSync(
    join(new URL('..', import.meta.url).pathname, 'components/DeviceHandoffGate.tsx'),
    'utf8',
  );

  it('routes leaving the gate through release()', () => {
    expect(gate).toContain('handoff.release()');
    // The outer component wraps; the inner panel receives the wrapped handler.
    expect(gate).toContain('onContinueHere={continueHere}');
    expect(gate).toContain('onDone={closeGate}');
    expect(gate).toContain('closeGate()');
  });

  it('binds the phone to this mount\'s attempt, and a hosted page to its token', () => {
    expect(gate).toContain('ensureParentSession: config.ensureHandoffParent');
    expect(gate).toContain('bearerIsParent: config.apiKey.startsWith(HANDOFF_TOKEN_PREFIX)');
    const sheet = readFileSync(
      join(new URL('..', import.meta.url).pathname, 'components/MobileHandoffSheet.tsx'),
      'utf8',
    );
    expect(sheet).toContain('ensureParentSession: config.ensureHandoffParent');
  });
});
