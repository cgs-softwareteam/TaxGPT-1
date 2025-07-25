import { useState } from "react";
import ChatInterface from "@/components/ChatInterface";
import ChatInput from "@/components/ChatInput";
import { Calculator, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const demoConversation: Message[] = [
  {
    role: 'user',
    content: 'I need help with tax planning for this year',
    timestamp: new Date(Date.now() - 300000) // 5 minutes ago
  },
  {
    role: 'assistant',
    content: 'I can certainly help with that! To give you the most accurate tax planning strategies, could you first tell me your approximate annual income and your state of residence?',
    timestamp: new Date(Date.now() - 270000)
  },
  {
    role: 'user',
    content: 'I make about $85,000 per year and live in California',
    timestamp: new Date(Date.now() - 240000)
  },
  {
    role: 'assistant',
    content: 'Great! That\'s helpful information. Now, could you tell me your age and approximately how much you paid in taxes last year? This will help me provide more personalized strategies.',
    timestamp: new Date(Date.now() - 210000)
  },
  {
    role: 'user',
    content: 'I\'m 32 years old and paid about $18,000 in taxes last year',
    timestamp: new Date(Date.now() - 180000)
  },
  {
    role: 'assistant',
    content: `✅ **Scenario Title:** Tax Optimization Strategy for Mid-Career Professional in California

🎯 **Primary Goal:** Reduce tax liability while maximizing retirement savings and building long-term wealth

📌 **Key Strategies:**
- **401(k) Maximization:** Increase contributions to reduce taxable income significantly
- **Roth IRA Conversion:** Strategic conversions during lower income years
- **HSA Triple Advantage:** Maximize health savings account contributions annually
- **Tax-Loss Harvesting:** Offset gains with strategic investment losses

💰 **Estimated Potential Tax Savings:** $4,200

🧮 **Estimated New Total Tax:** $13,800

🛠 **Actionable Next Steps:**
1. Increase 401(k) contribution to at least $15,000 annually
2. Open and maximize HSA contributions ($4,300 for individuals)
3. Consider backdoor Roth IRA if income allows
4. Review investment portfolio for tax-loss harvesting opportunities
5. Explore California state tax credits for energy-efficient home improvements

> 🔒 **Special Consideration:** As a California resident, you face some of the highest state income taxes in the nation. Consider relocating retirement accounts to tax-advantaged states if planning future moves.

> ⚠️ **Final Reminder:** This analysis is for educational purposes. Please consult with a qualified tax professional before implementing any tax strategies.`,
    timestamp: new Date(Date.now() - 60000)
  }
];

export default function Demo() {
  const [conversation, setConversation] = useState<Message[]>(demoConversation);
  const [isLoading, setIsLoading] = useState(false);

  const resetDemo = () => {
    setConversation(demoConversation);
  };

  const handleSubmit = async (message: string) => {
    if (!message.trim()) return;

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setConversation(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate API delay
    setTimeout(() => {
      const aiMessage: Message = {
        role: 'assistant',
        content: 'This is a demo interface. To interact with the real TaxGPT AI, please provide an OpenAI API key in the main application.',
        timestamp: new Date()
      };
      setConversation(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="demo-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm" data-testid="demo-header">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="flex items-center space-x-1" data-testid="back-to-main">
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>
              </Link>
              <div className="bg-primary text-white p-2 rounded-lg" data-testid="demo-logo">
                <Calculator className="text-xl w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900" data-testid="demo-title">TaxGPT Demo</h1>
                <p className="text-sm text-gray-600" data-testid="demo-subtitle">Interactive Tax Planning Assistant Preview</p>
              </div>
            </div>
            <Button 
              onClick={resetDemo}
              variant="outline"
              className="flex items-center space-x-2"
              data-testid="reset-demo-button"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Demo</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Demo Notice */}
      <div className="bg-blue-50 border-b border-blue-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center space-x-2 text-blue-800">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <p className="text-sm font-medium">
              Demo Mode: This showcases how TaxGPT analyzes financial information and generates structured tax planning reports.
            </p>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <main className="flex-1 overflow-y-auto pb-32" data-testid="demo-chat-main">
        <ChatInterface 
          conversation={conversation} 
          isLoading={isLoading}
        />
      </main>

      {/* Chat Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg" data-testid="demo-chat-input-container">
        <ChatInput 
          onSubmit={handleSubmit} 
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}