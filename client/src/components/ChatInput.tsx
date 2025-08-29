import { useState } from "react";
import { Send, Paperclip, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  isLoading: boolean;
}

export default function ChatInput({ onSubmit, isLoading }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSubmit(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full" data-testid="chat-input">
      <div className="max-w-4xl mx-auto px-2 py-2 md:px-4 md:py-4">
        <form onSubmit={handleSubmit} className="flex space-x-3" data-testid="chat-form">
          <div className="flex-1 relative">
          <Input
            type="text"
            placeholder="Type your tax question or provide your financial information..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            disabled={isLoading}
            data-testid="input-message"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            data-testid="button-attach"
            disabled={isLoading}
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </div>
        <Button
          type="submit"
          className="bg-primary text-white px-3 md:px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!message.trim() || isLoading}
          data-testid="button-send"
        >
          <span className="hidden sm:inline text-sm font-medium">Send</span>
          <Send className="w-4 h-4" />
        </Button>
        </form>
      
        
        {/* Quick Start Suggestions */}
        {message.trim() === '' && (
        <div className="mt-3 mb-2" data-testid="quick-start-suggestions">
          <div className="text-xs text-gray-500 mb-2">Quick start options:</div>
          <div className="flex flex-wrap gap-1 md:gap-2">
            <button
              type="button"
              onClick={() => setMessage("I need help with tax planning. I make $75,000 per year and live in California.")}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 md:px-3 py-2 rounded-lg transition-colors duration-200"
              data-testid="quick-start-california"
            >
              <span className="hidden sm:inline">💼 California resident, $75k income</span>
              <span className="sm:hidden">💼 CA, $75k</span>
            </button>
            <button
              type="button"
              onClick={() => setMessage("I'm self-employed and need tax strategies for my small business.")}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 md:px-3 py-2 rounded-lg transition-colors duration-200"
              data-testid="quick-start-selfemployed"
            >
              <span className="hidden sm:inline">🏢 Self-employed tax help</span>
              <span className="sm:hidden">🏢 Self-employed</span>
            </button>
            <button
              type="button"
              onClick={() => setMessage("I want to maximize my retirement savings and reduce taxes.")}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 md:px-3 py-2 rounded-lg transition-colors duration-200"
              data-testid="quick-start-retirement"
            >
              <span className="hidden sm:inline">💰 Retirement tax strategies</span>
              <span className="sm:hidden">💰 Retirement</span>
            </button>
            <button
              type="button"
              onClick={() => setMessage("I recently got married and need to understand how this affects my taxes.")}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 md:px-3 py-2 rounded-lg transition-colors duration-200"
              data-testid="quick-start-married"
            >
              <span className="hidden sm:inline">💒 Marriage tax planning</span>
              <span className="sm:hidden">💒 Marriage</span>
            </button>
          </div>
        </div>
        )}

        <div className="flex items-center justify-between mt-3">
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <span className="flex items-center space-x-1" data-testid="security-indicator">
            <Shield className="w-3 h-3" />
            <span>Secure & Private</span>
          </span>
          <span className="flex items-center space-x-1" data-testid="realtime-indicator">
            <Clock className="w-3 h-3" />
            <span>Real-time AI</span>
          </span>
        </div>
        <div className="text-xs text-gray-400" data-testid="help-text">
          Press Enter to send
        </div>
        </div>
      </div>
    </div>
  );
}