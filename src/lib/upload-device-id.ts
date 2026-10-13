// Device Intelligence: the per-install id on every `POST /api/v1/upload`
// (`X-Myaza-Device-Id`, wire contract 2026-10-01). The server records it on
// each upload to tell whether one session's captures came from more than one
// device. The value is EXACTLY the submission's `fingerprint.deviceId`.
//
// The API client is built before the workflow resolves, so it cannot see the
// workflow's `deviceIntelligence` switch itself. VerificationConfigProvider writes the
// switch here (`setUploadDeviceIdEnabled`) and the upload reads it. Module
// state, so two SDK mounts on one page share the switch; the default is on,
// matching the fingerprint's own default.

import { persistentDeviceId } from './fingerprint';

export const DEVICE_ID_HEADER = 'X-Myaza-Device-Id';

/** The server keeps at most this many characters. */
const MAX_DEVICE_ID_LENGTH = 64;

let enabled = true;

export function setUploadDeviceIdEnabled(on: boolean): void {
  enabled = on;
}

/** The header to merge into an upload request. Empty when off or no id. */
export function uploadDeviceIdHeader(): Record<string, string> {
  if (!enabled) return {};
  const id = persistentDeviceId();
  if (!id || id.length > MAX_DEVICE_ID_LENGTH) return {};
  return { [DEVICE_ID_HEADER]: id };
}
