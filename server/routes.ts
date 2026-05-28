import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { randomUUID } from "crypto";
import { eq, desc, sql, and, gte, count, max, asc } from "drizzle-orm";
import { conversations, messages, savedPlans, shareLog, usageLogs, users } from "@shared/schema";
import { db } from "./db";
import { ApplicationError } from "./utils/database-safety";
import puppeteer from "puppeteer";
import * as csvWriter from "fast-csv";
import nodemailer from "nodemailer";
import { htmlToText } from "html-to-text";
import fs from "fs/promises";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
}) : null;

const SYSTEM_PROMPT = `You are AITaxMD, an expert AI tax planning assistant. Your entire interaction with the user is purely conversational. Do not mention that you are following phases. Your process is divided into two internal phases.

**Phase 1: Data Collection.**
Your primary goal is to first collect the user's key financial data in a friendly, conversational manner. You MUST ask for the following pieces of information:
- Current Annual Income
- State of Residence
- Age
- Tax Paid Last Year
- Profession (especially if medical professional)
- Employment Type (for doctors: employed vs practice owner/partner)

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

// Guest prompt limit (configurable via env, default 15 to match the spec).
const GUEST_PROMPT_LIMIT = Math.max(0, parseInt(process.env.GUEST_PROMPT_LIMIT || '15', 10) || 15);

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/generate", async (req: any, res) => {
    try {
      const { messages } = req.body;
      const startTime = Date.now();
      const sessionId = req.sessionID || randomUUID();
      const isAuthenticated = typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false;
      const userId = isAuthenticated ? (req.user?.id || null) : null;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      // Guest gate: when authentication is enabled and the user is not signed in,
      // enforce the free-prompt limit using their guest_sessions row.
      if (ENABLE_AUTHENTICATION && !isAuthenticated) {
        try {
          const ipAddress = (req.ip || req.socket?.remoteAddress || 'unknown').toString().slice(0, 45);
          const userAgent = (req.get?.('user-agent') || 'unknown').toString();
          const guest = await storage.getOrCreateGuestSession(sessionId, ipAddress, userAgent);
          if (guest.conversationCount >= GUEST_PROMPT_LIMIT) {
            return res.status(429).json({
              error: 'GUEST_LIMIT_REACHED',
              message: `You've used all ${GUEST_PROMPT_LIMIT} free prompts. Please sign in or sign up to continue.`,
              used: guest.conversationCount,
              limit: GUEST_PROMPT_LIMIT,
            });
          }
        } catch (guestErr) {
          // If the guest-tracking layer fails (e.g., DB hiccup), don't block the
          // user — log and continue. The next request will retry the check.
          console.error('Guest session check failed:', guestErr);
        }
      }

      // Check if OpenAI is configured
      if (!openai) {
        return res.status(503).json({
          error: "AITaxMD AI service is currently unavailable. Please ensure the OpenAI API key is configured and try again.",
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

      const MEDICAL_PROFESSIONAL_ADDENDUM = `

**Medical Professional Specialization Guidelines:**

When you identify the user as a medical professional, tailor tax strategies based on their employment structure:

**For Employed Physicians (W-2 Status):**
- Maximize employer retirement contributions (401k, 403b with catch-up if eligible)
- Professional development and CME expense deductions
- Professional liability insurance considerations
- Limited business expense deductions (mainly unreimbursed employee expenses)
- Tax-advantaged accounts optimization (HSA, dependent care FSA)

**For Practice Owners/Partners (Business Owner Status):**
- Section 199A QBI deduction opportunities (up to 20% of qualified business income)
- Business equipment depreciation and Section 179 deductions
- Professional liability and business insurance strategies  
- Business structure optimization (LLC vs S-Corp election analysis)
- Enhanced retirement planning (SEP-IRA, Solo 401k, defined benefit plans)
- Medical equipment and technology depreciation strategies
- Business expense optimization

Always ask clarifying questions about employment structure when medical profession is identified to provide the most relevant strategies.`;

      // Analyze conversation for medical professional context
      const conversationText = messages.map(m => m.content).join(' ').toLowerCase();
      const isMedicalProfessional = conversationText.includes('doctor') || 
        conversationText.includes('physician') || 
        conversationText.includes('medical practice') ||
        conversationText.includes('clinic') ||
        conversationText.includes('medical professional');

      // Prepare messages for OpenAI with appropriate system prompt
      let systemPrompt = SYSTEM_PROMPT;
      
      if (isDetailedExplanationRequest) {
        systemPrompt = detailedExplanationPrompt;
      } else if (isMedicalProfessional) {
        systemPrompt = SYSTEM_PROMPT + MEDICAL_PROFESSIONAL_ADDENDUM;
      }
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
        // Silently continue if usage logging fails
      }

      // For guests, increment their prompt counter AFTER a successful generation.
      // This way failed requests don't count against the user's free quota.
      if (ENABLE_AUTHENTICATION && !isAuthenticated) {
        try {
          await storage.incrementGuestConversationCount(
            sessionId,
            response.usage?.total_tokens || 0,
          );
        } catch (incErr) {
          console.error('Guest counter increment failed:', incErr);
        }
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

  // Guest status: lets the frontend show "X of N free prompts remaining"
  // and decide whether to render the auth prompt without trying /api/generate first.
  app.get("/api/guest/status", async (req: any, res) => {
    const isAuthenticated = typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false;

    if (!ENABLE_AUTHENTICATION || isAuthenticated) {
      return res.json({
        authenticated: true,
        used: 0,
        limit: GUEST_PROMPT_LIMIT,
        remaining: GUEST_PROMPT_LIMIT,
      });
    }

    try {
      const sessionId = req.sessionID || randomUUID();
      const ipAddress = (req.ip || req.socket?.remoteAddress || 'unknown').toString().slice(0, 45);
      const userAgent = (req.get?.('user-agent') || 'unknown').toString();
      const guest = await storage.getOrCreateGuestSession(sessionId, ipAddress, userAgent);
      const used = guest.conversationCount;
      const remaining = Math.max(0, GUEST_PROMPT_LIMIT - used);
      return res.json({
        authenticated: false,
        used,
        limit: GUEST_PROMPT_LIMIT,
        remaining,
      });
    } catch (err) {
      console.error('Failed to fetch guest status:', err);
      // Fail open: pretend they have a full quota rather than blocking the UI.
      return res.json({
        authenticated: false,
        used: 0,
        limit: GUEST_PROMPT_LIMIT,
        remaining: GUEST_PROMPT_LIMIT,
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

    // Update user role (Admin only)
    app.patch("/api/admin/users/:id/role", requireAdmin, async (req: any, res) => {
      try {
        const userId = parseInt(req.params.id);
        const { role } = req.body;

        if (!role || (role !== 'admin' && role !== 'user')) {
          return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'user'" });
        }

        const updatedUser = await storage.updateUserRole(userId, role);
        if (!updatedUser) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json(updatedUser);
      } catch (error) {
        console.error("Failed to update user role:", error);
        res.status(500).json({ error: "Failed to update user role" });
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
        const userConversations = await storage.getConversationsByUser(userId);
        res.json(userConversations);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
        console.error("Failed to get conversations:", error);
        res.status(500).json({ error: "Failed to get conversations" });
      }
    });

    // Create new conversation
    app.post("/api/conversations", requireAuth, async (req: any, res) => {
      try {
        const userId = req.user.id;
        const { title, initialMessage } = req.body;

        const conversation = await storage.createConversation(userId, title, initialMessage);
        res.json(conversation);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
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

        const conversation = await storage.getConversationWithMessages(conversationId, userId, page);

        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        res.json(conversation);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
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

        // First verify the conversation belongs to user
        const conversation = await storage.getConversationWithMessages(conversationId, userId, 1);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        const message = await storage.addMessageToConversation({
          conversationId,
          role,
          content,
          timestamp: new Date(),
          tokensUsed,
          responseTimeMs,
        });

        res.json(message);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
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

        const updatedConversation = await storage.updateConversationTitle(conversationId, userId, title);

        if (!updatedConversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        res.json(updatedConversation);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
        console.error("Failed to update conversation:", error);
        res.status(500).json({ error: "Failed to update conversation" });
      }
    });

    // Delete conversation
    app.delete("/api/conversations/:id", requireAuth, async (req: any, res) => {
      try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user.id;

        const success = await storage.deleteConversation(conversationId, userId);

        if (!success) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        res.json({ success: true });
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
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

        const savedPlan = await storage.savePlan({
          userId,
          messageId,
          title,
          tags
        });

        res.json(savedPlan);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
        console.error("Failed to save plan:", error);
        res.status(500).json({ error: "Failed to save plan" });
      }
    });

    // Get user's saved plans
    app.get("/api/saved-plans", requireAuth, async (req: any, res) => {
      try {
        const userId = req.user.id;
        
        const userSavedPlans = await storage.getSavedPlansByUser(userId);
        res.json(userSavedPlans);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
        console.error("Failed to get saved plans:", error);
        res.status(500).json({ error: "Failed to get saved plans" });
      }
    });

    // Delete saved plan
    app.delete("/api/saved-plans/:id", requireAuth, async (req: any, res) => {
      try {
        const planId = parseInt(req.params.id);
        const userId = req.user.id;

        const success = await storage.deleteSavedPlan(planId, userId);

        if (!success) {
          return res.status(404).json({ error: "Saved plan not found" });
        }

        res.json({ success: true });
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
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

        const allUsers = await storage.getAllUsers(1000, 0); // Get up to 1000 users for export
        
        const csvData = allUsers.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt?.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString(),
        }));

        // Simple CSV generation for user export
        const csvHeader = 'id,email,name,role,createdAt,lastLoginAt\n';
        const csvRows = csvData.map(user => 
          `${user.id},"${user.email}","${user.name}","${user.role}","${user.createdAt}","${user.lastLoginAt}"`
        ).join('\n');
        const csvString = csvHeader + csvRows;
        
        res.send(csvString);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
        console.error("Failed to export users CSV:", error);
        res.status(500).json({ error: "Failed to export users CSV" });
      }
    });

    // Export message to PDF
    app.post("/api/export/pdf/message/:id", requireAuth, async (req: any, res) => {
      try {
        const messageId = parseInt(req.params.id);
        const userId = req.user.id;

        const message = await storage.getMessageById(messageId, userId);

        if (!message) {
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

        const message = await storage.getMessageById(messageId, userId);

        if (!message) {
          return res.status(404).json({ error: "Message not found" });
        }

        // Background email sending
        setImmediate(async () => {
          try {
            const emailHtml = generateEmailTemplate(message, senderNote, message.conversation.user);
            
            if (process.env.SENDGRID_API_KEY) {
              const transporter = nodemailer.createTransport({
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
            await storage.logShare({
              userId,
              messageId,
              recipientEmail
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
        const topPrompts = await storage.getTopPrompts(20);
        res.json(topPrompts);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return res.status(error.statusCode).json({ 
            error: error.message,
            type: error.type,
            code: error.code 
          });
        }
        console.error("Failed to get top prompts:", error);
        res.status(500).json({ error: "Failed to get top prompts" });
      }
    });

    // DATA DELETION ENDPOINT (Public - no auth required)
    
    // Request user data deletion
    app.post("/api/data-deletion", async (req, res) => {
      try {
        const { email, reason } = req.body;

        if (!email || !email.includes('@')) {
          return res.status(400).json({ error: "Valid email address is required" });
        }

        // Find user by email
        const user = await storage.getUserByEmail(email);
        
        if (!user) {
          // Don't reveal if user exists or not for privacy
          return res.json({ 
            success: true, 
            message: "If an account with this email exists, a data deletion request has been submitted. You will receive a confirmation email within 24-48 hours." 
          });
        }

        const userId = user.id;
        const deletionId = randomUUID();

        // Log the deletion request
        console.log(`Data deletion request received:`, {
          deletionId,
          email,
          userId,
          reason: reason || 'No reason provided',
          timestamp: new Date().toISOString()
        });

        // In a production environment, you would:
        // 1. Store the deletion request in a separate table
        // 2. Send an email to the user for confirmation
        // 3. Have an admin process to review and execute deletions
        // 4. Implement a grace period before actual deletion
        
        // For now, we'll simulate the process
        try {
          // Delete user data using storage layer
          const deleted = await storage.deleteUser(userId);
          
          if (!deleted) {
            return res.status(500).json({ 
              success: false, 
              message: 'Failed to delete user data. Please try again later.' 
            });
          }

          console.log(`Data deletion completed for user ${email} (ID: ${userId})`);
        } catch (dbError) {
          console.error(`Failed to delete data for user ${email}:`, dbError);
          return res.status(500).json({ error: "Failed to process deletion request" });
        }

        res.json({ 
          success: true, 
          message: "Data deletion request has been processed successfully. All associated data has been permanently removed from our systems.",
          deletionId 
        });
      } catch (error) {
        console.error("Data deletion request failed:", error);
        res.status(500).json({ error: "Failed to process data deletion request" });
      }
    });

    // HEALTH CHECK ENDPOINTS (Required for Render deployment)
    
    // Primary health check endpoint
    app.get("/health", async (req, res) => {
      try {
        const startTime = Date.now();
        const dbHealth = await storage.testConnection();
        const responseTime = Date.now() - startTime;
        
        const status = dbHealth ? 'healthy' : 'unhealthy';
        const httpStatus = dbHealth ? 200 : 503;
        
        res.status(httpStatus).json({
          status,
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          database: {
            status: dbHealth ? 'connected' : 'disconnected',
            responseTimeMs: responseTime
          },
          storage: {
            type: process.env.ENABLE_DATABASE_STORAGE === 'true' ? 'database' : 'memory',
            status: storage.getConnectionStatus()
          },
          features: {
            authentication: process.env.ENABLE_AUTHENTICATION === 'true',
            database: process.env.ENABLE_DATABASE_STORAGE === 'true'
          }
        });
      } catch (error) {
        console.error("Health check failed:", error);
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
          database: { status: 'error' }
        });
      }
    });

    // Detailed health check for monitoring systems
    app.get("/health/detailed", async (req, res) => {
      try {
        const checks = {
          database: { status: 'unknown', responseTimeMs: 0 },
          storage: { status: 'unknown', type: 'unknown' },
          openai: { status: 'unknown', configured: !!openai },
          environment: { status: 'unknown', variables: {} }
        };

        // Database health check
        const dbStart = Date.now();
        try {
          checks.database.status = await storage.testConnection() ? 'healthy' : 'unhealthy';
          checks.database.responseTimeMs = Date.now() - dbStart;
        } catch (error) {
          checks.database.status = 'error';
          checks.database.responseTimeMs = Date.now() - dbStart;
        }

        // Storage health check
        checks.storage.status = storage.getConnectionStatus();
        checks.storage.type = process.env.ENABLE_DATABASE_STORAGE === 'true' ? 'database' : 'memory';

        // OpenAI configuration check
        checks.openai.status = openai ? 'configured' : 'not_configured';

        // Environment variables check
        const requiredEnvVars = ['NODE_ENV'];
        if (process.env.ENABLE_DATABASE_STORAGE === 'true') {
          requiredEnvVars.push('DATABASE_URL');
        }
        if (process.env.ENABLE_AUTHENTICATION === 'true') {
          requiredEnvVars.push('SESSION_SECRET');
        }

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        checks.environment.status = missingVars.length === 0 ? 'healthy' : 'missing_variables';
        checks.environment.variables = {
          missing: missingVars,
          present: requiredEnvVars.filter(varName => !!process.env[varName])
        };

        const overallHealthy = Object.values(checks).every(check => 
          ['healthy', 'connected', 'configured'].includes(check.status)
        );

        res.status(overallHealthy ? 200 : 503).json({
          status: overallHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          checks
        });
      } catch (error) {
        console.error("Detailed health check failed:", error);
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: 'Detailed health check failed'
        });
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
        <div class="logo">AITaxMD</div>
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
        <p>This report was generated by AITaxMD - AI-Powered Tax Planning Assistant</p>
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
