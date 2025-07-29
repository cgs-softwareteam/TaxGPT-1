import { useState } from "react";
import ChatInterface from "@/components/ChatInterface";
import ChatInput from "@/components/ChatInput";
import { Calculator, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Home() {
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (message: string) => {
    if (!message.trim()) return;

    // Add user message to conversation
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setConversation(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Send conversation to backend API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      
      // Add AI response to conversation
      const aiMessage: Message = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date()
      };

      setConversation(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message
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

  return (
    <div className="min-h-screen flex flex-col" data-testid="main-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm" data-testid="header">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-primary text-white p-2 rounded-lg" data-testid="logo">
                <Calculator className="text-xl w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900" data-testid="title">TaxGPT</h1>
                <p className="text-sm text-gray-600" data-testid="subtitle">AI-Powered Tax Planning Assistant</p>
              </div>
            </div>
            <Link href="/demo">
              <Button variant="outline" className="flex items-center space-x-2" data-testid="demo-link">
                <Play className="w-4 h-4" />
                <span>View Demo</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Chat Interface */}
      <main className="flex-1 overflow-y-auto pb-32" data-testid="chat-main">
        <ChatInterface 
          conversation={conversation} 
          isLoading={isLoading}
          onRequestExpertAnalysis={handleExpertAnalysisRequest}
        />
      </main>

      {/* Chat Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg" data-testid="chat-input-container">
        <ChatInput 
          onSubmit={handleSubmit} 
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
