import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bot } from "lucide-react";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  conversation: Message[];
  isLoading: boolean;
}

export default function ChatInterface({ conversation, isLoading }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation, isLoading]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const isStructuredReport = (content: string) => {
    return content.includes('✅ Scenario Title:') || content.includes('✅ **Scenario Title:**');
  };

  const renderMessage = (message: Message, index: number) => {
    if (message.role === 'user') {
      return (
        <div key={index} className="flex justify-end" data-testid={`message-user-${index}`}>
          <div className="bg-[hsl(217,91%,60%)] text-white rounded-2xl rounded-br-md px-4 py-3 max-w-xs md:max-w-md shadow-sm">
            <p className="text-sm">{message.content}</p>
            <div className="text-xs opacity-75 mt-1">{formatTime(message.timestamp)}</div>
          </div>
        </div>
      );
    } else {
      // AI message
      const isReport = isStructuredReport(message.content);
      
      if (isReport) {
        return (
          <div key={index} className="flex justify-start" data-testid={`message-ai-report-${index}`}>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md p-1 max-w-full md:max-w-3xl shadow-sm">
              <div className="flex items-center space-x-2 mb-3 px-3 pt-3">
                <div className="bg-primary text-white p-1 rounded-full text-xs">
                  <Bot className="w-3 h-3" />
                </div>
                <span className="text-xs font-medium text-gray-700">TaxGPT</span>
                <span className="text-xs bg-[hsl(142,76%,36%)] text-white px-2 py-1 rounded-full">Tax Report Generated</span>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-xl p-4 mx-2 mb-2">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
              
              <div className="text-xs text-gray-500 mt-1 px-3 pb-3">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );
      } else {
        // Standard conversational message
        return (
          <div key={index} className="flex justify-start" data-testid={`message-ai-${index}`}>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 max-w-xs md:max-w-md shadow-sm">
              <div className="flex items-center space-x-2 mb-2">
                <div className="bg-primary text-white p-1 rounded-full text-xs">
                  <Bot className="w-3 h-3" />
                </div>
                <span className="text-xs font-medium text-gray-700">TaxGPT</span>
              </div>
              <p className="text-sm text-gray-800">{message.content}</p>
              <div className="text-xs text-gray-500 mt-1">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6" data-testid="chat-interface">
      {conversation.length === 0 && (
        <div className="text-center mb-8" data-testid="welcome-message">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 inline-block">
            <div className="text-primary text-4xl mb-3">
              <Bot className="w-12 h-12 mx-auto" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">Welcome to TaxGPT</h2>
            <p className="text-gray-600 text-sm max-w-md">Start a conversation about your tax planning needs. I'll gather your information and provide personalized strategies.</p>
          </div>
        </div>
      )}

      <div className="space-y-4" data-testid="messages-container">
        {conversation.map((message, index) => renderMessage(message, index))}
        
        {isLoading && (
          <div className="flex justify-start" data-testid="loading-indicator">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 max-w-xs shadow-sm">
              <div className="flex items-center space-x-2 mb-2">
                <div className="bg-primary text-white p-1 rounded-full text-xs">
                  <Bot className="w-3 h-3" />
                </div>
                <span className="text-xs font-medium text-gray-700">TaxGPT</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce-delayed-1"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce-delayed-2"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce-delayed-3"></div>
                </div>
                <span className="text-xs text-gray-500">Analyzing your tax situation...</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div ref={messagesEndRef} />
    </div>
  );
}