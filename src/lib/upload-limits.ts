// ─── Upload size limits ───────────────────────────────────────────────────────
//
// One rule for every document the applicant attaches (proof of address, the
// KYB company documents, the entrance photo): images up to 5 MB, PDFs up to
// 15 MB (user decision 2026-09-06). The server's own cap is higher, so refusing
// here gives an immediate, specific message instead of a slow 413. A THREE-WAY
// MIRROR with RN `config/uploadLimits.ts` and Flutter `config/upload_limits.dart`,
// pinned to `sdk-flutter/test/upload_limits_vectors.json`.

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PDF_MAX_BYTES = 15 * 1024 * 1024;

/** The line under every drop zone: what is accepted, and how big. */
export const UPLOAD_HINT = 'PDF, JPG, PNG · PDF max 15 MB, images max 5 MB';

export function isPdfMime(mime: string | null | undefined): boolean {
  return (mime?.split(';')[0] ?? '').trim().toLowerCase() === 'application/pdf';
}

/**
 * The refusal for a file over its cap, or null when it fits. An unknown size
 * also passes: the server still judges the bytes at its own cap, and a picker
 * that reports no size must not block a good file.
 */
export function uploadSizeError(
  mime: string | null | undefined,
  size: number | null | undefined,
): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size)) return null;
  if (isPdfMime(mime)) return size > PDF_MAX_BYTES ? 'PDF is too large (max 15 MB).' : null;
  return size > IMAGE_MAX_BYTES ? 'Image is too large (max 5 MB).' : null;
}
