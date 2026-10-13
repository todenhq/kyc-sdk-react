import type { SdkTrustAttribution } from '../services/api';

/**
 * Which footer attribution to render.
 *
 * The server's answer is the authority: it is resolved from the PUBLISHED
 * workflow, so a real verification can never show a draft. The builder's draft
 * only wins inside the write-free preview, so an author sees their change
 * before publishing it.
 */
export function effectiveTrustAttribution(
  server: SdkTrustAttribution | undefined,
  draft: SdkTrustAttribution | undefined,
  previewMode: boolean | undefined,
): SdkTrustAttribution | undefined {
  return previewMode === true && draft ? draft : server;
}

/**
 * Whether the consent screen must name Myaza. When an org's own logo replaces
 * Myaza's in the footer, Myaza still processes the applicant's data, so one
 * line on the consent screen keeps it disclosed with a link to its terms.
 */
export function needsProcessorDisclosure(attribution: SdkTrustAttribution | undefined): boolean {
  return attribution?.mode === 'custom';
}

/**
 * The organisation Myaza provides the verification for, as the consent notice
 * names it: the name the server attaches to the custom attribution (the org's
 * own), then the workflow's company name, then the branding name. The builder
 * preview answers branding from a sample fixture, so that one comes last.
 */
export function myazaProviderName(
  attribution: SdkTrustAttribution | undefined,
  workflowCompanyName?: string,
  brandingCompanyName?: string,
): string {
  const custom = attribution?.mode === 'custom' ? attribution.companyName : undefined;
  return (custom || workflowCompanyName || brandingCompanyName || '').trim();
}
