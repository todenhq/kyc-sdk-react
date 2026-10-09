import type { HandoffSessionSnapshot, StartSessionResponse } from '../services/api';

// ---------------------------------------------------------------------------
// Which attempt a phone handoff belongs to.
//
// "Continue on your phone" creates a second session for the phone. Sent with
// the id of the attempt this device already started, the server ties the two
// together: the phone walks the SAME flow the attempt was started with, keeps
// its user reference and expiry, and a retried request finds the phone's
// existing session instead of creating another. Sent without it, the phone's
// session stands alone, and a lost response leaves a session nobody can see
// holding the verification.
//
// These rules decide, from what `/session/start` answered, whether that
// attempt can stand behind a phone session. They are pure; MyazaKYC supplies
// the request.
// ---------------------------------------------------------------------------

/** Not part of a flow: who the person is, and which workflow names the flow. */
const RUNTIME_KEYS = ['workflowId', 'metadata', 'userId', 'userData'] as const;

/**
 * The flow a prop-configured mount starts its attempt with. A workflow mount
 * sends none: the server takes the published workflow, never the browser's
 * copy of it.
 */
export function handoffRootTemplate(snapshot: HandoffSessionSnapshot): Record<string, unknown> {
  const template: Record<string, unknown> = { ...(snapshot as unknown as Record<string, unknown>) };
  for (const key of RUNTIME_KEYS) delete template[key];
  return template;
}

export class HandoffParentError extends Error {
  constructor(message = 'We could not safely continue this verification on another device. Please try again.') {
    super(message);
    this.name = 'HandoffParentError';
  }
}

/** The mount changed (another key, server, workflow or user) while a request was out. */
export class HandoffAttemptChangedError extends HandoffParentError {
  constructor() {
    super('The verification attempt changed. Please try again.');
    this.name = 'HandoffAttemptChangedError';
  }
}

function hasFlow(config: unknown): boolean {
  return !!config && typeof config === 'object' && !Array.isArray(config) && Object.keys(config).length > 0;
}

/**
 * The parent to send with the phone's session.
 *
 * - A session id: the attempt holds the flow, so the phone is bound to it.
 * - `undefined`: an attempt started before the SDK recorded the flow on it
 *   (a prop-configured mount resumed across an update). Bound to it, the phone
 *   would open an empty flow, so the phone's session is created on its own, as
 *   every version before this one did.
 * - Throws when there is no attempt at all. Nothing then says who owns the
 *   verification, and a phone session created anyway could not be found again.
 */
export function resolveHandoffParent(
  started: Pick<StartSessionResponse, 'sessionId' | 'configSnapshot'> | null,
  workflowMount: boolean,
): string | undefined {
  const id = typeof started?.sessionId === 'string' ? started.sessionId.trim() : '';
  if (!id) throw new HandoffParentError();
  // A workflow mount's flow is the server's own: the attempt always holds it.
  if (workflowMount || hasFlow(started?.configSnapshot)) return id;
  return undefined;
}

/** What makes two starts the same attempt: where, with which key, for whom. */
export function handoffScope(parts: {
  apiKey: string;
  devUrl?: string;
  workflowId?: string;
  externalUserId?: string;
}): string {
  return JSON.stringify([parts.apiKey, parts.devUrl ?? '', parts.workflowId ?? '', parts.externalUserId ?? '']);
}
