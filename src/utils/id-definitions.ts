// ---------------------------------------------------------------------------
// ID-type definition resolver (Global Documents)
//
// The server verifies individual KYC in ANY ISO country via generic document
// types (`passport`, `drivers-license`, `national-id`), so the SDK must render
// (country, idType) pairs it has NO local definition for. This resolver
// produces an `IdTypeDefinition` per pair: the curated LOCAL entry wins when
// one exists (it carries digits/pattern validation and hand-tuned labels for
// the five curated countries); otherwise one is SYNTHESIZED from the server
// row's `label` / `requiresDocumentCapture` / `scanSides`. Steps consult this
// (via `useVerificationConfig().getIdTypeDefinition`) instead of `ID_TYPES` directly.
// ---------------------------------------------------------------------------

import { ID_TYPES } from './countries';
import type { SdkConfigIdType } from '../services/api';
import type { AnyCountry, IdTypeDefinition, SupportedCountry } from '../types/config';

/** "drivers-license" → "Drivers License", "national-id" → "National ID". */
function fallbackLabel(idType: string): string {
  return idType
    .split(/[-_]/)
    .map((word) => (word.toLowerCase() === 'id' ? 'ID' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Build a definition from a server idTypes row (no digits/pattern — the
 *  server owns validation for these; a free-text input applies if ever typed). */
function synthesizeDefinition(row: SdkConfigIdType): IdTypeDefinition {
  const requiresDocumentCapture = row.requiresDocumentCapture ?? true;
  return {
    key: row.idType,
    label: row.label ?? fallbackLabel(row.idType),
    requiresDocumentCapture,
    ...(requiresDocumentCapture ? { scanSides: row.scanSides ?? 'front_only' } : {}),
  };
}

/**
 * Resolve the definition for one `(country, idType)` pair — local first, then
 * server-synthesized. Null when neither side knows the pair.
 */
export function resolveIdTypeDefinition(
  country: AnyCountry,
  idType: string,
  serverRows: SdkConfigIdType[],
): IdTypeDefinition | null {
  const local = (ID_TYPES[country as SupportedCountry] ?? []).find((t) => t.key === idType);
  if (local) return local;
  const row = serverRows.find((r) => r.country === country && r.idType === idType);
  return row ? synthesizeDefinition(row) : null;
}

/**
 * Every definition available for a country: the curated local list (in its
 * hand-tuned order) plus server-granted pairs with no local entry, appended in
 * server order. For non-curated countries this is entirely server-driven.
 */
export function listIdTypeDefinitions(
  country: AnyCountry,
  serverRows: SdkConfigIdType[],
): IdTypeDefinition[] {
  const local = ID_TYPES[country as SupportedCountry] ?? [];
  const localKeys = new Set(local.map((t) => t.key));
  const serverOnly = serverRows
    .filter((r) => r.country === country && !localKeys.has(r.idType))
    .map(synthesizeDefinition);
  return [...local, ...serverOnly];
}
