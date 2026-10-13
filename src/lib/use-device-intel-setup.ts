// Device Intelligence setup for one mounted flow, called by VerificationConfigProvider:
// tells the upload path whether to send `X-Myaza-Device-Id`, and starts the
// async half of `fingerprint.entropy` early so the sync submit finds it ready.
// Both follow the workflow's `deviceIntelligence` switch (on unless false),
// the same rule the fingerprint itself follows at submit.

import { useEffect } from 'react';
import { setUploadDeviceIdEnabled } from './upload-device-id';
import { primeFingerprintEntropy } from './fingerprint-entropy';

export function useDeviceIntelSetup(deviceIntelligence: boolean | undefined, previewMode?: boolean): void {
  const enabled = deviceIntelligence !== false;
  useEffect(() => {
    setUploadDeviceIdEnabled(enabled);
    // The builder preview stubs every write, so it collects nothing.
    if (enabled && !previewMode) void primeFingerprintEntropy();
  }, [enabled, previewMode]);
}
