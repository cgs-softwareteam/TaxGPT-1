import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ChatInterface from "@/components/ChatInterface";
import ChatInput from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { Calculator, Star, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { UserMenu } from "@/components/UserMenu";
import {
  AuthDialog,
  type AuthDialogMode,
  type AuthDialogAudience,
} from "@/components/AuthDialog";
import { useAuth } from "@/hooks/useAuth";
import { useGuestStatus } from "@/hooks/useGuestStatus";
import { trackEvent } from "@/lib/analytics";
import { parseTaxContext, isStructuredReport } from "@/lib/conversationParse";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const WAS_GUEST_FLAG = "aitaxmd_was_guest";
// Per-session flags to make sure each smart-trigger fires at most once.
const FIRST_REPORT_NUDGE_FLAG = "aitaxmd_first_report_nudge_shown";
const MIDCONVO_NUDGE_FLAG = "aitaxmd_midconvo_nudge_shown";
const EXIT_INTENT_FLAG = "aitaxmd_exit_intent_shown";

// Number of user messages after which we surface the soft mid-conversation
// "save your work" nudge. Tuned to fire just after the user has typed enough
// for the AI to be returning real value (not still in data-gathering).
const MIDCONVO_TRIGGER_COUNT = 3;

// How long to wait after the AI emits a full structured report before
// nudging the guest to sign up. Lets them actually SEE the report first.
const FIRST_REPORT_NUDGE_DELAY_MS = 3000;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  id?: number;
}

export default function Home() {
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<AuthDialogMode>("sign-in");
  const { isAuthenticated, authEnabled } = useAuth();
  const { status: guestStatus } = useGuestStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // Parsed signal extracted from the live conversation. Used to personalize
  // the AuthDialog ("you've found $X as a <profession> in <state>") and to
  // decide which audience copy to show (general vs. physician).
  const taxContext = useMemo(() => parseTaxContext(conversation), [conversation]);
  const audience: AuthDialogAudience = taxContext.isMedicalProfessional
    ? "medical"
    : "general";

  // Convenience flag: should we treat the current visitor as a guest?
  const isGuest = authEnabled && !isAuthenticated;

  // Use ref to track latest conversation to avoid stale closures
  const conversationRef = useRef<Message[]>([]);

  // Keep conversationRef updated with latest conversation state
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // Helper: open the auth dialog and fire a GA4 event so we can track which
  // surfaces (header / counter / limit modal / etc.) actually convert.
  const openAuthDialog = useCallback((mode: AuthDialogMode, trigger: string) => {
    setAuthDialogMode(mode);
    setAuthDialogOpen(true);
    trackEvent("auth_modal_opened", { mode, trigger });
  }, []);

  // Detect guest -> authenticated transition so we can fire signup_completed
  // exactly once per conversion. We stash the pre-signup prompt count in
  // sessionStorage while the user is a guest; when they later become
  // authenticated, we read it back, fire the event, and clear the flag.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isGuest && guestStatus) {
      sessionStorage.setItem(WAS_GUEST_FLAG, String(guestStatus.used));
      return;
    }
    if (isAuthenticated) {
      const raw = sessionStorage.getItem(WAS_GUEST_FLAG);
      if (raw !== null) {
        const promptsUsed = Number(raw) || 0;
        trackEvent("signup_completed", {
          from: "guest",
          prompts_used_before_signup: promptsUsed,
        });
        sessionStorage.removeItem(WAS_GUEST_FLAG);
      }
    }
  }, [isGuest, isAuthenticated, guestStatus]);

  const createConversationMutation = useMutation({
    mutationFn: async (data: { title?: string; initialMessage?: string }) => {
      const response = await apiRequest("POST", "/api/conversations", data);
      return response.json();
    },
    onSuccess: () => {
      // State management now handled directly in handleSubmit to avoid async issues
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Conversation",
        description: `Unable to create new conversation: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const addMessageMutation = useMutation({
    mutationFn: async (data: { conversationId: number; role: string; content: string; tokensUsed?: number; responseTimeMs?: number }) => {
      const response = await apiRequest("POST", `/api/conversations/${data.conversationId}/messages`, data);
      return response.json();
    },
  });

  const handleSubmit = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return; // Prevent overlapping requests

    // Proactive guest limit check: if we already know this guest has used all
    // of their free prompts, open the auth modal without spending a network call.
    if (isGuest && guestStatus && guestStatus.remaining <= 0) {
      openAuthDialog("limit-reached", "limit_reached_proactive");
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setConversation(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Handle new conversation creation (authenticated users)
      if (authEnabled && isAuthenticated && !currentConversationId) {
        try {
          const newConv = await createConversationMutation.mutateAsync({
            title: `Chat ${new Date().toLocaleDateString()}`,
            initialMessage: message,
          });
          
          // Immediately update state with new conversation ID to eliminate async issues
          setCurrentConversationId(newConv.id);
          
          // Get AI response for the new conversation
          const startTime = Date.now();
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              messages: [{ role: 'user', content: message }]
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to get AI response');
          }

          const data = await response.json();
          // Save AI response to database (user message already saved during conversation creation)
          const savedAiMessage = await addMessageMutation.mutateAsync({
            conversationId: newConv.id,
            role: 'assistant',
            content: data.content,
            responseTimeMs: Date.now() - startTime,
          });

          const aiMessage: Message = {
            id: savedAiMessage.id,
            role: 'assistant',
            content: data.content,
            timestamp: new Date()
          };

          setConversation([userMessage, aiMessage]);

          return; // Early exit for new conversation flow
        } catch (error) {
          console.warn("Conversation creation failed:", error);
          // Continue with local-only conversation
        }
      }

      // Handle existing conversation or unauthenticated users
      // Use conversationRef to get latest conversation state and avoid stale closures
      const startTime = Date.now();
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...conversationRef.current, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        }),
      });

      // Special-case the guest prompt-limit response: roll back the user bubble
      // and open the locked auth dialog instead of throwing a generic error.
      if (response.status === 429) {
        try {
          const errBody = await response.json();
          if (errBody?.error === "GUEST_LIMIT_REACHED") {
            setConversation((prev) => prev.slice(0, -1));
            trackEvent("guest_limit_reached", {
              limit: errBody.limit,
              used: errBody.used,
            });
            openAuthDialog("limit-reached", "limit_reached_server");
            queryClient.invalidateQueries({ queryKey: ["/api/guest/status"] });
            return;
          }
        } catch {
          // Fall through to the generic error path below if JSON parsing fails.
        }
      }

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      const responseTimeMs = Date.now() - startTime;

      // Refresh the guest counter after a successful generation so the
      // "X of N free prompts remaining" indicator stays accurate.
      // Also fire a GA4 event so we can chart prompt activity by guest.
      if (isGuest) {
        queryClient.invalidateQueries({ queryKey: ["/api/guest/status"] });
        if (guestStatus) {
          const newUsed = guestStatus.used + 1;
          trackEvent("guest_prompt_sent", {
            prompt_number: newUsed,
            remaining_after: Math.max(0, guestStatus.limit - newUsed),
            limit: guestStatus.limit,
          });
        }

        // First-report milestone: when the AI emits a full structured report
        // for a guest, give them a few seconds to see it then softly suggest
        // saving the plan. Fires at most once per session.
        if (
          isStructuredReport(data.content) &&
          typeof window !== "undefined" &&
          sessionStorage.getItem(FIRST_REPORT_NUDGE_FLAG) !== "1"
        ) {
          sessionStorage.setItem(FIRST_REPORT_NUDGE_FLAG, "1");
          trackEvent("first_report_milestone_scheduled", {});
          window.setTimeout(() => {
            // Bail if the user has already opened the dialog manually or has
            // signed in during the delay.
            if (sessionStorage.getItem(WAS_GUEST_FLAG) === null) return;
            openAuthDialog("sign-up", "first_report_milestone");
          }, FIRST_REPORT_NUDGE_DELAY_MS);
        }
      }
      
      // Save messages to database for existing conversations
      let aiMessage: Message;
      
      if (authEnabled && isAuthenticated && currentConversationId) {
        await addMessageMutation.mutateAsync({
          conversationId: currentConversationId,
          role: 'user',
          content: message,
        });
        
        const savedAiMessage = await addMessageMutation.mutateAsync({
          conversationId: currentConversationId,
          role: 'assistant',
          content: data.content,
          responseTimeMs,
        });

        aiMessage = {
          id: savedAiMessage.id,
          role: 'assistant',
          content: data.content,
          timestamp: new Date()
        };
      } else {
        // Unauthenticated users - no database ID
        aiMessage = {
          role: 'assistant',
          content: data.content,
          timestamp: new Date()
        };
      }

      setConversation(prev => [...prev, aiMessage]);

    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setConversation(prev => [...prev, errorMessage]);
      
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [authEnabled, isAuthenticated, currentConversationId, createConversationMutation.mutateAsync, addMessageMutation.mutateAsync, toast, isLoading, isGuest, guestStatus, queryClient]);

  // Handle followup requests from StructuredReportRenderer
  useEffect(() => {
    const handleFollowupRequest = (e: Event) => {
      const event = e as CustomEvent<{ message?: string }>;
      const message = event.detail?.message;
      if (message) {
        handleSubmit(message);
      }
    };

    window.addEventListener('requestFollowup', handleFollowupRequest);

    return () => {
      window.removeEventListener('requestFollowup', handleFollowupRequest);
    };
  }, [handleSubmit]);

  // Mid-conversation nudge: after the guest has typed MIDCONVO_TRIGGER_COUNT
  // messages, surface a single non-blocking toast inviting them to save
  // their work. Less aggressive than a modal. Fires once per session.
  useEffect(() => {
    if (!isGuest) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(MIDCONVO_NUDGE_FLAG) === "1") return;

    const userCount = conversation.filter((m) => m.role === "user").length;
    if (userCount < MIDCONVO_TRIGGER_COUNT) return;

    sessionStorage.setItem(MIDCONVO_NUDGE_FLAG, "1");
    trackEvent("midconvo_nudge_shown", { user_message_count: userCount });

    toast({
      title: "💾 Save your work?",
      description: "Sign up free to save this conversation and revisit your plan anytime.",
      duration: 8000,
      action: (
        <ToastAction
          altText="Sign up to save"
          onClick={() => openAuthDialog("sign-up", "midconvo_nudge")}
        >
          Sign up
        </ToastAction>
      ),
    });
  }, [conversation, isGuest, toast, openAuthDialog]);

  // Exit-intent capture: when a guest's mouse leaves through the top of the
  // viewport (toward the browser tabs / close button), open the sign-up
  // modal as a "before you go" save. Only fires after they've sent at
  // least one prompt — don't bother brand-new visitors who just landed.
  useEffect(() => {
    if (!isGuest) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(EXIT_INTENT_FLAG) === "1") return;

    const onMouseOut = (e: MouseEvent) => {
      // Leaving through top of viewport = clientY at or above 0.
      // Also ignore movement to child elements (relatedTarget would be set).
      if (e.clientY > 0) return;
      if (e.relatedTarget) return;
      // Require at least 1 actual prompt sent so we don't fire on bouncers.
      const userMsgCount = conversationRef.current.filter((m) => m.role === "user").length;
      if (userMsgCount < 1) return;
      if (sessionStorage.getItem(EXIT_INTENT_FLAG) === "1") return;

      sessionStorage.setItem(EXIT_INTENT_FLAG, "1");
      trackEvent("exit_intent_shown", { user_message_count: userMsgCount });
      openAuthDialog("sign-up", "exit_intent");
    };

    document.addEventListener("mouseout", onMouseOut);
    return () => document.removeEventListener("mouseout", onMouseOut);
  }, [isGuest, openAuthDialog]);

  const handleExpertAnalysisRequest = async (strategyName: string) => {
    // Gate the deep "expert analysis" mode behind signup for guests. This is
    // a high-value feature reveal — guests get to SEE that it exists, but
    // hitting it triggers the sign-up modal instead of burning a free prompt.
    if (isGuest) {
      trackEvent("expert_analysis_blocked", { strategy: strategyName });
      openAuthDialog("sign-up", "expert_analysis_lock");
      return;
    }
    const expertAnalysisMessage = `Please provide a comprehensive, expert-level explanation of the "${strategyName}" tax strategy. Include specific examples, advanced techniques, potential pitfalls, and detailed implementation guidance. Make this a thorough analysis that a tax professional would provide.`;

    await handleSubmit(expertAnalysisMessage);
  };

  const handleSelectConversation = async (conversationId: number) => {
    try {
      const response = await apiRequest("GET", `/api/conversations/${conversationId}`);
      const conversationData: any = await response.json();
      setCurrentConversationId(conversationId);
      
      const messages: Message[] = conversationData.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
      }));
      
      setConversation(messages);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load conversation",
        variant: "destructive",
      });
    }
  };

  const handleNewConversation = () => {
    setConversation([]);
    setCurrentConversationId(null);
  };

  return (
    <div className="min-h-screen flex" data-testid="main-page">
      {/* Conversation Sidebar - Only show if authenticated */}
      {authEnabled && isAuthenticated && (
        <ConversationSidebar
          activeConversationId={currentConversationId || undefined}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col transition-[margin] duration-300 ease-in-out",
        // Add left margin on desktop when sidebar is open and user is authenticated
        authEnabled && isAuthenticated && !sidebarCollapsed && !isMobile ? "ml-80" : ""
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 border-b border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-sm" data-testid="header">
          <div className="max-w-4xl mx-auto px-2 md:px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 md:space-x-3">
                {authEnabled && isAuthenticated && (
                  <Button 
                    variant="ghost"
                    size="icon"
                    className="md:hidden" 
                    onClick={() => setMobileSidebarOpen(true)}
                    data-testid="mobile-menu-button"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                )}
                <div className="bg-primary text-white p-2 rounded-lg" data-testid="logo">
                  <Calculator className="text-xl w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h1 className="text-lg md:text-xl font-semibold text-gray-900" data-testid="title">AITaxMD</h1>
                  <p className="text-xs md:text-sm text-gray-600 hidden sm:block" data-testid="subtitle">AI-Powered Tax Planning Assistant</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 md:space-x-3">
                {/* DISABLED: Out-of-scope Saved Plans feature
                {authEnabled && isAuthenticated && (
                  <Link href="/saved-plans">
                    <Button variant="outline" className="flex items-center space-x-2" data-testid="saved-plans-link">
                      <Star className="w-4 h-4" />
                      <span>Saved Plans</span>
                    </Button>
                  </Link>
                )}
                */}

                {isGuest ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAuthDialog("sign-in", "header_signin")}
                      data-testid="header-sign-in"
                    >
                      Sign In
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => openAuthDialog("sign-up", "header_signup")}
                      data-testid="header-sign-up"
                    >
                      Sign Up
                    </Button>
                  </>
                ) : (
                  <UserMenu />
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Chat Interface */}
        <main className="flex-1 overflow-y-auto pb-48" data-testid="chat-main">
          <ChatInterface 
            conversation={conversation} 
            isLoading={isLoading}
            onRequestExpertAnalysis={handleExpertAnalysisRequest}
          />
        </main>

        {/* Chat Input */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg"
             style={{
               marginLeft: isMobile ? '0' : (authEnabled && isAuthenticated && !sidebarCollapsed ? '20rem' : '0')
             }}
             data-testid="chat-input-container">
          {/* Guest free-prompt counter (shown above the input only for guests).
              Includes a thin progress bar that empties as prompts are used and
              shifts color (green -> amber -> red) for visual urgency. */}
          {isGuest && guestStatus && (() => {
            const pct = guestStatus.limit > 0
              ? Math.max(0, (guestStatus.remaining / guestStatus.limit) * 100)
              : 0;
            // Color tier based on % remaining. Tuned to feel safe -> warn -> alarm.
            const barColor =
              pct >= 50 ? "bg-green-500" :
              pct >= 25 ? "bg-amber-500" :
              "bg-red-500";
            const textColor =
              guestStatus.remaining === 0 ? "text-red-600" :
              guestStatus.remaining === 1 ? "text-red-600 font-semibold" :
              pct < 50 ? "text-amber-700" :
              "text-gray-600";

            return (
              <div className="px-4 pt-2 pb-1" data-testid="guest-prompt-counter">
                {/* Depleting progress bar */}
                <div
                  className="h-1 w-full max-w-md mx-auto bg-gray-200 rounded-full overflow-hidden mb-1.5"
                  data-testid="guest-prompt-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={guestStatus.limit}
                  aria-valuenow={guestStatus.remaining}
                  aria-label={`${guestStatus.remaining} of ${guestStatus.limit} free prompts remaining`}
                >
                  <div
                    className={cn("h-full transition-[width,background-color] duration-300", barColor)}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className={cn("text-xs text-center", textColor)}>
                  {guestStatus.remaining === 0 ? (
                    <>
                      You've used all your free prompts ·{" "}
                      <button
                        type="button"
                        onClick={() => openAuthDialog("limit-reached", "counter_signin_zero")}
                        className="text-blue-600 hover:underline font-medium"
                        data-testid="guest-counter-signin-link"
                      >
                        Sign in to continue
                      </button>
                    </>
                  ) : guestStatus.remaining === 1 ? (
                    <>
                      ⚠️ Last free prompt — {" "}
                      <button
                        type="button"
                        onClick={() => openAuthDialog("sign-up", "counter_signup_last")}
                        className="text-blue-600 hover:underline font-semibold"
                        data-testid="guest-counter-signup-link"
                      >
                        sign up to keep going
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={cn("font-medium", pct < 50 ? "text-amber-800" : "text-gray-900")}>
                        {guestStatus.remaining}
                      </span>{" "}
                      of {guestStatus.limit} free prompts remaining ·{" "}
                      <button
                        type="button"
                        onClick={() => openAuthDialog("sign-up", "counter_signup")}
                        className="text-blue-600 hover:underline"
                        data-testid="guest-counter-signup-link"
                      >
                        Sign up to continue
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          <ChatInput
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />

          {/* Footer with Legal Links */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <div className="flex flex-wrap justify-center items-center space-x-4 text-xs text-gray-500">
              <Link href="/terms-of-service" className="hover:text-gray-700 underline">
                Terms of Service
              </Link>
              <span className="text-gray-300">•</span>
              <Link href="/privacy-policy" className="hover:text-gray-700 underline">
                Privacy Policy
              </Link>
              <span className="text-gray-300">•</span>
              <Link href="/data-deletion" className="hover:text-gray-700 underline">
                Delete My Data
              </Link>
              <span className="text-gray-300">•</span>
              <span className="text-gray-400">© 2024 AITaxMD</span>
            </div>
          </div>
        </div>
      </div>

      {/* Auth modal: shown for guests when they click Sign In/Sign Up,
          or forced open (locked) when they hit the prompt limit.
          Personalization hints come from the parsed conversation so the
          limit-reached copy can read "you've found $X as a <profession>". */}
      <AuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        mode={authDialogMode}
        promptLimit={guestStatus?.limit ?? 5}
        savingsHint={taxContext.estimatedSavings}
        professionHint={taxContext.profession}
        stateHint={taxContext.state}
        audience={audience}
      />
    </div>
  );
}
