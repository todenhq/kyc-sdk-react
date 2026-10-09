import type { KYCApi, VerificationStatusResponse, VerifyResponse } from './api';

/**
 * Preview-mode API wrapper (builder live preview). Every WRITE is stubbed so
 * walking the flow never leaves the browser — document photos, selfies, and
 * liveness videos are not uploaded, and no Verification row is ever created.
 * Read-only calls (config/workflow resolution) pass through untouched: the
 * preview still reflects the org's real granted ID types and branding.
 */
export function withPreviewMocks(api: KYCApi): KYCApi {
  let mediaCounter = 0;
  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  return {
    ...api,

    // Preview never touches the server, so it never has a real session — but the
    // shape has to exist or the open handler would throw on a missing method.
    async startSession() {
      return { sessionId: 'preview_session', expiresAt: new Date().toISOString(), resumed: false };
    },

    async saveProgress(): Promise<void> {
      /* preview never persists */
    },

    async upload(): Promise<string> {
      await delay(350); // keep the real "uploading…" affordance visible
      mediaCounter += 1;
      return `preview_media_${mediaCounter}`;
    },

    async uploadSignature(): Promise<string> {
      await delay(350);
      mediaCounter += 1;
      return `preview_media_${mediaCounter}`;
    },

    // The check reads an uploaded photo, and the preview uploads nothing.
    async checkDocumentCapture(body: { side: 'front' | 'back' }) {
      return { side: body.side, face: null, barcode: null };
    },

    async verify(): Promise<VerifyResponse> {
      await delay(500);
      // applicantKeyPersonId stays null so the KYB applicant double-submit
      // never fires in preview (nothing real to link it to).
      return { verificationId: 'preview_verification', status: 'pending', applicantKeyPersonId: null, keyPeopleInvites: [] };
    },

    // The preview submission settles at once: a flow that waits for its
    // verdict (a biometric re-authentication) would otherwise spin for the
    // whole wait budget in the builder, on an id nothing will ever settle.
    async status(verificationId: string): Promise<VerificationStatusResponse> {
      await delay(600);
      return {
        verificationId,
        status: 'approved',
        checkStatus: 'verified',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    },

    // The registry check is a PAID call, so the builder preview must never make
    // it: an author walking their own flow would be charging the org a lookup
    // per click. Canned officers keep the prefill visible, which is the part
    // worth previewing.
    async businessRegions() {
      return { regions: [] };
    },
    async businessSearch() {
      await delay(300);
      return {
        results: [
          { name: 'Preview Trading Ltd', registrationNumber: 'RC0000001', status: 'ACTIVE' },
          { name: 'Preview Holdings Plc', registrationNumber: 'RC0000002', status: 'ACTIVE' },
        ],
        source: 'preview',
      };
    },

    async businessSelect(body: { registrationNumber: string }) {
      await delay(400);
      return {
        checked: true,
        found: true,
        charged: false,
        business: {
          name: 'Preview Trading Ltd',
          registrationNumber: body.registrationNumber,
          registrationDate: '2018-03-12T00:00:00.000Z',
          typeOfEntity: 'PRIVATE COMPANY LIMITED BY SHARES',
          companyStatus: 'ACTIVE',
          address: '12 Preview Avenue',
          email: 'hello@preview.example',
          phone: '+234 800 000 0000',
          taxId: '01234567-0001',
          vatNumber: null,
          natureOfBusiness: 'Wholesale and retail trading',
          city: 'Lagos',
          state: 'Lagos',
          keyPeople: [
            { name: 'Jane Preview', designation: 'DIRECTOR' },
            { name: 'Bola Preview', designation: 'SHAREHOLDER' },
          ],
        },
      };
    },

    // Contact verification: nothing is sent and any code passes — walking the
    // OTP steps in the builder preview stays side-effect free.
    async contactSend(body: { channel: 'email' | 'phone' }) {
      await delay(350);
      return {
        challengeId: `preview_challenge_${body.channel}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        deliveryChannel: 'test',
      };
    },

    async contactCheck() {
      await delay(300);
      return { verified: true, token: 'preview_contact_proof' };
    },

    async createHandoffSession(): Promise<never> {
      throw new Error('Device handoff is unavailable in preview mode.');
    },
  };
}
