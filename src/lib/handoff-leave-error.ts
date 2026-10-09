import { KYCApiError } from '../services/api';

/**
 * Why returning the phone handoff failed, in the applicant's terms.
 *
 * This used to be a single sentence for every throw: a blocked CORS preflight,
 * a dropped connection, a 500 and a genuine conflict all told the person their
 * verification was "already open on your other device". That asserts a fact
 * nobody established, and it sent at least one investigation looking at session
 * state when the request had never reached the server at all.
 *
 * Only the server's own conflict codes may claim another device holds it.
 * Anything else says what is actually known: we could not confirm, so retry.
 */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

const DEFAULTS: Record<string, string> = {
  'handoff.leave.inUse.phone': 'This verification is already open on your phone. Continue there.',
  'handoff.leave.inUse.otherDevice': 'This verification is already open on your other device. Continue there.',
  'handoff.leave.serverError': 'We could not reach the server to release this verification. Try again in a moment.',
  'handoff.leave.refused': 'We could not release this verification. Try again, or continue on the other device.',
  'handoff.leave.offline': 'We could not reach the server to release this verification. Check your connection and try again.',
};

export function handoffLeaveErrorMessage(error: unknown, onPhone: boolean, t?: Translate): string {
  const say = (key: string) => (t ? t(key) : DEFAULTS[key]!);
  if (error instanceof KYCApiError) {
    // The server refused because the session genuinely moved or was spent.
    if (error.code === 'handoff_session_in_use' || error.code === 'handoff_session_used') {
      return say(onPhone ? 'handoff.leave.inUse.phone' : 'handoff.leave.inUse.otherDevice');
    }
    if (error.statusCode >= 500) return say('handoff.leave.serverError');
    return say('handoff.leave.refused');
  }
  // Never reached the server: a network drop, an offline tab, or a request the
  // browser itself refused to send.
  return say('handoff.leave.offline');
}
