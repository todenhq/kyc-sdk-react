'use client';

import { useVerificationConfig } from '../context/VerificationConfigContext';

export interface ResolvedBranding {
  /**
   * Logo URL to render, or undefined when there's nothing to show.
   * Resolves the `appearance.logo = 'default'` sentinel to the org's logo from
   * the server config response; any other value is used as a literal image URL.
   */
  logo?: string;
  /** Company name, from `appearance.companyName` or the server config. */
  companyName?: string;
}

/** Resolves the effective branding (logo + company name) for the current org. */
export function useBranding(): ResolvedBranding {
  const config = useVerificationConfig();
  const serverBranding = config.serverConfig.branding;
  const configuredLogo = config.appearance?.logo;

  return {
    logo: configuredLogo === 'default' ? serverBranding?.logo : configuredLogo,
    companyName: config.appearance?.companyName ?? serverBranding?.companyName,
  };
}
