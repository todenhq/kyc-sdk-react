// Collapses concurrent session starts into ONE request per launch.
//
// The per-instance ref guard in Verification is not enough: React StrictMode
// remounts the component with fresh refs, so each launch fired /session/start
// twice ~600ms apart. Without an externalUserId the server has nothing to
// resume by, so the second call minted a SECOND session — the flow adopted one
// and the orphan sat on the org's sessions list forever as "Not started".
//
// The window is short on purpose: this exists to collapse a double-invoke, not
// to cache sessions. A failure clears immediately so a retry is a real retry.

const inflight = new Map<string, Promise<unknown>>();

export function startSessionOnce<T>(key: string, start: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = start();
  inflight.set(key, promise);
  promise.then(
    () => setTimeout(() => inflight.delete(key), 2000),
    () => inflight.delete(key),
  );
  return promise;
}
