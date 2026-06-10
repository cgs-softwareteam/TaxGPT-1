import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface GuestLockButtonProps {
  /** What the user wanted to do, in title case (e.g. "Save Plan"). */
  label: string;
  /** GA4 trigger label so we can chart which value-locks convert (e.g. "save_plan_lock"). */
  trigger: string;
  /** data-testid for component tests. */
  testId?: string;
  className?: string;
}

/**
 * Drop-in replacement for an authenticated-only action button (Save, PDF
 * export, etc.) when the current visitor is a guest. Visually mirrors the
 * real button but, on click, opens the sign-up modal via a window
 * CustomEvent so the calling component doesn't have to thread the dialog
 * opener down through props.
 *
 * Listener lives in home.tsx (window.addEventListener('requestAuthGate',...))
 * — keeps the AuthDialog state in one place.
 *
 * Also fires a GA4 event so we can see in the funnel which value-locks
 * actually convert (PDF gate vs. Save gate vs. anything else added later).
 */
export function GuestLockButton({
  label,
  trigger,
  testId,
  className,
}: GuestLockButtonProps) {
  const handleClick = () => {
    trackEvent("guest_locked_action_clicked", { trigger, label });
    window.dispatchEvent(
      new CustomEvent("requestAuthGate", {
        detail: { mode: "sign-up", trigger },
      }),
    );
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className={className}
      data-testid={testId}
      title="Sign in to unlock this feature"
    >
      <Lock className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
      {label}
    </Button>
  );
}
