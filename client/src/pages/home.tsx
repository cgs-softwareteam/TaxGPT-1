import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ChatInterface from "@/components/ChatInterface";
import ChatInput from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { Calculator, Star, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

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
  const { isAuthenticated, authEnabled } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const handleSubmit = async (message: string) => {
    if (!message.trim()) return;

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
          const aiMessage: Message = {
            role: 'assistant',
            content: data.content,
            timestamp: new Date()
          };

          setConversation([userMessage, aiMessage]);

          // Save AI response to database (user message already saved during conversation creation)
          await addMessageMutation.mutateAsync({
            conversationId: newConv.id,
            role: 'assistant',
            content: data.content,
            responseTimeMs: Date.now() - startTime,
          });

          return; // Early exit for new conversation flow
        } catch (error) {
          console.warn("Conversation creation failed:", error);
          // Continue with local-only conversation
        }
      }

      // Handle existing conversation or unauthenticated users
      const startTime = Date.now();
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...conversation, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      const responseTimeMs = Date.now() - startTime;
      
      const aiMessage: Message = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date()
      };

      setConversation(prev => [...prev, aiMessage]);

      // Save messages to database for existing conversations
      if (authEnabled && isAuthenticated && currentConversationId) {
        await addMessageMutation.mutateAsync({
          conversationId: currentConversationId,
          role: 'user',
          content: message,
        });
        
        await addMessageMutation.mutateAsync({
          conversationId: currentConversationId,
          role: 'assistant',
          content: data.content,
          responseTimeMs,
        });
      }

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
  };

  const handleExpertAnalysisRequest = async (strategyName: string) => {
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
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm" data-testid="header">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-primary text-white p-2 rounded-lg" data-testid="logo">
                  <Calculator className="text-xl w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900" data-testid="title">AITaxMD</h1>
                  <p className="text-sm text-gray-600" data-testid="subtitle">AI-Powered Tax Planning Assistant</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
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

                <UserMenu />
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
        <div className="fixed bottom-0 right-0 bg-white border-t border-gray-200 shadow-lg" 
             style={{ left: authEnabled && isAuthenticated && !sidebarCollapsed ? '320px' : '0' }}
             data-testid="chat-input-container">
          <ChatInput 
            onSubmit={handleSubmit} 
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
