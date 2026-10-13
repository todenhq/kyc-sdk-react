// ---------------------------------------------------------------------------
// Flow step ordering + progress accounting (extracted from VerificationModal per the
// 200-line rule). Individual flows: consent → (country-select) → id-type →
// capture → (liveness) → (poa) → (questionnaire) → submitted. Business (KYB)
// flows: consent → business-details → (business-documents) →
// (business-key-people) → (applicant capture leg) → (questionnaire) → submitted.
// ---------------------------------------------------------------------------

import type { VerificationStep } from '../types/config';
import type { WorkflowBusinessConfig } from '../types/business';
import { businessSectionSteps, hasApplicantVerification } from './business-application';
import { applyResubmitSteps, type ResubmitConfig } from './resubmit';

export interface StepOrderOptions {
  isBusiness: boolean;
  /** Scoped flows: no identity section — each scope's headline step is the
   *  flow (see lib/scope.ts). */
  scope?: import('./scope').WorkflowScope | null;
  /** Business (KYB) configuration — drives the application-section steps. */
  business?: WorkflowBusinessConfig;
  hasDocCapture: boolean;
  hasLiveness: boolean;
  hasCountrySelect: boolean;
  /**
   * Whether the flow opens on the consent screen. Absent = yes. `false` is the
   * workflow's `consentStep: false`: the org's own app has already asked, so
   * the flow opens on its first real step instead (see lib/consent-step.ts).
   */
  hasConsent?: boolean;
  hasEmailVerification: boolean;
  hasPhoneVerification: boolean;
  hasPoa: boolean;
  /**
   * Whether the supporting-documents step has anything to ask for on THIS
   * attempt. Resolved by the caller (lib/supporting-documents.ts) because the
   * requested list depends on the ID the person actually picked — a document
   * scoped to one ID is not asked of somebody who used another, and a step
   * with an empty list must not appear at all.
   */
  hasSupportingDocuments: boolean;
  hasAddressCollection: boolean;
  /**
   * Which of the address flow's optional steps exist on THIS mount (individual
   * flows only; KYB keeps the single premises step). Absent = pin + review.
   * Search depends on the server config, entrance on capture modes + the
   * in-document Google key — both known at mount, both stable within it.
   */
  addressFlow?: { search: boolean; entrance: boolean };
  hasQuestionnaire: boolean;
  /**
   * A reviewer sent this back to redo specific steps.
   *
   * Applied LAST, over the fully-built order, so it narrows whatever the flow
   * would otherwise have been rather than having to know how that order was
   * assembled — which differs between the individual and KYB branches below.
   */
  resubmit?: ResubmitConfig | null;
  /**
   * Multi-ID flows: the order itself is the normal shape (country-select when
   * multi-region, then the picker + one evidence step, which appear once), and
   * getStepPosition stretches the total by the extra slots so the header
   * progress moves forward through the loop instead of snapping back on each
   * new slot.
   */
  multiId?: { index: number; count: number } | null;
}

// Contact-verification OTP steps sit right after consent (both flows) — a
// cheap pre-filter before capture/registry spend; email before phone.
function contactSteps(o: StepOrderOptions): VerificationStep[] {
  return [
    ...(o.hasEmailVerification ? (['email-verification'] as VerificationStep[]) : []),
    ...(o.hasPhoneVerification ? (['phone-verification'] as VerificationStep[]) : []),
  ];
}

export function buildStepOrder(o: StepOrderOptions): VerificationStep[] {
  return applyResubmitSteps(fullStepOrder(o), o.resubmit);
}

/** The flow's opening screen: consent, unless the workflow switched it off. */
function openingSteps(o: StepOrderOptions): VerificationStep[] {
  return o.hasConsent === false ? [] : ['consent'];
}

/**
 * The step the flow should actually SHOW, given a reviewer's narrowing.
 *
 * Web advances step by step: each screen decides where Continue goes, because
 * the choice is domain logic (which evidence step an ID type needs, which leg a
 * KYB flow is on) that a flat order cannot express. The consequence is that
 * nothing consulted the narrowed order at all — it reached the progress
 * indicator and stopped, so a reviewer's send-back walked the whole flow while
 * appearing, in the header, to be a short one.
 *
 * This is the seam. Every one of those dispatch sites lands in `currentStep`, so
 * mapping it here covers all of them without rewriting the per-screen logic that
 * makes the flow correct in the first place. React Native already behaves this
 * way — it navigates by the order itself (`nextStepInOrder`) — and this brings
 * web to the same behaviour.
 *
 * Skips only ever move FORWARD, and a step outside this flow is returned
 * untouched rather than guessed at.
 */
export function resolveNarrowedStep(step: VerificationStep, o: StepOrderOptions): VerificationStep {
  const narrowed = buildStepOrder(o);
  if (narrowed.includes(step)) return step;
  // A consent-less flow (`consentStep: false`): the reducer still opens on
  // 'consent', and an older Back target may still name it, so both land on
  // the flow's real first step rather than on a screen it does not contain.
  if (step === 'consent' && o.hasConsent === false) return narrowed[0] ?? step;

  const full = fullStepOrder(o);
  const from = full.indexOf(step);
  if (from < 0) return step;
  for (let i = from + 1; i < full.length; i += 1) {
    const candidate = full[i]!;
    if (narrowed.includes(candidate)) return candidate;
  }
  return step;
}

/** The flow as configured, before any reviewer narrowing. */
function fullStepOrder(o: StepOrderOptions): VerificationStep[] {
  // Business (KYB) flow — the application section, then (when the workflow
  // requires applicant verification) the ordinary individual capture leg.
  if (o.isBusiness) {
    // The questionnaire sits INSIDE the business section (before key people) —
    // its questions are about the company, so it stays with the company form
    // rather than trailing the applicant's own capture leg.
    const steps: VerificationStep[] = [
      ...openingSteps(o),
      ...contactSteps(o),
      ...businessSectionSteps(o.business, o.hasQuestionnaire, o.hasAddressCollection),
    ];
    if (hasApplicantVerification(o.business)) {
      steps.push('id-type', o.hasDocCapture ? 'document-capture' : 'id-input');
      if (o.hasLiveness) steps.push('liveness');
    }
    steps.push('submitted');
    return steps;
  }
  // Scoped flows: the scope's headline section IS the flow.
  if (o.scope === 'address') {
    const steps: VerificationStep[] = [...openingSteps(o), ...contactSteps(o)];
    if (o.hasPoa) steps.push('proof-of-address');
    // The scope verifies an address, and there are two ways to do it: the pin
    // and the document. A flow that asks only for the document never opens a
    // map, so these are gated exactly as they are on the full flow below
    // (Flutter has always gated them; web and RN pushed them unconditionally,
    // which made a proof-of-address-only address flow unwalkable).
    if (o.hasAddressCollection) {
      if (o.addressFlow?.search) steps.push('address-search');
      steps.push('address-collection');
      if (o.addressFlow?.entrance) steps.push('address-entrance');
      steps.push('address-review');
    }
    if (o.hasQuestionnaire) steps.push('questionnaire');
    steps.push('submitted');
    return steps;
  }
  if (o.scope === 'biometric-authentication' || o.scope === 'biometric-enrollment') {
    const steps: VerificationStep[] = [...openingSteps(o), ...contactSteps(o), 'liveness'];
    if (o.hasQuestionnaire) steps.push('questionnaire');
    steps.push('submitted');
    return steps;
  }
  if (o.scope === 'questionnaire') {
    return [...openingSteps(o), ...contactSteps(o), 'questionnaire', 'submitted'];
  }
  if (o.scope === 'contact') {
    return [...openingSteps(o), ...contactSteps(o), 'submitted'];
  }
  const middle: VerificationStep[] = [o.hasDocCapture ? 'document-capture' : 'id-input'];
  if (o.hasLiveness) middle.push('liveness');
  // Paperwork the org files comes BEFORE the address evidence the
  // verification is judged on (user decision 2026-09-22).
  if (o.hasSupportingDocuments) middle.push('supporting-documents');
  if (o.hasPoa) middle.push('proof-of-address');
  if (o.hasAddressCollection) {
    if (o.addressFlow?.search) middle.push('address-search');
    middle.push('address-collection');
    if (o.addressFlow?.entrance) middle.push('address-entrance');
    middle.push('address-review');
  }
  if (o.hasQuestionnaire) middle.push('questionnaire');
  return [
    ...openingSteps(o),
    ...contactSteps(o),
    ...(o.hasCountrySelect ? (['country-select'] as VerificationStep[]) : []),
    'id-type',
    ...middle,
    'submitted',
  ];
}

/**
 * Where a step sits in the flow, for the header's progress indicator.
 *
 * `index` is -1 (and `total` 0) when there is no progress to draw, which the
 * header reads as "render nothing".
 *
 * `submitted` is deliberately excluded on BOTH counts, matching the RN and
 * Flutter SDKs:
 *
 *   • The success screen shows no indicator at all — the flow is over, so a
 *     progress row there is noise.
 *   • It is not counted as a step either. Counting it inflated every flow by
 *     one and meant the last thing the user actually did could never reach the
 *     end of the row: a 4-step flow read "1 of 5" and topped out at 4/5.
 */
export interface StepPosition {
  index: number;
  total: number;
}

const NO_PROGRESS: StepPosition = { index: -1, total: 0 };

export function getStepPosition(step: VerificationStep, o: StepOrderOptions): StepPosition {
  if (step === 'submitted') return NO_PROGRESS;
  const steps = buildStepOrder(o).filter((s) => s !== 'submitted');
  // The preview-only nfc step sits right after document capture in the mobile
  // flow — borrow that slot so progress reads sensibly.
  const index = steps.indexOf(step === 'nfc' ? 'document-capture' : step);
  if (index < 0) return NO_PROGRESS;

  // Multi-ID: the picker + evidence pair repeats per slot, so the loop adds
  // (count-1) pairs to the total and the CURRENT slot pushes everything at or
  // beyond the pair forward — the bar keeps moving through slot 2 and 3
  // instead of snapping back to the first pair's position.
  if (o.multiId && o.multiId.count > 1) {
    const pairStart = steps.indexOf('id-type');
    const extra = (o.multiId.count - 1) * 2;
    const offset = Math.min(Math.max(o.multiId.index, 0), o.multiId.count - 1) * 2;
    if (pairStart >= 0 && index >= pairStart) {
      // Steps AFTER the loop (liveness onward) sit past every pair.
      const past = index > pairStart + 1 ? extra : offset;
      return { index: index + past, total: steps.length + extra };
    }
    return { index, total: steps.length + extra };
  }
  return { index, total: steps.length };
}
