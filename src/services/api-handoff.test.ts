import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKYCApi, type HandoffSessionSnapshot } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createHandoffSession', () => {
  it('encodes the child identity when returning a handoff', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cancelled: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await createKYCApi('https://core.example.test', 'hs_synthetic-root').cancelHandoffSession('child/session');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://core.example.test/api/kyc/session/child%2Fsession');
  });
  it('returns the exact child using the existing hosted bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cancelled: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createKYCApi('https://core.example.test', 'hs_synthetic-root')
      .cancelHandoffSession('child-session')).resolves.toEqual({ cancelled: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://core.example.test/api/kyc/session/child-session');
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer hs_synthetic-root');
  });

  it('preserves the server refusal when the other device already opened the link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'handoff_session_in_use', message: 'Continue on your other device.',
    }), { status: 409, headers: { 'content-type': 'application/json' } })));
    await expect(createKYCApi('https://core.example.test', 'hs_synthetic-root')
      .cancelHandoffSession('child-session')).rejects.toMatchObject({ code: 'handoff_session_in_use' });
  });

  it('sends the embedded KYB snapshot and non-rendered parent session identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionId: 'child-session',
      code: 'ABC123',
      url: 'https://verify.example.test/ABC123',
      expiresAt: '2026-09-01T00:00:00.000Z',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const snapshot: HandoffSessionSnapshot = {
      subjectType: 'business',
      workflowId: 'wf_kyb',
      business: {
        country: 'NG',
        products: ['business'],
        applicant: { verification: true, workflowId: 'wf_applicant' },
      },
    };

    await createKYCApi('https://core.example.test', 'pk_test_example')
      .createHandoffSession(snapshot, 'root-session');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://core.example.test/api/kyc/session');
    expect(JSON.parse(String(init.body))).toEqual({
      ...snapshot,
      parentSessionId: 'root-session',
    });
    expect(snapshot).not.toHaveProperty('parentSessionId');
  });
});
