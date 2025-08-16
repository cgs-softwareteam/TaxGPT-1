import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { randomUUID } from "crypto";
import { eq, desc, sql, and, gte, count, max, asc } from "drizzle-orm";
import { conversations, messages, savedPlans, shareLog, usageLogs, users } from "@shared/schema";
import { db } from "./db";
import puppeteer from "puppeteer";
import * as csvWriter from "fast-csv";
import nodemailer from "nodemailer";
import { htmlToText } from "html-to-text";
import fs from "fs/promises";

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

    // CONVERSATION PERSISTENCE ENDPOINTS
    
    // Get user's conversations
    app.get("/api/conversations", requireAuth, async (req: any, res) => {
      try {
        const userId = req.user.id;
        const userConversations = await db
          .select({
            id: conversations.id,
            title: conversations.title,
            updatedAt: conversations.updatedAt,
            createdAt: conversations.createdAt,
            messageCount: count(messages.id),
          })
          .from(conversations)
          .leftJoin(messages, eq(conversations.id, messages.conversationId))
          .where(and(eq(conversations.userId, userId), eq(conversations.isActive, true)))
          .groupBy(conversations.id)
          .orderBy(desc(conversations.updatedAt));

        res.json(userConversations);
      } catch (error) {
        console.error("Failed to get conversations:", error);
        res.status(500).json({ error: "Failed to get conversations" });
      }
    });

    // Create new conversation
    app.post("/api/conversations", requireAuth, async (req: any, res) => {
      try {
        const userId = req.user.id;
        const { title, initialMessage } = req.body;

        const result = await db.transaction(async (tx) => {
          const [conversation] = await tx.insert(conversations).values({
            userId,
            title: title || 'New Conversation',
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning();

          if (initialMessage) {
            await tx.insert(messages).values({
              conversationId: conversation.id,
              role: 'user',
              content: initialMessage,
              timestamp: new Date(),
            });
          }

          return conversation;
        });

        res.json(result);
      } catch (error) {
        console.error("Failed to create conversation:", error);
        res.status(500).json({ error: "Failed to create conversation" });
      }
    });

    // Get conversation with messages
    app.get("/api/conversations/:id", requireAuth, async (req: any, res) => {
      try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = 50;
        const offset = (page - 1) * limit;

        const conversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId)
          ),
          with: {
            messages: {
              orderBy: [asc(messages.timestamp)],
              limit,
              offset,
            }
          }
        });

        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        res.json(conversation);
      } catch (error) {
        console.error("Failed to get conversation:", error);
        res.status(500).json({ error: "Failed to get conversation" });
      }
    });

    // Add message to conversation
    app.post("/api/conversations/:id/messages", requireAuth, async (req: any, res) => {
      try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user.id;
        const { role, content, tokensUsed, responseTimeMs } = req.body;

        // Verify conversation belongs to user
        const conversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId)
          )
        });

        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        const [message] = await db.insert(messages).values({
          conversationId,
          role,
          content,
          timestamp: new Date(),
          tokensUsed,
          responseTimeMs,
        }).returning();

        // Update conversation timestamp
        await db.update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));

        res.json(message);
      } catch (error) {
        console.error("Failed to add message:", error);
        res.status(500).json({ error: "Failed to add message" });
      }
    });

    // Update conversation title
    app.put("/api/conversations/:id", requireAuth, async (req: any, res) => {
      try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user.id;
        const { title } = req.body;

        const [updatedConversation] = await db.update(conversations)
          .set({ title, updatedAt: new Date() })
          .where(and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId)
          ))
          .returning();

        if (!updatedConversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        res.json(updatedConversation);
      } catch (error) {
        console.error("Failed to update conversation:", error);
        res.status(500).json({ error: "Failed to update conversation" });
      }
    });

    // Delete conversation
    app.delete("/api/conversations/:id", requireAuth, async (req: any, res) => {
      try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user.id;

        const [deletedConversation] = await db.update(conversations)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId)
          ))
          .returning();

        if (!deletedConversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Failed to delete conversation:", error);
        res.status(500).json({ error: "Failed to delete conversation" });
      }
    });

    // SAVED PLANS ENDPOINTS

    // Save a plan/message
    app.post("/api/saved-plans", requireAuth, async (req: any, res) => {
      try {
        const userId = req.user.id;
        const { messageId, title, tags } = req.body;

        const [savedPlan] = await db.insert(savedPlans).values({
          userId,
          messageId,
          title: title || 'Untitled Plan',
          tags: tags || [],
          savedAt: new Date(),
        }).returning();

        res.json(savedPlan);
      } catch (error) {
        console.error("Failed to save plan:", error);
        res.status(500).json({ error: "Failed to save plan" });
      }
    });

    // Get user's saved plans
    app.get("/api/saved-plans", requireAuth, async (req: any, res) => {
      try {
        const userId = req.user.id;
        
        const userSavedPlans = await db.query.savedPlans.findMany({
          where: eq(savedPlans.userId, userId),
          with: {
            message: {
              with: {
                conversation: true
              }
            }
          },
          orderBy: [desc(savedPlans.savedAt)]
        });

        res.json(userSavedPlans);
      } catch (error) {
        console.error("Failed to get saved plans:", error);
        res.status(500).json({ error: "Failed to get saved plans" });
      }
    });

    // Delete saved plan
    app.delete("/api/saved-plans/:id", requireAuth, async (req: any, res) => {
      try {
        const planId = parseInt(req.params.id);
        const userId = req.user.id;

        const deleted = await db.delete(savedPlans)
          .where(and(
            eq(savedPlans.id, planId),
            eq(savedPlans.userId, userId)
          ));

        res.json({ success: true });
      } catch (error) {
        console.error("Failed to delete saved plan:", error);
        res.status(500).json({ error: "Failed to delete saved plan" });
      }
    });

    // EXPORT ENDPOINTS

    // Export CSV (Users - Admin only)
    app.get("/api/export/csv/users", requireAdmin, async (req, res) => {
      try {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');

        const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
        
        const csvData = allUsers.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt?.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString(),
        }));

        const csvString = await new Promise<string>((resolve, reject) => {
          const rows: string[] = [];
          csvWriter.writeToString(csvData, { headers: true })
            .on('data', (row: string) => rows.push(row))
            .on('end', () => resolve(rows.join('')))
            .on('error', reject);
        });
        
        res.send(csvString);
      } catch (error) {
        console.error("Failed to export users CSV:", error);
        res.status(500).json({ error: "Failed to export users CSV" });
      }
    });

    // Export message to PDF
    app.post("/api/export/pdf/message/:id", requireAuth, async (req: any, res) => {
      try {
        const messageId = parseInt(req.params.id);
        const userId = req.user.id;

        const message = await db.query.messages.findFirst({
          where: eq(messages.id, messageId),
          with: { 
            conversation: { 
              with: { user: true } 
            } 
          }
        });

        if (!message || message.conversation?.userId !== userId) {
          return res.status(404).json({ error: "Message not found" });
        }

        const htmlTemplate = generatePDFTemplate(message, message.conversation.user);
        
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '1in', bottom: '1in', left: '0.75in', right: '0.75in' }
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="tax-plan-${messageId}.pdf"`);
        res.send(pdfBuffer);
      } catch (error) {
        console.error("Failed to export PDF:", error);
        res.status(500).json({ error: "Failed to export PDF" });
      }
    });

    // Share message via email
    app.post("/api/share/email", requireAuth, async (req: any, res) => {
      try {
        const { messageId, recipientEmail, senderNote } = req.body;
        const userId = req.user.id;

        const message = await db.query.messages.findFirst({
          where: eq(messages.id, messageId),
          with: { 
            conversation: { 
              with: { user: true } 
            } 
          }
        });

        if (!message || message.conversation?.userId !== userId) {
          return res.status(404).json({ error: "Message not found" });
        }

        // Background email sending
        setImmediate(async () => {
          try {
            const emailHtml = generateEmailTemplate(message, senderNote, message.conversation.user);
            
            if (process.env.SENDGRID_API_KEY) {
              const transporter = nodemailer.createTransporter({
                service: 'SendGrid',
                auth: {
                  user: 'apikey',
                  pass: process.env.SENDGRID_API_KEY
                }
              });

              await transporter.sendMail({
                from: 'TaxGPT <noreply@taxgpt.com>',
                to: recipientEmail,
                subject: 'Tax Planning Insights from TaxGPT',
                html: emailHtml,
                text: htmlToText(emailHtml)
              });
            }

            // Log the share
            await db.insert(shareLog).values({
              userId,
              messageId,
              recipientEmail,
              sharedAt: new Date()
            });
          } catch (error) {
            console.error('Email sharing failed:', error);
          }
        });

        res.json({ success: true, message: 'Email queued for delivery' });
      } catch (error) {
        console.error("Failed to share email:", error);
        res.status(500).json({ error: "Failed to share email" });
      }
    });

    // Get admin analytics - top prompts
    app.get("/api/admin/top-prompts", requireAdmin, async (req, res) => {
      try {
        const topPrompts = await db
          .select({
            prompt: usageLogs.userMessage,
            count: count(usageLogs.id),
            avgTokens: sql<number>`avg(${usageLogs.totalTokens})`,
            avgResponseTime: sql<number>`avg(${usageLogs.responseTimeMs})`
          })
          .from(usageLogs)
          .groupBy(usageLogs.userMessage)
          .orderBy(desc(count(usageLogs.id)))
          .limit(20);

        res.json(topPrompts);
      } catch (error) {
        console.error("Failed to get top prompts:", error);
        res.status(500).json({ error: "Failed to get top prompts" });
      }
    });
  }

  const httpServer = createServer(app);
  return httpServer;
}

// Helper functions for PDF and email generation
function generatePDFTemplate(message: any, user: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>TaxGPT Tax Planning Report</title>
      <style>
        body { 
          font-family: 'Arial', sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px;
        }
        .header { 
          text-align: center; 
          border-bottom: 3px solid #2563eb; 
          padding-bottom: 20px; 
          margin-bottom: 30px; 
        }
        .logo { 
          font-size: 32px; 
          font-weight: bold; 
          color: #2563eb; 
          margin-bottom: 10px; 
        }
        .tagline { 
          color: #666; 
          font-style: italic; 
        }
        .content { 
          background: #f8fafc; 
          padding: 25px; 
          border-radius: 8px; 
          border-left: 4px solid #2563eb; 
        }
        .user-info { 
          background: #e0f2fe; 
          padding: 15px; 
          border-radius: 6px; 
          margin-bottom: 20px; 
        }
        .footer { 
          margin-top: 40px; 
          text-align: center; 
          font-size: 12px; 
          color: #666; 
          border-top: 1px solid #ddd; 
          padding-top: 20px; 
        }
        h1, h2, h3 { color: #2563eb; }
        .highlight { background: #fef3c7; padding: 2px 4px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">TaxGPT</div>
        <div class="tagline">AI-Powered Tax Planning Assistant</div>
      </div>
      
      <div class="user-info">
        <strong>Generated for:</strong> ${user.name} (${user.email})<br>
        <strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
        <strong>Time:</strong> ${new Date().toLocaleTimeString()}
      </div>
      
      <div class="content">
        ${message.content.replace(/\n/g, '<br>')}
      </div>
      
      <div class="footer">
        <p>This report was generated by TaxGPT - AI-Powered Tax Planning Assistant</p>
        <p><strong>Disclaimer:</strong> This analysis is for educational purposes only. Please consult with a qualified tax professional before implementing any tax strategies.</p>
      </div>
    </body>
    </html>
  `;
}

function generateEmailTemplate(message: any, senderNote: string, user: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f8fafc; }
        .footer { padding: 15px; background: #e5e7eb; text-align: center; font-size: 12px; }
        .note { background: #fef3c7; padding: 15px; border-radius: 5px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>TaxGPT</h1>
          <p>Tax Planning Insights Shared by ${user.name}</p>
        </div>
        
        <div class="content">
          ${senderNote ? `<div class="note"><strong>Personal Note:</strong> ${senderNote}</div>` : ''}
          
          <h2>Tax Planning Insights</h2>
          <div>${message.content.replace(/\n/g, '<br>')}</div>
        </div>
        
        <div class="footer">
          <p>This message was shared through TaxGPT - AI-Powered Tax Planning Assistant</p>
          <p><strong>Disclaimer:</strong> This analysis is for educational purposes only. Please consult with a qualified tax professional.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
