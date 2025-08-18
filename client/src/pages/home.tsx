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
    mutationFn: async (data: { title?: string; initialMessage?: string }) =>
      apiRequest("/api/conversations", "POST", data),
    onSuccess: (data: any) => {
      setCurrentConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const addMessageMutation = useMutation({
    mutationFn: async (data: { conversationId: number; role: string; content: string; tokensUsed?: number; responseTimeMs?: number }) =>
      apiRequest(`/api/conversations/${data.conversationId}/messages`, "POST", data),
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
      // Create conversation if authenticated and none exists
      let conversationId = currentConversationId;
      if (authEnabled && isAuthenticated && !conversationId) {
        const newConv = await createConversationMutation.mutateAsync({
          title: `Chat ${new Date().toLocaleDateString()}`,
          initialMessage: message,
        });
        conversationId = newConv.id;
      }

      const startTime = Date.now();
      
      // Send conversation to backend API
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

      // Save messages to database if authenticated
      if (authEnabled && isAuthenticated && conversationId) {
        // Save user message if it wasn't already saved during conversation creation
        if (currentConversationId) {
          await addMessageMutation.mutateAsync({
            conversationId,
            role: 'user',
            content: message,
          });
        }
        
        // Save AI response
        await addMessageMutation.mutateAsync({
          conversationId,
          role: 'assistant',
          content: data.content,
          responseTimeMs,
        });
      }

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setConversation(prev => [...prev, errorMessage]);
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
      const conversationData: any = await apiRequest(`/api/conversations/${conversationId}`);
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
                {authEnabled && isAuthenticated && (
                  <Link href="/saved-plans">
                    <Button variant="outline" className="flex items-center space-x-2" data-testid="saved-plans-link">
                      <Star className="w-4 h-4" />
                      <span>Saved Plans</span>
                    </Button>
                  </Link>
                )}

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
