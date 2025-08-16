import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { randomUUID } from "crypto";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
}) : null;

const SYSTEM_PROMPT = `You are TaxGPT, an expert AI tax planning assistant. Your entire interaction with the user is purely conversational. Do not mention that you are following phases. Your process is divided into two internal phases.

**Phase 1: Data Collection.**
Your primary goal is to first collect the user's key financial data in a friendly, conversational manner. You MUST ask for the following pieces of information:
- Current Annual Income
- State of Residence
- Age
- Tax Paid Last Year

If a user starts with a vague request like "help me with taxes," your first response must be to start gathering data, for example: "I can certainly help with that. To give you the most accurate strategies, could you first tell me your approximate annual income and your state of residence?" Ask for the data one or two pieces at a time. Do NOT provide any tax advice or scenarios until you have at least the user's **Income** and **State**. If the user refuses to provide specific numbers after you ask, you must work with what you have and provide more general, less personalized advice in Phase 2.

**Phase 2: Generate The Structured Report.**
Once you have collected ALL the necessary data from the user through conversation, you MUST IMMEDIATELY generate a full tax planning report. DO NOT ask for confirmation or say you will prepare a report - IMMEDIATELY generate the report. This final report, and ONLY this final report, must follow this exact structure using Markdown. Do not use this structure for any of your data-gathering questions.

[START OF STRUCTURED REPORT FORMAT]
✅ **Scenario Title:** [Descriptive Title]
🎯 **Primary Goal:** [State the goal]
📌 **Key Strategies:**
- **Strategy Name:** A concise, 7-word explanation.
- **Strategy Name:** A concise, 7-word explanation.
💰 **Estimated Potential Tax Savings:** [A prominent numerical value]
🧮 **Estimated New Total Tax:** [A prominent numerical value]
🛠 **Actionable Next Steps:**
1. Actionable step 1.
2. Actionable step 2.

> 🔒 **Special Consideration:** [Include if relevant, based on the user's data]

> ⚠️ **Final Reminder:** This analysis is for educational purposes. Please consult with a qualified tax professional before implementing any tax strategies.
[END OF STRUCTURED REPORT FORMAT]

CRITICAL: When you have all required information (Income, State, Age, Tax Paid), generate the report IMMEDIATELY without asking for permission or confirmation.`;

const ENABLE_AUTHENTICATION = process.env.ENABLE_AUTHENTICATION === 'true';

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/generate", ENABLE_AUTHENTICATION ? requireAuth : (req: any, res: any, next: any) => next(), async (req: any, res) => {
    try {
      const { messages } = req.body;
      const startTime = Date.now();
      const sessionId = req.sessionID || randomUUID();
      const userId = req.user?.id || null;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      // Check if OpenAI is configured
      if (!openai) {
        return res.status(503).json({ 
          error: "TaxGPT AI service is currently unavailable. Please ensure the OpenAI API key is configured and try again.",
          content: "I apologize, but I'm currently unable to process your request. The AI service needs to be configured with an API key. Please contact support or try again later."
        });
      }

      // Check if this is a detailed explanation request
      const lastMessage = messages[messages.length - 1];
      const isDetailedExplanationRequest = lastMessage.content.includes('comprehensive, expert-level explanation') && 
        lastMessage.content.includes('tax strategy');

      const detailedExplanationPrompt = `You are a senior tax professional providing comprehensive, expert-level analysis. The user is asking for detailed explanation of a specific tax strategy. You must provide a thorough analysis without asking for additional information.

Provide:

1. **Detailed Overview**: Comprehensive explanation of how the strategy works
2. **Specific Examples**: Real-world scenarios with actual numbers and calculations  
3. **Advanced Techniques**: Professional-level implementation methods and optimization tips
4. **Potential Pitfalls**: Common mistakes, limitations, and compliance issues
5. **Implementation Guidance**: Step-by-step professional recommendations
6. **Current Law Context**: Recent changes and upcoming considerations

Be thorough, technical, and provide the depth of analysis a CPA would deliver to a client. Use specific examples with realistic numbers and detailed calculations where applicable. Do not ask for additional information - provide a complete analysis.`;

      // Prepare messages for OpenAI with appropriate system prompt
      const systemPrompt = isDetailedExplanationRequest ? detailedExplanationPrompt : SYSTEM_PROMPT;
      const openaiMessages = [
        { role: "system", content: systemPrompt },
        ...messages
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const aiResponse = response.choices[0].message.content;
      const endTime = Date.now();

      // Log usage for analytics (both authenticated and anonymous)
      try {
        await storage.createUsageLog({
          userId,
          sessionId,
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
          conversationLength: messages.length,
          responseTimeMs: endTime - startTime,
          userMessage: lastMessage.content,
          aiResponse: aiResponse || '',
        });
      } catch (logError) {
        console.warn('Failed to log usage:', logError);
      }
      
      res.json({ content: aiResponse });
    } catch (error) {
      console.error("OpenAI API error:", error);
      res.status(500).json({ 
        error: "Failed to generate AI response. Please try again.",
        content: "I apologize, but I encountered an error processing your request. Please try again in a moment."
      });
    }
  });

  // Admin routes (behind authentication + admin role check)
  if (ENABLE_AUTHENTICATION) {
    // Get usage statistics
    app.get("/api/admin/stats", requireAdmin, async (req, res) => {
      try {
        const stats = await storage.getUsageStatistics();
        res.json(stats);
      } catch (error) {
        console.error("Failed to get usage statistics:", error);
        res.status(500).json({ error: "Failed to get usage statistics" });
      }
    });

    // Get all users
    app.get("/api/admin/users", requireAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = (page - 1) * limit;
        
        const users = await storage.getAllUsers(limit, offset);
        const totalUsers = await storage.getUserCount();
        
        res.json({
          users,
          pagination: {
            page,
            limit,
            total: totalUsers,
            pages: Math.ceil(totalUsers / limit),
          },
        });
      } catch (error) {
        console.error("Failed to get users:", error);
        res.status(500).json({ error: "Failed to get users" });
      }
    });

    // Get user's usage history
    app.get("/api/user/usage", requireAuth, async (req: any, res) => {
      try {
        const userId = req.user.id;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        
        const usageLogs = await storage.getUserUsageLogs(userId, limit);
        res.json(usageLogs);
      } catch (error) {
        console.error("Failed to get user usage:", error);
        res.status(500).json({ error: "Failed to get user usage" });
      }
    });
  }

  const httpServer = createServer(app);
  return httpServer;
}
