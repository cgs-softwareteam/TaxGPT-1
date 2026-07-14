import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import TermsOfService from "@/pages/terms-of-service";
import PrivacyPolicy from "@/pages/privacy-policy";
import DataDeletion from "@/pages/data-deletion";
import FAQPageRoute from "@/pages/faq";

import AdminDashboard from "@/pages/admin-dashboard";
import UserUsage from "@/pages/user-usage";
import SavedPlans from "@/pages/SavedPlans";
import { OneTapAutoPrompt } from "@/components/OneTapAutoPrompt";

// Set in Render env: VITE_GOOGLE_CLIENT_ID (same value as GOOGLE_CLIENT_ID).
// When missing, the One Tap feature is silently disabled so deploys don't
// break — users can still use the regular Sign In / Sign Up buttons.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;

// Track SPA route changes in Google Analytics 4 (G-DZG17VYGRB).
// The initial pageview is sent automatically by the gtag snippet in index.html;
// this fires a `page_view` event on every subsequent Wouter navigation.
function RouteTracker() {
  const [location] = useLocation();

  useEffect(() => {
    const w = window as unknown as {
      gtag?: (...args: unknown[]) => void;
      dataLayer?: unknown[];
    };

    if (typeof w.gtag === "function") {
      w.gtag("event", "page_view", {
        page_path: location,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [location]);

  return null;
}

function Router() {
  // Render the routes unconditionally. Auth state is consumed inside each
  // page via useAuth(); while the /auth/user request is in flight, guests
  // see the guest UI (Sign In / Sign Up). Once it resolves, the header
  // swaps to UserMenu for authenticated users.
  //
  // We deliberately do NOT block the whole app on the auth query: a network
  // hiccup, a 401, or any other transient issue must not strand visitors on
  // a loading spinner.
  return (
    <Switch>
      <Route path="/" component={Home} />

      {/* Legal Pages - Publicly accessible */}
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/data-deletion" component={DataDeletion} />
      <Route path="/faq" component={FAQPageRoute} />

      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin-dashboard" component={AdminDashboard} />
      <Route path="/usage" component={UserUsage} />
      <Route path="/saved-plans" component={SavedPlans} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const content = (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <RouteTracker />
          {GOOGLE_CLIENT_ID && <OneTapAutoPrompt />}
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );

  // Only wrap with GoogleOAuthProvider when a client ID is configured.
  // OneTapAutoPrompt calls useGoogleOneTapLogin which requires the provider
  // context — without the env var, we skip both so the app still renders.
  if (!GOOGLE_CLIENT_ID) {
    return content;
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {content}
    </GoogleOAuthProvider>
  );
}

export default App;