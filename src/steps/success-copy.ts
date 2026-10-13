import type { CopyTokens } from '../lib/tokens';
import type { SubmitSuccessAction } from './SubmittedScreens';
import type { VerificationSuccessContent } from '../types/config';
import type { WorkflowScope } from '../lib/scope';
import { defaultText } from '../i18n/translate';
import type { TextFn } from '../i18n/types';

// The success screen's words and its terminal affordance, in one place.
//
// Two screens render this outcome — the one shown the moment somebody submits,
// and the one shown when they come back to the link afterwards — and a person
// returning must recognise the screen they left. Two copies of this logic is
// exactly how they would stop matching.
//
// The words come from the text catalogue (i18n/groups/result-submit.ts). The
// org's dedicated `success.*` fields ride as the legacy value, so they still
// win, with the same {firstName}/{lastName}/{businessName} tokens filled.

/** Every token named, so an absent one fills as '' rather than leaking its braces. */
function tokenVars(tokens: CopyTokens) {
  return { firstName: tokens.firstName, lastName: tokens.lastName, businessName: tokens.businessName };
}

export function successTitle(
  success: VerificationSuccessContent | undefined,
  tokens: CopyTokens,
  t: TextFn = defaultText,
): string {
  return t('result.success.title', tokenVars(tokens), success?.title);
}

// Scope-honest defaults: an address-only applicant told "your identity
// verification has been submitted" is being told about a check that never ran.
// Same rule as the consent copy — the default names what was ACTUALLY
// submitted; an org's own success.description always wins.
const SCOPE_DESCRIPTION_KEYS: Partial<Record<WorkflowScope, string>> = {
  address: 'result.success.description.address',
  'biometric-authentication': 'result.success.description.faceCheck',
  'biometric-enrollment': 'result.success.description.faceEnrolment',
  questionnaire: 'result.success.description.questionnaire',
  contact: 'result.success.description.contact',
};

export function successDescription(
  success: VerificationSuccessContent | undefined,
  tokens: CopyTokens,
  isBusiness: boolean,
  scope?: WorkflowScope | null,
  t: TextFn = defaultText,
): string {
  const key =
    (scope && SCOPE_DESCRIPTION_KEYS[scope]) ||
    (isBusiness ? 'result.success.description.business' : 'result.success.description.individual');
  return t(key, tokenVars(tokens), success?.description);
}

/**
 * Terminal affordance. Embedded mounts: Done → onClose, as ever. Hosted pages
 * have no host surface to close back to, so Done would be dead — navigate to the
 * org's configured completion redirect instead, or end on a "close this tab"
 * note when none is set. The redirect comes from the PUBLISHED config (validated
 * http(s) at publish); the scheme re-check here is defense-in-depth only.
 */
export function successAction(
  opts: {
    success: VerificationSuccessContent | undefined;
    hostedMode: boolean;
    tokens: CopyTokens;
    onClose: () => void;
  },
  t: TextFn = defaultText,
): SubmitSuccessAction {
  const redirectUrl = opts.success?.redirectUrl;
  if (!opts.hostedMode) return { label: t('common.done'), onClick: opts.onClose };
  if (!redirectUrl || !/^https?:\/\//i.test(redirectUrl)) {
    return { note: t('result.success.closeTabNote') };
  }
  // The label is the org's, falling back to "Continue". Tokens are filled the
  // same way the title and description are, so "Back to {businessName}" works.
  // A blank/whitespace label, or one that empties once its tokens resolve,
  // falls back rather than rendering an empty button.
  const vars = tokenVars(opts.tokens);
  const label =
    t('result.success.redirectLabel', vars, opts.success?.redirectLabel) ||
    t('result.success.redirectLabel', vars);
  return { label, onClick: () => window.location.assign(redirectUrl) };
}
