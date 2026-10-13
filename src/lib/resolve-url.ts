// ---------------------------------------------------------------------------
// Automatic environment detection from the API key prefix
//
// The environment is encoded in the key prefix — it is the single source of
// truth (there is no manual environment option). The prefix carries two
// dimensions: scope (`pk` publishable / `sk` secret) and environment
// (`dev`/`test`/`live`). We read ONLY the environment portion, so detection
// works for both key types. Mirrors the server's KEY_PREFIXES
// (kyc-core/src/lib/api-keys.ts):
//
//   pk_dev_…  / sk_dev_…   → development
//   pk_test_… / sk_test_…  → sandbox
//   pk_live_… / sk_live_…  → production
// ---------------------------------------------------------------------------

/** Internal environment the SDK resolves a base URL for. Not a public option. */
export type SdkEnvironment = 'development' | 'sandbox' | 'production';

/** Canonical base URLs per environment (see kyc-dashboard environments docs). */
const BASE_URLS: Record<Exclude<SdkEnvironment, 'development'>, string> = {
  // Sandbox and production share the same host; the key prefix selects the env.
  sandbox: 'https://trust.myaza.app',
  production: 'https://trust.myaza.app',
};

/** Default base URL used for development keys when no `devUrl` is provided. */
const DEFAULT_DEV_URL = 'http://localhost:3001';

// Matches the environment slot of a Myaza API key prefix, regardless of the
// pk_/sk_ scope: pk_dev_ / sk_dev_ / pk_test_ / sk_test_ / pk_live_ / sk_live_.
const KEY_ENV_RE = /^(?:pk|sk)_(dev|test|live)_/;

const ENV_BY_PREFIX: Record<'dev' | 'test' | 'live', SdkEnvironment> = {
  dev: 'development',
  test: 'sandbox',
  live: 'production',
};

/**
 * Derives the environment from the API key prefix. Throws a clear error on an
 * unrecognized / malformed key — never silently defaults (defaulting to
 * production would be dangerous).
 */
export function detectEnvironment(apiKey: string): SdkEnvironment {
  const match = typeof apiKey === 'string' ? apiKey.match(KEY_ENV_RE) : null;
  if (!match) {
    throw new Error(
      'Invalid Toden API key: expected a dev, test, or live key prefix ' +
        '(e.g. pk_dev_…, pk_test_…, or pk_live_…).',
    );
  }
  return ENV_BY_PREFIX[match[1] as 'dev' | 'test' | 'live'];
}

/**
 * Resolves the API base URL from the API key. The environment is detected from
 * the key prefix:
 * - development → `devUrl` if provided, otherwise `http://localhost:3001`.
 * - sandbox / production → the hardcoded URL (`devUrl` is ignored).
 *
 * Throws on an invalid key (via {@link detectEnvironment}).
 */
export function resolveBaseUrl(apiKey: string, devUrl?: string): string {
  const environment = detectEnvironment(apiKey);
  if (environment === 'development') {
    return devUrl ?? DEFAULT_DEV_URL;
  }
  return BASE_URLS[environment];
}
