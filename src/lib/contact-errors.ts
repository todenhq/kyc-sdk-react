import { VerificationApiError } from '../services/api';
import { defaultText } from '../i18n/translate';
import type { TextFn } from '../i18n/types';

// User-facing copy for the contact-verification send/check error codes. The
// texts live in the catalogue's `contact` group; this maps codes to keys.

const CHECK_ERRORS: Record<string, string> = {
  invalid_code: 'contact.error.invalidCode',
  challenge_expired: 'contact.error.codeExpired',
  too_many_attempts: 'contact.error.tooManyAttempts',
  challenge_not_found: 'contact.error.codeInvalid',
};

const SEND_ERRORS: Record<string, string> = {
  invalid_destination: 'contact.error.invalidDestination',
  send_rate_limited: 'contact.error.rateLimited',
  send_failed: 'contact.error.sendFailed',
};

function describe(err: unknown, map: Record<string, string>, t: TextFn): string {
  if (err instanceof VerificationApiError && err.code && map[err.code]) return t(map[err.code]!);
  if (err instanceof TypeError) return t('contact.error.network');
  return t('contact.error.generic');
}

export const describeSendError = (err: unknown, t: TextFn = defaultText): string =>
  describe(err, SEND_ERRORS, t);
export const describeCheckError = (err: unknown, t: TextFn = defaultText): string =>
  describe(err, CHECK_ERRORS, t);
