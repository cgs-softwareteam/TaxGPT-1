import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bot } from "lucide-react";
import StructuredReportRenderer from "./StructuredReportRenderer";
// import { SaveButton } from "./SaveButton"; // DISABLED: Out-of-scope feature
import { ExportButtons } from "./ExportButtons";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  id?: number;
}

interface ChatInterfaceProps {
  conversation: Message[];
  isLoading: boolean;
  onRequestExpertAnalysis?: (strategyName: string) => void;
}

export default function ChatInterface({ conversation, isLoading, onRequestExpertAnalysis }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, authEnabled } = useAuth();

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
          <div className="bg-[hsl(217,91%,60%)] text-white rounded-2xl rounded-br-md px-3 md:px-4 py-3 max-w-xs md:max-w-md shadow-sm">
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
            <StructuredReportRenderer 
              content={message.content} 
              timestamp={message.timestamp}
              messageId={message.id}
              onRequestExpertAnalysis={onRequestExpertAnalysis}
              isLoading={isLoading}
            />
          </div>
        );
      } else {
        // Standard conversational message - enhanced formatting
        return (
          <div key={index} className="flex justify-start" data-testid={`message-ai-${index}`}>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md p-3 md:p-4 max-w-lg md:max-w-2xl shadow-sm">
              <div className="flex items-center space-x-2 mb-3">
                <div className="bg-primary text-white p-2 rounded-full">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-900">AITaxMD</span>
                  <div className="text-xs text-gray-500">Tax Planning Assistant</div>
                </div>
              </div>
              
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="text-sm text-gray-800 leading-relaxed mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
                    li: ({ children }) => <li className="text-sm text-gray-700">{children}</li>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-blue-200 pl-3 my-2 bg-blue-50 py-2 rounded-r">
                        {children}
                      </blockquote>
                    ),
                    code: ({ children }) => (
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800">
                        {children}
                      </code>
                    )
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
              
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500">{formatTime(message.timestamp)}</div>
                <div className="flex items-center space-x-2">
                  {authEnabled && isAuthenticated && (
                    <>
                      {/* DISABLED: Out-of-scope Save feature
                      <SaveButton 
                        messageId={message.id}
                        messageContent={message.content}
                        size="sm"
                      />
                      */}
                      <ExportButtons 
                        messageId={message.id}
                        content={message.content}
                      />
                    </>
                  )}
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span>AI Response</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-2 md:px-4 py-6 pb-24" data-testid="chat-interface">
      {conversation.length === 0 && (
        <div className="text-center mb-8" data-testid="welcome-message">
          <div className="bg-white p-4 md:p-8 rounded-xl shadow-sm border border-gray-200 inline-block max-w-2xl mx-2 md:mx-0">
            <div className="text-primary text-4xl mb-4">
              <Bot className="w-12 h-12 mx-auto" />
            </div>
            <h2 className="text-2xl font-medium text-gray-900" data-testid="text-welcome-tagline">How can I help with your taxes today?</h2>
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
                <span className="text-xs font-medium text-gray-700">AITaxMD</span>
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