import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import TermsOfService from "@/pages/terms-of-service";
import PrivacyPolicy from "@/pages/privacy-policy";
import DataDeletion from "@/pages/data-deletion";

import AdminDashboard from "@/pages/admin-dashboard";
import UserUsage from "@/pages/user-usage";
import SavedPlans from "@/pages/SavedPlans";
import { useAuth } from "@/hooks/useAuth";

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
  const { isAuthenticated, isLoading, authEnabled } = useAuth();

  // While auth state is loading, briefly show a spinner so the header doesn't
  // flicker between "guest" (Sign In / Sign Up) and "authenticated" (UserMenu).
  if (authEnabled && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // NOTE: Guest access is now allowed. The home page renders for everyone,
  // and Home decides whether to show Sign In/Sign Up buttons (guests) or
  // the UserMenu (authenticated). Per-prompt limits are enforced server-side
  // via GUEST_PROMPT_LIMIT. The `isAuthenticated` value is consumed by Home.
  void isAuthenticated;

  return (
    <Switch>
      <Route path="/" component={Home} />

      {/* Legal Pages - Publicly accessible */}
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/data-deletion" component={DataDeletion} />

      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin-dashboard" component={AdminDashboard} />
      <Route path="/usage" component={UserUsage} />
      <Route path="/saved-plans" component={SavedPlans} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <RouteTracker />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;