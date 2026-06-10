import { useCallback } from "react";
import { useGoogleOneTapLogin, type CredentialResponse } from "@react-oauth/google";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

const DISMISSED_FLAG = "aitaxmd_one_tap_dismissed";

/**
 * Renders nothing visually — its job is to trigger Google's One Tap prompt
 * (the small "Sign in as <name>" card Google shows in the page corner) for
 * guests who already have a Google session in this browser.
 *
 * Must be mounted INSIDE a <GoogleOAuthProvider>. App.tsx only mounts it when
 * VITE_GOOGLE_CLIENT_ID is configured at build time.
 *
 * On successful credential receipt, POSTs the JWT to /api/auth/google/one-tap
 * for server-side verification, then invalidates the auth + guest queries so
 * the header re-renders as authenticated.
 *
 * Honors a sessionStorage flag so we don't keep popping it back up after the
 * user has dismissed it once in this session.
 */
export function OneTapAutoPrompt() {
  const { isAuthenticated, authEnabled } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isGuest = authEnabled && !isAuthenticated;
  const dismissed =
    typeof window !== "undefined" &&
    sessionStorage.getItem(DISMISSED_FLAG) === "1";

  const handleSuccess = useCallback(
    async (credentialResponse: CredentialResponse) => {
      const credential = credentialResponse.credential;
      if (!credential) return;

      trackEvent("oauth_redirect_clicked", {
        provider: "google",
        mode: "one-tap",
      });

      try {
        const res = await fetch("/api/auth/google/one-tap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ credential }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        // The session cookie is now set. Re-fetch auth + guest queries so the
        // header swaps from "Sign In/Sign Up" to UserMenu without a reload.
        queryClient.invalidateQueries({ queryKey: ["/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/guest/status"] });
      } catch (err) {
        console.error("One Tap login error:", err);
        toast({
          title: "Sign-in failed",
          description:
            "We couldn't complete the Google sign-in. Try the Sign In button instead.",
          variant: "destructive",
        });
      }
    },
    [queryClient, toast],
  );

  const handleError = useCallback(() => {
    // User dismissed the One Tap UI (or it auto-suppressed). Don't keep
    // re-prompting them in this session.
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DISMISSED_FLAG, "1");
    }
  }, []);

  useGoogleOneTapLogin({
    onSuccess: handleSuccess,
    onError: handleError,
    disabled: !isGuest || dismissed,
    cancel_on_tap_outside: false,
  });

  return null;
}
