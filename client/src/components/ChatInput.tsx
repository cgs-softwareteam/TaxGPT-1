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
    <div className="max-w-4xl mx-auto p-4" data-testid="chat-input">
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
          className="bg-primary text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!message.trim() || isLoading}
          data-testid="button-send"
        >
          <span className="hidden sm:inline text-sm font-medium">Send</span>
          <Send className="w-4 h-4" />
        </Button>
      </form>
      
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
  );
}