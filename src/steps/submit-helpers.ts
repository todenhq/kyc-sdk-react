// ---------------------------------------------------------------------------
// Submission helpers for SubmittedStep — request-id/token utilities, the
// shared metadata builder, and the best-effort video uploads. Extracted so
// the step file stays within the 200-line rule.
// ---------------------------------------------------------------------------

import { collectFingerprint } from '../lib/fingerprint';
import { collectWebDeviceMetadata } from '../utils/device-metadata';
import { withRetry } from '../lib/retry';
import type { VerificationApi, VerifyRequest } from '../services/api';
import { withSilentCaptureDevice, type SilentCaptureSubmission } from '../lib/silent-capture';
import { settleSilentUploads, silentCaptureSubmission } from '../lib/silent-capture-store';

// Re-exported so existing `./submit-helpers` importers keep working; the token
// logic now lives in one place (shared with ConsentStep).
export { fillTokens } from '../lib/tokens';

export function generateRequestId(prefix: 'kyc' | 'kyb' = 'kyc'): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * `metadata` is free-form passthrough. The SDK-owned keys (`requestId` — the
 * server's idempotency key — and `device`) are written AFTER the caller's
 * metadata so consumer keys can never clobber them. Identical on Flutter + RN.
 */
export function buildSubmitMetadata(
	consumerMetadata: Record<string, string> | undefined,
	requestId: string,
	/** Workflow toggle: false skips fingerprint collection entirely (the server
	 *  also skips the analysis + its charge for that workflow). */
	deviceIntelligence = true,
): VerifyRequest['metadata'] {
	const base = collectWebDeviceMetadata() as unknown as Record<string, unknown>;
	// Device Intelligence: raw components — hashed server-side.
	const fingerprint = deviceIntelligence ? collectFingerprint() : null;
	return {
		...consumerMetadata,
		requestId,
		device: fingerprint ? { ...base, fingerprint } : base,
	};
}

export interface UploadedVideoIds {
	documentFrontVideo?: string;
	documentBackVideo?: string;
	livenessVideo?: string;
}

/**
 * Upload video recordings (best-effort — failures do not block verification).
 * Each gets the same transient-retry treatment, but a final failure is
 * swallowed.
 */
export async function uploadCaptureVideos(
	api: VerificationApi,
	blobs: {
		documentFrontVideoBlob: Blob | null;
		documentBackVideoBlob: Blob | null;
		livenessVideoBlob: Blob | null;
	},
): Promise<UploadedVideoIds> {
	const upload = async (
		blob: Blob | null,
		type: 'document_front_video' | 'document_back_video' | 'liveness_video',
	) => {
		if (!blob) return undefined;
		try {
			return await withRetry(() => api.upload(blob, type));
		} catch {
			return undefined; /* non-fatal */
		}
	};
	return {
		documentFrontVideo: await upload(blobs.documentFrontVideoBlob, 'document_front_video'),
		documentBackVideo: await upload(blobs.documentBackVideoBlob, 'document_back_video'),
		livenessVideo: await upload(blobs.livenessVideoBlob, 'liveness_video'),
	};
}

/**
 * The silent-capture frames that uploaded, once any still in flight have had
 * a moment to land. Never throws; an empty result submits nothing extra.
 */
export async function silentCaptureForSubmit(): Promise<SilentCaptureSubmission> {
	try {
		await settleSilentUploads();
		return silentCaptureSubmission();
	} catch {
		return { mediaIds: {}, device: [] };
	}
}

/** The submit metadata with the frames described on its device block. */
export function withSilentCaptureMetadata(
	metadata: VerifyRequest['metadata'],
	silent: SilentCaptureSubmission,
): VerifyRequest['metadata'] {
	if (silent.device.length === 0) return metadata;
	return { ...metadata, device: withSilentCaptureDevice(metadata.device, silent.device) };
}
