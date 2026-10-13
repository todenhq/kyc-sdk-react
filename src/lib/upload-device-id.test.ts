import { describe, it, expect, afterEach, vi } from 'vitest';
import { DEVICE_ID_HEADER, setUploadDeviceIdEnabled, uploadDeviceIdHeader } from './upload-device-id';
import { createVerificationApi } from '../services/api';

/** localStorage stand-in holding (or refusing) the per-install id. */
function stubStorage(stored: string | null, blocked = false) {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      if (blocked) throw new Error('SecurityError');
      return stored;
    },
    setItem: () => {
      if (blocked) throw new Error('SecurityError');
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUploadDeviceIdEnabled(true);
});

describe('uploadDeviceIdHeader', () => {
  it('carries the same id the fingerprint sends', () => {
    stubStorage('did-123');
    expect(uploadDeviceIdHeader()).toEqual({ [DEVICE_ID_HEADER]: 'did-123' });
  });

  it('is empty when the workflow turns Device Intelligence off', () => {
    stubStorage('did-123');
    setUploadDeviceIdEnabled(false);
    expect(uploadDeviceIdHeader()).toEqual({});
  });

  it('is empty when storage is blocked and there is no id', () => {
    stubStorage(null, true);
    expect(uploadDeviceIdHeader()).toEqual({});
  });

  it('is empty for an id longer than the server keeps', () => {
    stubStorage('x'.repeat(65));
    expect(uploadDeviceIdHeader()).toEqual({});
  });
});

describe('api.upload', () => {
  function stubFetch() {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ mediaId: 'med_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const headersOf = (fetchMock: ReturnType<typeof stubFetch>) =>
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;

  it('sends X-Myaza-Device-Id on the upload', async () => {
    stubStorage('did-abc');
    const fetchMock = stubFetch();
    const id = await createVerificationApi('https://api.test', 'pk_test_x').upload(new Blob(['x'], { type: 'image/jpeg' }), 'selfie');
    expect(id).toBe('med_1');
    expect(headersOf(fetchMock)[DEVICE_ID_HEADER]).toBe('did-abc');
    expect(headersOf(fetchMock).Authorization).toBe('Bearer pk_test_x');
  });

  it('omits the header when Device Intelligence is off', async () => {
    stubStorage('did-abc');
    setUploadDeviceIdEnabled(false);
    const fetchMock = stubFetch();
    await createVerificationApi('https://api.test', 'pk_test_x').upload(new Blob(['x'], { type: 'image/jpeg' }), 'selfie');
    expect(headersOf(fetchMock)).not.toHaveProperty(DEVICE_ID_HEADER);
  });
});
