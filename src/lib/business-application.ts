// ---------------------------------------------------------------------------
// Business (KYB) APPLICATION helpers — the steps a KYB workflow can add beyond
// the registration details: key-people collection, supporting documents, and
// applicant identity verification. Single source of truth for which steps are
// in the flow and how they sequence; the step order, the modal's progress bar,
// each step's navigation, and the submission payload all read these.
// ---------------------------------------------------------------------------

import type {
  ApplicantRole,
  BusinessDocumentKey,
  KeyPersonRole,
  WorkflowBusinessConfig,
} from '../types/business';
import type { VerificationStep, QuestionnaireConfig, AddressCollectionConfig } from '../types/config';
import type { KeyPersonEntry } from '../context/types';
import { hasActiveQuestionnaire } from './questionnaire';
import { isValidContactEmail } from './business';
import { defaultText } from '../i18n/translate';
import type { TextFn } from '../i18n/types';
import { businessDocumentLabel } from './business-labels';

export {
  APPLICANT_ROLE_LABELS,
  BUSINESS_DOCUMENT_LABELS,
  KEY_PERSON_ROLE_LABELS,
  applicantRoleLabel,
  businessDocumentLabel,
  keyPersonRoleLabel,
} from './business-labels';

/** UI cap on applicant-entered key-people rows (server accepts ≤20). */
export const MAX_KEY_PEOPLE_ROWS = 10;

// ---------------------------------------------------------------------------
// Step gates
// ---------------------------------------------------------------------------

/** Whether the flow collects key people from the applicant. */
export function hasKeyPeopleCollection(business: WorkflowBusinessConfig | undefined): boolean {
  return business?.keyPeople?.enabled === true && business.keyPeople.collect === true;
}

/** Whether the flow collects supporting business documents. */
export function hasBusinessDocumentsStep(business: WorkflowBusinessConfig | undefined): boolean {
  return business?.documents?.enabled === true;
}

/** Whether the applicant verifies their own identity in-flow. */
export function hasApplicantVerification(business: WorkflowBusinessConfig | undefined): boolean {
  return business?.applicant?.verification === true;
}

export interface ResolvedBusinessDocumentType {
  key: BusinessDocumentKey;
  label: string;
  required: boolean;
}

/**
 * The document slots the flow renders. Enabled with absent/empty `types`
 * defaults to just a required incorporation certificate (server contract).
 */
export function resolveBusinessDocumentTypes(
  business: WorkflowBusinessConfig | undefined,
  t: TextFn = defaultText,
): ResolvedBusinessDocumentType[] {
  if (!hasBusinessDocumentsStep(business)) return [];
  const types = business?.documents?.types;
  if (!types || types.length === 0) {
    return [
      {
        key: 'incorporation_certificate',
        label: businessDocumentLabel('incorporation_certificate', t),
        required: true,
      },
    ];
  }
  return types.map((type) => ({
    key: type.key,
    label: type.label ?? businessDocumentLabel(type.key, t),
    required: type.required === true,
  }));
}

// ---------------------------------------------------------------------------
// Step sequencing — the business application section between consent and the
// questionnaire/submission
// ---------------------------------------------------------------------------

export type BusinessSectionStep =
  | 'business-details'
  | 'business-key-people'
  | 'business-documents'
  | 'applicant-role';

/**
 * Countries the KYB applicant's own capture leg may pick from: the org's
 * GRANTED countries (from the server config), since a business workflow
 * carries no individual `countries` list — and the person filling the form
 * may hold an ID issued anywhere the org can verify.
 */
export function applicantCountries(idTypes: Array<{ country: string }>): string[] {
  const seen = new Set<string>();
  for (const row of idTypes) seen.add(row.country.toUpperCase());
  return [...seen];
}

/**
 * The applicant leg's effective country options: the mapped applicant
 * workflow's `countries` when one overlayed them onto the config (see
 * overlayApplicantWorkflow), else the granted fallback above. Every applicant
 * country-select consumer (continue branch, back nav, the step itself) reads
 * THIS so the three can never disagree.
 */
export function applicantCountryOptions(config: {
  countries?: Array<{ country: string }>;
  serverConfig: { idTypes: Array<{ country: string }> };
}): string[] {
  const configured = [...new Set((config.countries ?? []).map((c) => c.country.toUpperCase()))];
  return configured.length > 0 ? configured : applicantCountries(config.serverConfig.idTypes);
}

/** The ordered business-application steps this workflow configures. */
export function businessSectionSteps(
  business: WorkflowBusinessConfig | undefined,
  withQuestionnaire = false,
  withAddressCollection = false,
): (BusinessSectionStep | 'questionnaire' | 'address-collection')[] {
  const steps: (BusinessSectionStep | 'questionnaire' | 'address-collection')[] = [
    'business-details',
  ];
  // The premises pin follows the company details it is about — before the
  // paperwork, and long before the application hands over to other people.
  // Mirrors the RN SDK's businessSectionSteps.
  if (withAddressCollection) steps.push('address-collection');
  // Documents BEFORE key people: they are about the company the applicant has
  // just identified, so they follow that thread, and the register's officer
  // list - which the key-people step is a confirmation of - is what the reader
  // should still have in mind when they get to naming people. Asking for
  // paperwork after that breaks the sequence in the middle.
  if (hasBusinessDocumentsStep(business)) steps.push('business-documents');
  // The questionnaire BEFORE key people: its questions are about the COMPANY
  // (volumes, source of funds), so they belong with the company section — and
  // naming the directors leads into their verification, which is where the
  // application hands over to other people and stops being the applicant's
  // own form to finish.
  if (withQuestionnaire) steps.push('questionnaire');
  if (hasKeyPeopleCollection(business)) steps.push('business-key-people');
  if (hasApplicantVerification(business)) steps.push('applicant-role');
  return steps;
}

/**
 * The step after `current` in the business flow. `applicant-role` hands off to
 * the ordinary individual capture leg ('id-type'); after the last section step
 * the flow continues to the questionnaire (when active) or submission. Callers
 * map a 'submitted' return to `SUBMIT_VERIFICATION` (existing convention).
 */
export function nextBusinessStep(
  current: BusinessSectionStep | 'questionnaire' | 'address-collection',
  config: {
    business?: WorkflowBusinessConfig;
    questionnaire?: QuestionnaireConfig;
    addressCollection?: AddressCollectionConfig;
  },
): VerificationStep {
  if (current === 'applicant-role') return 'id-type';
  const order = businessSectionSteps(
    config.business,
    hasActiveQuestionnaire(config.questionnaire),
    config.addressCollection?.enabled === true,
  );
  const next = order[order.indexOf(current) + 1];
  if (next) return next;
  return 'submitted';
}

/** The step before `current` in the business application section. */
export function prevBusinessStep(
  current: BusinessSectionStep | 'questionnaire' | 'address-collection',
  config: {
    business?: WorkflowBusinessConfig;
    questionnaire?: QuestionnaireConfig;
    addressCollection?: AddressCollectionConfig;
  },
): VerificationStep {
  const order = businessSectionSteps(
    config.business,
    hasActiveQuestionnaire(config.questionnaire),
    config.addressCollection?.enabled === true,
  );
  const idx = order.indexOf(current);
  return idx > 0 ? order[idx - 1]! : 'consent';
}

// ---------------------------------------------------------------------------
// Key-people rows — validation + submit payload
// ---------------------------------------------------------------------------

const KEY_PERSON_ROLES: readonly KeyPersonRole[] = [
  'director',
  'beneficial_owner',
  'signatory',
  'shareholder',
];

/** "Richard Ingwe" → "RI" — the avatar monogram used on person cards. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((t) => t[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * A blank row is not an error — it is a row the user started and abandoned,
 * and it is simply dropped. Only a row with SOMETHING in it can be invalid.
 */
export function isKeyPersonRowBlank(row: KeyPersonEntry): boolean {
  return (
    row.name.trim() === '' &&
    row.email.trim() === '' &&
    row.country.trim() === '' &&
    row.ownershipPct.trim() === ''
  );
}

/** Rows the user has begun but not made valid — what blocks Continue. */
export function invalidKeyPersonRows(
  rows: KeyPersonEntry[],
  emailRequiredFor: ReadonlySet<KeyPersonRole> = new Set(),
): number[] {
  return rows
    .map((row, i) => (!isKeyPersonRowBlank(row) && !isKeyPersonRowValid(row, emailRequiredFor) ? i : -1))
    .filter((i) => i >= 0);
}

/** Whether THIS row owes an address: not a company, and ANY held role is in
 *  the required set - a director who is also a UBO owes one when either does. */
export function rowNeedsEmail(
  row: KeyPersonEntry,
  emailRequiredFor: ReadonlySet<KeyPersonRole>,
): boolean {
  const roles = row.roles && row.roles.length > 0 ? row.roles : [row.role];
  return !row.isCorporate && roles.some((r) => emailRequiredFor.has(r));
}

/**
 * Row validity: name >=2 chars + known role; email/ownership validated when typed.
 *
 * `requireEmail` makes the address mandatory rather than merely well-formed.
 * The server enforces it too, but only at SUBMIT - several steps later, as a
 * generic failure screen, with no way back to the row that is missing one. The
 * check belongs where the field is.
 */
export function isKeyPersonRowValid(
  row: KeyPersonEntry,
  emailRequiredFor: ReadonlySet<KeyPersonRole> = new Set(),
): boolean {
  if (row.name.trim().length < 2) return false;
  const roles = row.roles && row.roles.length > 0 ? row.roles : [row.role];
  if (!roles.every((r) => KEY_PERSON_ROLES.includes(r))) return false;
  // A company has no inbox of its own and is never sent an invite, so requiring
  // one would block a disclosure the applicant is right to make.
  if (rowNeedsEmail(row, emailRequiredFor) && row.email.trim() === '') return false;
  if (row.email.trim() !== '' && !isValidContactEmail(row.email.trim())) return false;
  if (row.ownershipPct.trim() !== '') {
    const pct = Number(row.ownershipPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return false;
  }
  return true;
}

/**
 * Map valid rows into the verify payload shape (capped at the server's 20).
 * `applicantIndex` (an index into the UNfiltered `rows`) flags the entry the
 * applicant picked as themselves — the server merges it with the applicant
 * row so one human never becomes two KeyPerson records.
 */
export function keyPeoplePayload(
  rows: KeyPersonEntry[],
  applicantIndex: number | null = null,
): Array<{
  name: string;
  role: KeyPersonRole;
  roles: KeyPersonRole[];
  title?: string;
  email?: string;
  country?: string;
  ownershipPct?: number;
  isCorporate?: boolean;
  registrationNumber?: string;
  owners?: Array<{ name: string; ownershipPct?: number; email?: string; country?: string }>;
  isApplicant?: boolean;
}> {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => isKeyPersonRowValid(row))
    .slice(0, 20)
    .map(({ row, index }) => ({
      name: row.name.trim(),
      role: row.role,
      // Every hat they wear - the server merges the set with its own
      // ownership escalation and derives the headline by precedence.
      roles: row.roles && row.roles.length > 0 ? row.roles : [row.role],
      ...(row.title?.trim() ? { title: row.title.trim() } : {}),
      ...(row.email.trim() !== '' ? { email: row.email.trim() } : {}),
      ...(row.country.trim() !== '' ? { country: row.country.trim().toUpperCase() } : {}),
      ...(row.ownershipPct.trim() !== '' ? { ownershipPct: Number(row.ownershipPct) } : {}),
      // A company cannot also be the person filling in the form, so the
      // applicant's own entry is never sent as one.
      ...(row.isCorporate && index !== applicantIndex ? { isCorporate: true } : {}),
      ...(row.isCorporate && row.registrationNumber.trim() !== ''
        ? { registrationNumber: row.registrationNumber.trim() }
        : {}),
      ...(row.isCorporate && index !== applicantIndex ? ownersPayload(row.owners) : {}),
      ...(index === applicantIndex ? { isApplicant: true } : {}),
    }));
}

/** Declared owners, dropping the half-typed ones. Absent when none are valid. */
function ownersPayload(
  owners: KeyPersonEntry['owners'],
): { owners?: Array<{ name: string; ownershipPct?: number; email?: string; country?: string }> } {
  const valid = (owners ?? [])
    .filter((o) => o.name.trim().length >= 2)
    .slice(0, 10)
    .map((o) => {
      const pct = Number(o.ownershipPct);
      return {
        name: o.name.trim(),
        ...(o.ownershipPct.trim() !== '' && Number.isFinite(pct) && pct >= 0 && pct <= 100
          ? { ownershipPct: pct }
          : {}),
        ...(o.email.trim() !== '' ? { email: o.email.trim() } : {}),
        ...(o.country.trim() !== '' ? { country: o.country.trim().toUpperCase() } : {}),
      };
    });
  return valid.length > 0 ? { owners: valid } : {};
}

/**
 * The self-selected key person's ID-issuing country (uppercase ISO-2), when
 * the applicant picked themselves AND that entry carries one. The applicant
 * leg then SKIPS the country-select step — they already answered "where was
 * your ID issued?" on the key-people step.
 */
export function applicantSelfCountry(app: {
  keyPeople: KeyPersonEntry[];
  applicantKeyPersonIndex: number | null;
}): string | null {
  if (app.applicantKeyPersonIndex === null) return null;
  const country = app.keyPeople[app.applicantKeyPersonIndex]?.country.trim();
  return country ? country.toUpperCase() : null;
}

/**
 * Loose "is this the same person?" match used ONLY to PRE-SELECT the
 * applicant's own entry on the applicant-role step (from the consumer's
 * userData). Every token of the shorter name must appear in the longer one,
 * so "Richard Ingwe" matches "Richard A. Ingwe" but never "Jane Ingwe". The
 * user still confirms explicitly — this never merges anything by itself.
 */
export function namesLooselyMatch(a: string, b: string): boolean {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return shorter.every((t) => longer.includes(t));
}

/** Whether every listed person must carry an email address. */
export function keyPeopleRequireEmail(
  business: import('../types/business').WorkflowBusinessConfig | undefined,
): Set<KeyPersonRole> {
  const kp = business?.keyPeople;
  if (!kp?.enabled || !kp.collect || !kp.requireEmail) return new Set();
  if (kp.requireEmailRoles?.length) return new Set(kp.requireEmailRoles);
  // The roles that are actually sent an invite. Asking a screening-only
  // signatory for an address blocks the form over a field nothing will read.
  return new Set(
    KEY_PERSON_ROLES.filter((r) => (kp.perRole?.[r] ?? kp.level ?? 'screening_only') === 'full_kyc'),
  );
}

/** Minimum applicant-listed people the workflow demands (0 = skippable). */
export function keyPeopleMinEntries(
  business: import('../types/business').WorkflowBusinessConfig | undefined,
): number {
  const kp = business?.keyPeople;
  if (!kp?.enabled || !kp.collect) return 0;
  return kp.minEntries ?? 0;
}

/** Split a typed full name into userData first/last (best-effort). */
export function splitFullName(
  name: string,
): { firstName?: string; lastName?: string } | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, ...(rest.length > 0 ? { lastName: rest.join(' ') } : {}) };
}
