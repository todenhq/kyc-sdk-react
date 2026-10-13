// Narrowing a flow to the steps a reviewer asked the applicant to redo.
//
// A reviewer looked at a finished verification and sent it back — usually
// because one thing was unreadable, not because everything was wrong. Making
// somebody retake a passport photo is reasonable; making them redo consent, the
// ID picker, liveness and a questionnaire to fix that photo is how you lose them.
//
// The instruction rides the session's config snapshot (`config.resubmit`), which
// is how every other per-session flow instruction travels. An SDK that predates
// this simply does not read the key and runs the whole flow, which is the safe
// degradation: asking for too much is recoverable, silently skipping a step the
// reviewer wanted is not.
import type { VerificationStep } from '../types/config';

export interface ResubmitConfig {
  /** Steps to redo, in flow order. Never empty — the server omits the key instead. */
  steps: string[];
  /** Reviewer's note to the applicant. */
  message?: string | null;
  /**
   * The ID the redo keeps. The server sets it on a single-ID send-back whose
   * reviewer did not ask for the ID type again: the flow skips the ID picker (and
   * the ID's evidence, unless that was asked for) and the server fills in what
   * the earlier attempt submitted.
   */
  idType?: string | null;
}

/**
 * Steps that are always kept, whatever the reviewer ticked.
 *
 * `consent` because a flow with no first screen is disorienting, and it is where
 * the redo is explained. `submitted` because a flow has to end somewhere.
 * Neither is something the applicant is being asked to redo — they are the
 * frame around what is.
 */
const ALWAYS: VerificationStep[] = ['consent', 'submitted'];

/**
 * One ID's evidence — a FAMILY, not alternatives a reviewer picks between.
 *
 * Which member a flow contains depends on the ID type: a number-only ID has
 * `id-input`, a document ID has `document-capture` (and maybe `nfc`). At the
 * moment the order is built nobody has chosen one yet, so the flow is shaped by
 * a default. A plan naming `id-input` against an order still shaped for
 * `document-capture` therefore matched NOTHING, fell through to the safety net
 * below, and silently ran the entire flow — which is exactly the bug a reviewer
 * sees as "I asked for the ID and it made them do everything again".
 *
 * Asking for one member asks for whichever this flow turns out to have.
 */
const EVIDENCE: VerificationStep[] = ['id-input', 'document-capture', 'nfc'];

/**
 * Steps a narrowed flow keeps regardless, because without them it cannot
 * produce a submission at all.
 *
 * `POST /verify` requires an `idType`, and a number-only ID its number. When the
 * server says the redo keeps its ID (`idType` on the instruction), it fills the
 * evidence in from the attempt being redone, so none of these are needed and a
 * reviewer who asked for the selfie gets the selfie. Without that (an older
 * server) the applicant must still say which ID this is and supply it, since a
 * two-screen flow that collects a photo and then fails to submit is worse than
 * one extra screen.
 */
const INDIVIDUAL_REQUIRED: VerificationStep[] = ['id-type', ...EVIDENCE];
const BUSINESS_REQUIRED: VerificationStep[] = ['business-details'];

/**
 * The ID type a redo keeps, or null when the applicant chooses it again: the
 * server named one and the reviewer did not tick the ID type.
 */
export function keptIdType(resubmit: ResubmitConfig | undefined | null): string | null {
  const idType = resubmit?.idType;
  const asked = resubmit?.steps;
  if (typeof idType !== 'string' || idType.length === 0 || !asked?.length) return null;
  return asked.includes('id-type') ? null : idType;
}

/** The redo keeps the ID's evidence as well: nothing about the ID was asked for. */
export function keepsIdEvidence(resubmit: ResubmitConfig | undefined | null): boolean {
  if (keptIdType(resubmit) === null) return false;
  return !resubmit!.steps.some((step) => EVIDENCE.includes(step as VerificationStep));
}

/**
 * Narrow a full step order to the redo, preserving flow order.
 *
 * Order comes from `order`, never from the reviewer's list: they ticked
 * checkboxes, and walking somebody through liveness before document capture
 * because that is the order the boxes were ticked in would be nonsense.
 *
 * Returns the ORIGINAL order untouched when the instruction is absent, empty, or
 * matches nothing we know. That last case matters: a server that learns a new
 * step name before this SDK does must not produce a two-screen flow that
 * collects nothing.
 */
export function applyResubmitSteps(
  order: VerificationStep[],
  resubmit: ResubmitConfig | undefined | null,
): VerificationStep[] {
  const asked = resubmit?.steps;
  if (!asked?.length) return order;

  const wantsEvidence = asked.some((step) => EVIDENCE.includes(step as VerificationStep));

  // Does the instruction name anything this flow actually has? If not, it came
  // from a server that knows a step name this SDK does not — and narrowing on it
  // would quietly drop whatever was really asked for. Checked BEFORE the
  // required steps are added, or those alone would make every unknown plan look
  // recognised and turn the safety net below into dead code.
  const recognised = wantsEvidence || asked.some((step) => order.includes(step as VerificationStep));
  if (!recognised) return order;

  const wanted = new Set<string>(asked);
  if (wantsEvidence) for (const step of EVIDENCE) wanted.add(step);
  const required = order.includes('business-details')
    ? BUSINESS_REQUIRED
    : keptIdType(resubmit) !== null
      ? []
      : INDIVIDUAL_REQUIRED;
  for (const step of required) wanted.add(step);

  const narrowed = order.filter((step) => wanted.has(step) || ALWAYS.includes(step));

  // Nothing but the frame survived, so the instruction named steps this flow
  // does not contain. Run everything rather than nothing.
  const collects = narrowed.some((step) => !ALWAYS.includes(step));
  return collects ? narrowed : order;
}

/** Whether this mount is a targeted redo, for the wording on screen. */
export function isResubmission(resubmit: ResubmitConfig | undefined | null): boolean {
  return Boolean(resubmit?.steps?.length);
}

/**
 * The reviewer's note to the applicant, when this mount is a targeted redo.
 *
 * The dashboard's send-back dialog asks a reviewer to explain the problem — its
 * placeholder is literally "Your document photo was too dark to read, please
 * retake it in good light." The server stamps that note onto the session and
 * every SDK parses it into config, and until now NONE of them displayed it. So
 * a send-back reached the applicant as a flow that had silently lost most of
 * its steps, with nothing saying why they were back or what to do differently.
 *
 * Returns null when there is nothing to show, so a caller can render this
 * unconditionally.
 */
export function resubmitNote(resubmit: ResubmitConfig | undefined | null): string | null {
  if (!isResubmission(resubmit)) return null;
  const note = resubmit?.message?.trim();
  return note && note.length > 0 ? note : null;
}
