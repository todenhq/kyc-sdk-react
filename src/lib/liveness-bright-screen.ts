import type { VerificationStep } from '../types/config';

/**
 * Bright screen during the selfie (workflow `livenessBrightScreen`).
 *
 * A browser cannot raise the display's brightness, but it can choose what the
 * display shows. While the liveness camera is on, the flow switches to its
 * LIGHT palette (the organisation's base appearance colours, never its dark
 * overrides) so the screen itself lights the person's face, and the previous
 * theme comes back when the step ends. These are the two pure decisions; the
 * DOM side lives in forced-light-theme.ts.
 */

/** On unless the workflow (or a prop-configured mount) says `false`. */
export function livenessBrightScreenOn(config: { livenessBrightScreen?: boolean }): boolean {
  return config.livenessBrightScreen !== false;
}

export interface ForceLightInput {
  /** The workflow switch, resolved by {@link livenessBrightScreenOn}. */
  enabled: boolean;
  /** The flow is open (a closed modal never holds the page light). */
  open: boolean;
  /** The step the modal is actually rendering. */
  step: VerificationStep;
  /**
   * The liveness step has reached its camera screen (latched for the step).
   * The builder preview reports its camera stand-in the same way, so the
   * "I'm ready" screen before it keeps the person's own theme there too.
   */
  cameraShown: boolean;
}

/**
 * Whether the flow should be held on its light palette right now. Only ever
 * the liveness step: every other step keeps the person's own theme.
 */
export function shouldForceLightTheme(input: ForceLightInput): boolean {
  if (!input.enabled || !input.open || input.step !== 'liveness') return false;
  return input.cameraShown;
}

/**
 * The theme to put back when the forced light ends. `wantDark` is what the
 * flow asked for while it was held light (its state on entry, updated by
 * anything that tried to set dark meanwhile). A 'system' theme follows the
 * device's CURRENT preference instead, so an OS switch mid-selfie is honoured
 * rather than reverted to what it was on entry.
 */
export function restoreDarkAfterForcedLight(
  wantDark: boolean,
  configuredTheme: 'light' | 'dark' | 'system' | undefined,
  systemPrefersDark: boolean,
): boolean {
  if (configuredTheme === 'system') return systemPrefersDark;
  return wantDark;
}
