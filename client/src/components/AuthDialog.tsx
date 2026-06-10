import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Link } from "wouter";
import { MessageSquarePlus, Save, Mail, BarChart3, ShieldCheck, EyeOff, Zap, Star, CheckCircle2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export type AuthDialogMode = "sign-in" | "sign-up" | "limit-reached";
export type AuthDialogAudience = "general" | "medical";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: AuthDialogMode;
  promptLimit?: number;
  /**
   * Personalization hints derived from the conversation. When provided,
   * the limit-reached copy switches from generic to "you discovered $X
   * savings as a <profession> in <state>", which converts ~2x better.
   */
  savingsHint?: number;
  professionHint?: string;
  stateHint?: string;
  /** Tailor copy for a specific audience (e.g. physicians get medical-prof framing). */
  audience?: AuthDialogAudience;
  /**
   * Most recent structured tax report from the conversation. When provided,
   * an "Email me my plan" lead-capture form is shown below the OAuth buttons.
   * Lower friction than OAuth — captures the email + sends the report via
   * nodemailer, no account created.
   */
  latestReport?: string;
}

// "What you get" value props shown in the dialog body. Tax-app specific.
// Phrased to describe current state ("more sessions") rather than make a
// perpetual "unlimited" promise that would have to be unsaid if pricing
// tiers ever cap free usage.
const BENEFITS: Array<{ icon: React.ComponentType<{ className?: string }>; label: string }> = [
  { icon: MessageSquarePlus, label: "More tax planning sessions" },
  { icon: Save, label: "Save & revisit your plans anytime" },
  { icon: Mail, label: "Email your reports to your accountant" },
  { icon: BarChart3, label: "Track tax-saving opportunities over time" },
];

function buildCopy(opts: {
  mode: AuthDialogMode;
  promptLimit: number;
  savingsHint?: number;
  professionHint?: string;
  stateHint?: string;
  audience: AuthDialogAudience;
}): { title: string; description: string } {
  const { mode, promptLimit, savingsHint, professionHint, stateHint, audience } = opts;

  if (mode === "sign-in") {
    return {
      title: "Welcome back",
      description: "Sign in to continue your tax planning conversations.",
    };
  }

  if (mode === "sign-up") {
    if (audience === "medical") {
      return {
        title: "Create your free AITaxMD account",
        description:
          "AITaxMD specializes in tax strategies for physicians — QBI deductions, Section 179, Solo 401(k), and more. Create a free account to unlock the full medical-professional toolkit.",
      };
    }
    return {
      title: "Create your free AITaxMD account",
      description:
        "Save your plans and unlock more tax planning sessions. No credit card required.",
    };
  }

  // mode === "limit-reached"
  // Personalize when we have meaningful context from the conversation.
  if (savingsHint && savingsHint > 0) {
    const dollarsFmt = `$${savingsHint.toLocaleString("en-US")}`;
    const audienceLabel = professionHint
      ? `as a ${professionHint}${stateHint ? ` in ${stateHint}` : ""}`
      : stateHint
        ? `in ${stateHint}`
        : "";
    return {
      title: "Don't lose your tax plan",
      description: `You've discovered ${dollarsFmt} in potential tax savings${audienceLabel ? " " + audienceLabel : ""}. Create a free account to save this plan, unlock more sessions, and revisit it anytime.`,
    };
  }

  // Generic limit-reached fallback (no context parsed).
  return {
    title: "You've used all your free prompts",
    description: `You've used all ${promptLimit} free prompts. Sign in or create a free account to keep chatting with AITaxMD.`,
  };
}

export function AuthDialog({
  open,
  onOpenChange,
  mode = "sign-in",
  promptLimit = 5,
  savingsHint,
  professionHint,
  stateHint,
  audience = "general",
  latestReport,
}: AuthDialogProps) {
  // Local state for the "Email me my plan" lead-capture form.
  const [emailValue, setEmailValue] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const submitEmailCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailSubmitting || emailSent) return;
    const email = emailValue.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (!latestReport) {
      setEmailError("There's no tax plan to send yet — chat first.");
      return;
    }
    setEmailError(null);
    setEmailSubmitting(true);
    trackEvent("email_capture_submitted", { mode });
    try {
      const res = await fetch("/api/email-my-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, reportContent: latestReport }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setEmailSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setEmailError(msg);
    } finally {
      setEmailSubmitting(false);
    }
  };
  const locked = mode === "limit-reached";
  const { title, description } = buildCopy({
    mode,
    promptLimit,
    savingsHint,
    professionHint,
    stateHint,
    audience,
  });

  // Fire a GA4 event then redirect to the OAuth provider. We do BOTH because
  // OAuth navigates away and we want to capture intent even if the user
  // bounces from the provider's consent screen.
  const goToOAuth = (provider: "google" | "facebook") => {
    trackEvent("oauth_redirect_clicked", { provider, mode });
    window.location.href = `/auth/${provider}`;
  };

  return (
    <Dialog
      open={open}
      // In locked mode, we ignore close attempts (Esc / outside click / X button).
      onOpenChange={locked ? () => {} : onOpenChange}
    >
      <DialogContent
        // The `[&>button]:hidden` selector hides the built-in shadcn close (X) button
        // when we don't want the user to dismiss the dialog.
        className={locked ? "[&>button]:hidden" : ""}
        onPointerDownOutside={locked ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={locked ? (e) => e.preventDefault() : undefined}
        data-testid="auth-dialog"
      >
        <DialogHeader>
          <DialogTitle data-testid="auth-dialog-title">{title}</DialogTitle>
          <DialogDescription data-testid="auth-dialog-description">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Value-prop list: tells users WHAT they get for signing up. */}
        <ul
          className="space-y-2 pt-2"
          data-testid="auth-dialog-benefits"
        >
          {BENEFITS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Icon className="h-4 w-4 text-blue-600 shrink-0" />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-3 pt-2">
          <Button
            onClick={() => goToOAuth("google")}
            className="w-full bg-red-500 hover:bg-red-600 text-white"
            data-testid="auth-dialog-button-google"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>
          <Button
            onClick={() => goToOAuth("facebook")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="auth-dialog-button-facebook"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Continue with Facebook
          </Button>
        </div>

        {/* Email-capture alternative — only shown when there's an actual
            report to send. Lower-friction path for users who don't want to
            OAuth: drop their email, get the plan by mail, no account. */}
        {latestReport && (
          <div className="pt-3" data-testid="auth-dialog-email-capture">
            <div className="flex items-center gap-3 pb-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                or just want the report?
              </span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>

            {emailSent ? (
              <div
                className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 p-3 rounded-md"
                data-testid="auth-dialog-email-sent"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Check your inbox — we've sent your tax plan.</span>
              </div>
            ) : (
              <form onSubmit={submitEmailCapture} className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={emailValue}
                    onChange={(e) => {
                      setEmailValue(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    disabled={emailSubmitting}
                    aria-label="Your email address"
                    data-testid="auth-dialog-email-input"
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={emailSubmitting}
                    data-testid="auth-dialog-email-submit"
                  >
                    {emailSubmitting ? "Sending…" : "Email me my plan"}
                  </Button>
                </div>
                {emailError && (
                  <p
                    className="text-xs text-red-600 dark:text-red-400"
                    data-testid="auth-dialog-email-error"
                  >
                    {emailError}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        {/* Trust badges — reduce signup hesitation by addressing the
            most common objections at the exact decision moment. */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3 text-xs text-gray-500 dark:text-gray-400"
          data-testid="auth-dialog-trust-badges"
        >
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
            Bank-level encryption
          </span>
          <span className="flex items-center gap-1">
            <EyeOff className="h-3.5 w-3.5 text-green-600" />
            Never shared with the IRS
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-green-600" />
            Sign up in 5 seconds · No card
          </span>
        </div>

        {/* Qualitative social proof — no fabricated user counts. */}
        <p
          className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1 flex items-center justify-center gap-1"
          data-testid="auth-dialog-social-proof"
        >
          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
          Trusted by entrepreneurs, doctors, and freelancers across the US
        </p>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1">
          By continuing, you agree to our{" "}
          <Link
            href="/terms-of-service"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            terms of service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy-policy"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            privacy policy
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
