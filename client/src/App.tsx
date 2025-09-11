import { Switch, Route } from "wouter";
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
import { LoginPrompt } from "@/components/LoginPrompt";

function Router() {
  const { isAuthenticated, isLoading, authEnabled } = useAuth();

  // Legal pages are always accessible, regardless of authentication status
  const isLegalPage = window.location.pathname.startsWith('/terms-of-service') || 
                     window.location.pathname.startsWith('/privacy-policy') || 
                     window.location.pathname.startsWith('/data-deletion');

  if (isLegalPage) {
    return (
      <Switch>
        <Route path="/terms-of-service" component={TermsOfService} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/data-deletion" component={DataDeletion} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Show loading state while checking authentication
  if (authEnabled && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show login prompt if authentication is enabled and user is not authenticated
  if (authEnabled && !isAuthenticated) {
    return <LoginPrompt />;
  }

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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;