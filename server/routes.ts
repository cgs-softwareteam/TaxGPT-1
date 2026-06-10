import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { randomUUID, randomBytes } from "crypto";
import { eq, desc, sql, and, gte, count, max, asc } from "drizzle-orm";
import { conversations, messages, savedPlans, shareLog, usageLogs, users } from "@shared/schema";
import { db } from "./db";
import { ApplicationError } from "./utils/database-safety";
import puppeteer from "puppeteer";
import * as csvWriter from "fast-csv";
import nodemailer from "nodemailer";
import { htmlToText } from "html-to-text";
import fs from "fs/promises";
import { OAuth2Client } from "google-auth-library";

// Singleton Google ID token verifier. We instantiate once at module load
// because it caches Google's signing certs internally and reuses them
// across requests. Null when GOOGLE_CLIENT_ID isn't configured.
const googleAuthClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

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

// Guest prompt limit (configurable via env). Default 5 — tighter than 15 to
// create signup pressure right as guests finish their first full report cycle.
// Override per-environment with GUEST_PROMPT_LIMIT in Render env settings.
const GUEST_PROMPT_LIMIT = Math.max(0, parseInt(process.env.GUEST_PROMPT_LIMIT || '5', 10) || 5);

// Magic-link auth: tokens live 15 minutes, and we soft-rate-limit to one
// outstanding token per email per minute to keep accidental double-clicks
// (or simple abuse) from spamming the same inbox.
const MAGIC_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAGIC_LINK_RATE_WINDOW_MS = 60 * 1000;

/**
 * Build a fully-qualified base URL for redirects + emailed links.
 * Prefers REPLIT_DOMAINS (the existing convention used by OAuth callbacks),
 * falls back to the request's own protocol+host (works in dev + when no
 * env var is configured).
 */
function getBaseUrl(req: any): string {
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS}`;
  }
  const host = req.get?.('host') || 'localhost:5000';
  return `${req.protocol || 'http'}://${host}`;
}

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

          // Pin this sessionID across requests. express-session has
          // saveUninitialized:false, so unless we write to req.session it
          // won't persist and the next request will mint a brand-new
          // sessionID. That would mean every request creates a fresh
          // guest_sessions row and the counter never appears to tick up.
          if (req.session) {
            (req.session as any).guestActive = true;
          }

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

      // CRITICAL: pin this sessionID across requests. express-session has
      // saveUninitialized:false, so unless we write to req.session it won't
      // persist and the cookie won't be set — meaning every subsequent
      // request mints a fresh sessionID + a fresh guest_sessions row, and
      // the prompt counter never appears to increment in the UI.
      if (req.session) {
        (req.session as any).guestActive = true;
      }

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

  // Email capture: "Email me my plan" flow. Captures a lead email from a
  // guest, persists it to email_captures, and dispatches the latest tax
  // report via nodemailer in the background. No account is created.
  app.post("/api/email-my-plan", async (req: any, res) => {
    const { email, reportContent } = req.body ?? {};

    // Basic shape validation — full email validation is the email server's job.
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!reportContent || typeof reportContent !== "string") {
      return res.status(400).json({ error: "There's no tax plan to send yet." });
    }

    const sessionId = req.sessionID || randomUUID();
    const ipAddress = (req.ip || req.socket?.remoteAddress || 'unknown').toString().slice(0, 45);

    try {
      const capture = await storage.createEmailCapture({
        email: email.toLowerCase().trim(),
        sessionId,
        ipAddress,
        source: "auth_dialog_email_capture",
      });

      // Dispatch in the background so the request returns immediately.
      // Uses Resend via SMTP (smtp.resend.com) — cleaner setup than the
      // previous SendGrid integration, free tier of 3K emails/month.
      setImmediate(async () => {
        try {
          if (!process.env.RESEND_API_KEY) {
            console.warn("RESEND_API_KEY not set — email capture queued but not sent");
            return;
          }

          const html = generateLeadCaptureEmailHtml(reportContent);
          const transporter = nodemailer.createTransport({
            host: "smtp.resend.com",
            port: 465,
            secure: true,
            auth: { user: "resend", pass: process.env.RESEND_API_KEY },
          });

          await transporter.sendMail({
            from: "AITaxMD <noreply@aitaxmd.com>",
            to: email,
            subject: "Your AITaxMD Tax Plan",
            html,
            text: htmlToText(html),
          });

          await storage.markEmailCaptureReportSent(capture.id);
        } catch (sendErr) {
          console.error("Email capture send failed:", sendErr);
        }
      });

      res.json({
        success: true,
        message: "Check your inbox — we've sent your tax plan.",
      });
    } catch (err) {
      console.error("Email capture failed:", err);
      res.status(500).json({ error: "Couldn't capture your email. Please try again." });
    }
  });

  // Magic-link auth: request a one-time sign-in link by email. Always responds
  // success (regardless of whether the email matches an existing user) to
  // prevent account enumeration.
  app.post("/api/auth/magic/request", async (req: any, res) => {
    if (!ENABLE_AUTHENTICATION) {
      return res.status(503).json({ error: "Authentication is not enabled" });
    }
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({
        error: "Email sign-in isn't available yet. Try Google or Facebook instead.",
      });
    }

    const { email: rawEmail } = req.body ?? {};
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || typeof rawEmail !== "string" || !EMAIL_REGEX.test(rawEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    const email = rawEmail.toLowerCase().trim();

    // Soft rate limit: if there's already an active (unexpired, unconsumed)
    // token for this email created within the rate window, return success
    // without creating a new one (silent — no second email).
    try {
      const active = await storage.countRecentActiveTokens(email, MAGIC_LINK_RATE_WINDOW_MS);
      if (active > 0) {
        return res.json({ success: true });
      }
    } catch (rateErr) {
      console.error("Magic-link rate check failed (allowing anyway):", rateErr);
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TOKEN_TTL_MS);
    const requestIp = (req.ip || req.socket?.remoteAddress || 'unknown').toString().slice(0, 45);
    const requestUserAgent = (req.get?.('user-agent') || 'unknown').toString().slice(0, 1000);

    try {
      await storage.createMagicLinkToken({
        token,
        email,
        expiresAt,
        requestIp,
        requestUserAgent,
      });
    } catch (createErr) {
      console.error("Failed to create magic-link token:", createErr);
      return res.status(500).json({ error: "Couldn't create sign-in link. Please try again." });
    }

    const magicLink = `${getBaseUrl(req)}/auth/magic?token=${encodeURIComponent(token)}`;

    // Dispatch the email in the background so this request returns instantly.
    setImmediate(async () => {
      try {
        const html = generateMagicLinkEmailHtml(magicLink);
        const transporter = nodemailer.createTransport({
          host: "smtp.resend.com",
          port: 465,
          secure: true,
          auth: { user: "resend", pass: process.env.RESEND_API_KEY },
        });
        await transporter.sendMail({
          from: "AITaxMD <noreply@aitaxmd.com>",
          to: email,
          subject: "Your AITaxMD sign-in link",
          html,
          text: htmlToText(html),
        });
      } catch (sendErr) {
        console.error("Magic-link email send failed:", sendErr);
      }
    });

    res.json({ success: true });
  });

  // Magic-link callback: GET /auth/magic?token=... — validates the token,
  // finds-or-creates the user, establishes the session, and redirects home.
  app.get("/auth/magic", async (req: any, res) => {
    const baseUrl = getBaseUrl(req);

    if (!ENABLE_AUTHENTICATION) {
      return res.redirect(`${baseUrl}/?error=auth_disabled`);
    }

    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.redirect(`${baseUrl}/?error=magic_invalid`);
    }

    try {
      const tokenRow = await storage.getMagicLinkToken(token);
      if (!tokenRow) {
        return res.redirect(`${baseUrl}/?error=magic_invalid`);
      }
      if (tokenRow.consumedAt) {
        return res.redirect(`${baseUrl}/?error=magic_consumed`);
      }
      if (tokenRow.expiresAt.getTime() < Date.now()) {
        return res.redirect(`${baseUrl}/?error=magic_expired`);
      }

      // Consume the token BEFORE the login completes — if anything below fails,
      // the link still can't be reused.
      await storage.consumeMagicLinkToken(token);

      // Find or create user keyed by email.
      let user = await storage.getUserByEmail(tokenRow.email);
      if (!user) {
        const prefix = tokenRow.email.split("@")[0];
        const niceName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        user = await storage.createUser({
          email: tokenRow.email,
          name: niceName || tokenRow.email,
          role: "user",
        });
      } else {
        user = await storage.updateUser(user.id, { lastLoginAt: new Date() });
      }

      // Capture pre-login sessionID for guest-conversion analytics.
      const preLoginSessionId = req.sessionID as string | undefined;

      await new Promise<void>((resolve, reject) => {
        req.logIn(user, (loginErr: any) => {
          if (loginErr) reject(loginErr);
          else resolve();
        });
      });

      if (preLoginSessionId) {
        storage.markGuestConverted(preLoginSessionId, user!.id).catch((convErr) => {
          console.error("Failed to mark guest conversion (magic link):", convErr);
        });
      }

      return res.redirect(`${baseUrl}/?welcome=1`);
    } catch (err) {
      console.error("Magic-link verification failed:", err);
      return res.redirect(`${baseUrl}/?error=magic_error`);
    }
  });

  // Google One Tap: receives a Google-issued JWT credential from the client,
  // verifies it server-side, then either logs in the matching existing user
  // or creates a new one and logs them in. Mirrors the find-or-create logic
  // from the passport-google-oauth20 callback in auth.ts.
  app.post("/api/auth/google/one-tap", async (req: any, res) => {
    if (!ENABLE_AUTHENTICATION) {
      return res.status(503).json({ error: "Authentication is not enabled" });
    }
    if (!googleAuthClient || !process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: "Google authentication is not configured" });
    }

    const { credential } = req.body ?? {};
    if (!credential || typeof credential !== "string") {
      return res.status(400).json({ error: "Missing credential" });
    }

    try {
      // verifyIdToken checks signature, audience, expiration, and issuer.
      // This is the security boundary — never trust the JWT contents before
      // this call returns successfully.
      const ticket = await googleAuthClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        return res.status(401).json({ error: "Invalid Google credential" });
      }

      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name || payload.given_name || (email ? email.split("@")[0] : "User");
      const profilePicture = payload.picture || null;

      if (!email) {
        return res.status(400).json({ error: "Google account has no email address" });
      }

      // Find-or-create logic intentionally mirrors the passport callback.
      let user = await storage.getUserByGoogleId(googleId);
      if (!user) {
        const existingByEmail = await storage.getUserByEmail(email);
        if (existingByEmail) {
          // Same email, different (or no) Google ID — link them.
          user = await storage.updateUser(existingByEmail.id, { googleId });
        } else {
          user = await storage.createUser({
            googleId,
            email,
            name,
            profilePicture,
            role: "user",
          });
        }
      } else {
        user = await storage.updateUser(user.id, { lastLoginAt: new Date() });
      }

      // Capture the pre-login sessionID so we can record the guest→user
      // conversion (matches what the redirect-based OAuth callbacks do).
      const preLoginSessionId = req.sessionID as string | undefined;

      // Establish the passport session. Promisified since req.logIn is callback-based.
      await new Promise<void>((resolve, reject) => {
        req.logIn(user, (loginErr: any) => {
          if (loginErr) reject(loginErr);
          else resolve();
        });
      });

      if (preLoginSessionId) {
        storage.markGuestConverted(preLoginSessionId, user!.id).catch((convErr) => {
          console.error("Failed to mark guest conversion (One Tap):", convErr);
        });
      }

      return res.json({
        success: true,
        user: { id: user!.id, email: user!.email, name: user!.name },
      });
    } catch (err) {
      console.error("Google One Tap verification failed:", err);
      return res.status(401).json({ error: "Invalid Google credential" });
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

    // Guest activity + recent conversions for the admin dashboard.
    // Returns aggregate guest metrics and the most recent guest-to-signup conversions
    // joined to the resulting user's name and email.
    app.get("/api/admin/guest-stats", requireAdmin, async (req, res) => {
      try {
        const recentLimit = Math.min(parseInt(req.query.recentLimit as string) || 25, 100);
        const [stats, recentConversions] = await Promise.all([
          storage.getGuestStatistics(GUEST_PROMPT_LIMIT),
          storage.getRecentConversions(recentLimit),
        ]);
        res.json({
          stats,
          recentConversions,
          promptLimit: GUEST_PROMPT_LIMIT,
        });
      } catch (error) {
        console.error("Failed to get guest stats:", error);
        res.status(500).json({ error: "Failed to get guest stats" });
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

/**
 * HTML email body for the magic-link sign-in flow. Includes a big CTA
 * button + the raw URL as fallback (some inboxes strip styled buttons).
 * Mentions the 15-minute expiry and the "didn't request this?" disclaimer.
 */
function generateMagicLinkEmailHtml(magicLink: string): string {
  // Magic link is generated by us with randomBytes; no user-controlled
  // content lands in this template, so no escaping is needed. We still
  // attribute-encode the href just for safety.
  const safeHref = magicLink.replace(/"/g, "&quot;");
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f8fafc; padding: 28px; border-radius: 0 0 8px 8px; }
        .cta-wrap { text-align: center; margin: 32px 0 24px; }
        .cta { background: #2563eb; color: white !important; padding: 14px 32px; text-decoration: none; display: inline-block; border-radius: 6px; font-weight: 600; font-size: 16px; }
        .raw-link { word-break: break-all; font-size: 12px; color: #666; background: white; padding: 12px; border-radius: 4px; border: 1px solid #e5e7eb; font-family: monospace; }
        .footer { margin-top: 28px; text-align: center; font-size: 12px; color: #666; }
        .footer p { margin: 6px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Sign in to AITaxMD</h1>
      </div>
      <div class="content">
        <p>Click the button below to sign in to your AITaxMD account. This link expires in <strong>15 minutes</strong> and can only be used once.</p>
        <div class="cta-wrap">
          <a href="${safeHref}" class="cta">Sign in to AITaxMD</a>
        </div>
        <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
        <div class="raw-link">${magicLink}</div>
        <p style="margin-top: 28px; font-size: 14px; color: #666;">
          <strong>Didn't request this?</strong> You can safely ignore this email — someone may have entered your address by mistake. No account was created.
        </p>
      </div>
      <div class="footer">
        <p>This is a one-time sign-in link from AITaxMD.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * HTML email body for the "Email me my plan" lead-capture flow. Keeps the
 * report content (markdown/text) as-is in a styled wrapper, escapes special
 * chars to prevent HTML injection, and includes a CTA to sign up.
 */
function generateLeadCaptureEmailHtml(reportContent: string): string {
  const safeContent = reportContent
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .tagline { margin-top: 6px; opacity: 0.9; font-size: 14px; }
        .content { background: #f8fafc; padding: 28px; border-radius: 0 0 8px 8px; }
        .cta-wrap { text-align: center; margin-top: 32px; }
        .cta { background: #2563eb; color: white !important; padding: 14px 28px; text-decoration: none; display: inline-block; border-radius: 6px; font-weight: 600; }
        .footer { margin-top: 28px; text-align: center; font-size: 12px; color: #666; }
        .footer p { margin: 6px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>AITaxMD</h1>
        <div class="tagline">Your AI-Powered Tax Plan</div>
      </div>
      <div class="content">
        ${safeContent}
        <div class="cta-wrap">
          <a href="https://aitaxmd.com/" class="cta">Create a free account to save this plan</a>
        </div>
      </div>
      <div class="footer">
        <p><strong>Disclaimer:</strong> This analysis is for educational purposes only. Please consult with a qualified tax professional before implementing any tax strategies.</p>
        <p>You received this email because you requested your tax plan from AITaxMD.</p>
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
