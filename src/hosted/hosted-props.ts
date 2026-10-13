import type { CompletedSessionSummary, HandoffBootstrapResponse } from '../services/api';
import type { VerificationAppearance, VerificationStep } from '../types/config';
import type { VerificationError, VerificationResult, VerificationSubmission } from '../types/verification';

// The hosted entry point's public props, split out of HostedVerification.tsx
// (200-line rule). Re-exported from there, so the public surface is unchanged.

/** What a hosted flow knows about its session once it has bootstrapped. */
export interface HostedVerificationReadyInfo {
  sessionId: string;
  environment: HandoffBootstrapResponse['environment'];
  subjectType?: string;
  scope?: string;
}

export interface HostedVerificationProps {
  /**
   * The raw handoff session token from the hosted-page URL
   * (`/verify/<token>`). The SDK presents it as a `hs_<token>` bearer.
   */
  token: string;
  /**
   * The API origin to call DIRECTLY, e.g. `https://trust.myaza.app`. Absent
   * (the default, `''`), every request goes same-origin through the hosting
   * page's `/api` proxy — which was how the hosted page always ran, and why
   * the API saw that page's SERVER as the applicant: Device Intelligence
   * recorded a US datacentre for everyone, the phone step defaulted every
   * applicant to the United States, and the country a proof-of-address is
   * declared for opened blank. A hosted session authenticates with its
   * bearer and needs no cookie, so it has no reason to be proxied; the hosted
   * page passes the origin it would have proxied to anyway.
   */
  serverUrl?: string;
  /**
   * Mount INSIDE a host application rather than on the hosted page. Implies
   * shadow-DOM style isolation (the SDK carries its own stylesheet; no global
   * `styles.css` import, and the host app's CSS cannot reach in), swaps the
   * full-page loading/terminal chrome for compact blocks that sit in a panel,
   * and makes the modal closable — the success screen's action becomes a real
   * Done button wired to {@link onClose}. The hosted page passes nothing and
   * keeps its full-page, light-DOM behaviour exactly as before.
   */
  embedded?: boolean;
  /**
   * The workflow's appearance, when the hosting PAGE already knows it. The
   * hosted pages read it on the server from
   * `GET /api/v1/session/by-token/:token/appearance` (or the link's twin) and
   * pass it here, so the loading and terminal screens paint in the org's
   * colours from the first frame. Without it those screens wore the SDK
   * default (Myaza purple) until the bootstrap answered, then repainted: a
   * brand flash on every hosted open. Once the bootstrap arrives its
   * snapshot's appearance takes over; the two are the same data.
   */
  appearance?: VerificationAppearance;
  /** Embedded mounts: the modal was closed or the flow's Done was pressed. */
  onClose?: () => void;
  /**
   * The hosted page's lifecycle, for a HOST that wants to listen — the hosted
   * page forwards these to a native WebView or an embedding iframe. Mirrors
   * `<Verification/>`'s callbacks; `onReady` and `onCompleted` are hosted-only.
   * Everything they carry is PII-light: ids, step names, error codes.
   */
  onReady?: (info: HostedVerificationReadyInfo) => void;
  onStart?: () => void;
  onStepChange?: (step: VerificationStep) => void;
  onSubmit?: (submission: VerificationSubmission) => void;
  /** The verdict, on a session that waits for it in the flow (a biometric re-authentication). */
  onResult?: (result: VerificationResult) => void;
  onError?: (error: VerificationError) => void;
  /** A returning applicant opened a link whose verification was already submitted. */
  onCompleted?: (summary: CompletedSessionSummary | null) => void;
}
