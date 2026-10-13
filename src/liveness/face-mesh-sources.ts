// ---------------------------------------------------------------------------
// Where the MediaPipe Face Mesh files are loaded from, in the order tried.
//
// They used to come from cdn.jsdelivr.net alone, with no version in the URL.
// When that CDN was slow or unreachable the liveness step never started, and
// "latest" meant a new upstream release could change what every applicant ran.
// The files are about 10.5 MB a session, far too much to inline in this
// package, so they are still fetched, but from a list:
//
//   1. the integrator's own host, when they set `assetsBasePath`
//   2. the KYC server the SDK is already talking to, which serves the exact
//      version below (kyc-core routes/sdk/face-mesh-assets.ts)
//   3. the public CDN, pinned to the same version
//
// A source that fails, or holds a different version, is skipped for the next.
// ---------------------------------------------------------------------------

/**
 * The one version every source is asked for. The server answers 404 for any
 * other, so move this together with kyc-core's `@mediapipe/face_mesh`
 * dependency, or every session falls back to the public CDN.
 */
export const FACE_MESH_VERSION = '0.4.1633559619';

export interface FaceMeshOrigin {
  /** The KYC server the SDK was mounted with. */
  serverUrl?: string;
  /** The integrator's own asset host: the files are read from `<base>/face-mesh/`. */
  assetsBasePath?: string;
}

const trimmed = (value: string | undefined): string => (value ?? '').trim().replace(/\/+$/, '');

/** The base URLs to try, in order, each ending in a slash. Never empty. */
export function faceMeshSources(origin: FaceMeshOrigin = {}): string[] {
  const own = trimmed(origin.assetsBasePath);
  const server = trimmed(origin.serverUrl);
  const sources = [
    own ? `${own}/face-mesh/` : null,
    server ? `${server}/api/v1/assets/face-mesh/${FACE_MESH_VERSION}/` : null,
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_MESH_VERSION}/`,
  ];
  return [...new Set(sources.filter((s): s is string => s !== null))];
}
