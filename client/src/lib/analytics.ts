/**
 * Thin wrapper around Google Analytics 4 (gtag.js).
 *
 * The GA snippet is loaded once in client/index.html. This module just
 * exposes a typed helper for firing custom events. Calls are safe before
 * gtag is loaded (no-op) and don't crash if window is unavailable (SSR).
 *
 * Event taxonomy for the guest -> signup funnel:
 *
 *   guest_prompt_sent       — guest sent a prompt (the meter ticked)
 *     params: prompt_number, remaining_after, limit
 *
 *   guest_limit_reached     — server returned 429 (out of prompts)
 *     params: limit, used
 *
 *   auth_modal_opened       — AuthDialog was opened
 *     params: mode (sign-in|sign-up|limit-reached), trigger
 *
 *   oauth_redirect_clicked  — user clicked Continue with Google/Facebook
 *     params: provider (google|facebook), mode
 *
 *   signup_completed        — user transitioned from guest -> authenticated
 *     params: from (guest), prompts_used_before_signup
 *
 * Build a funnel in GA4 Explore:
 *   guest_prompt_sent → auth_modal_opened → oauth_redirect_clicked → signup_completed
 */

type AnalyticsValue = string | number | boolean | undefined | null;
export type AnalyticsParams = Record<string, AnalyticsValue>;

interface GtagWindow {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
}

/**
 * Fire a GA4 custom event. No-op if gtag isn't available yet.
 *
 * Undefined/null param values are stripped so GA4's event property table
 * stays clean (GA4 treats explicit null as a string "null" otherwise).
 */
export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined") return;
  const w = window as GtagWindow;
  if (typeof w.gtag !== "function") return;

  const cleanParams: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    cleanParams[k] = v;
  }
  w.gtag("event", name, cleanParams);
}
