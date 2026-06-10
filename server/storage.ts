import {
  type User,
  type InsertUser,
  type UsageLog,
  type InsertUsageLog,
  type UsageStatistics,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type SavedPlan,
  type InsertSavedPlan,
  type ShareLog,
  type InsertShareLog,
  type GuestSession,
  type InsertGuestSession,
  type GuestStatistics,
  type ConvertedGuest,
  type EmailCapture,
  type InsertEmailCapture,
  type MagicLinkToken,
  type InsertMagicLinkToken
} from "@shared/schema";
import { randomUUID } from "crypto";

// Complete storage interface with all operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByFacebookId(facebookId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  updateUserRole(id: number, role: string): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  
  // Usage tracking
  createUsageLog(log: InsertUsageLog): Promise<UsageLog>;
  getUserUsageLogs(userId: number, limit?: number): Promise<UsageLog[]>;
  getUsageStatistics(): Promise<UsageStatistics>;
  
  // Admin operations
  getAllUsers(limit?: number, offset?: number): Promise<User[]>;
  getUserCount(): Promise<number>;
  
  // CONVERSATION OPERATIONS
  createConversation(userId: number, title?: string, initialMessage?: string): Promise<Conversation>;
  getConversationsByUser(userId: number): Promise<Array<Conversation & { messageCount: number }>>;
  getConversationWithMessages(conversationId: number, userId: number, page?: number): Promise<Conversation & { messages: Message[] } | undefined>;
  updateConversationTitle(conversationId: number, userId: number, title: string): Promise<Conversation | undefined>;
  deleteConversation(conversationId: number, userId: number): Promise<boolean>;
  
  // MESSAGE OPERATIONS
  addMessageToConversation(data: Omit<InsertMessage, 'id'>): Promise<Message>;
  getMessageById(messageId: number, userId: number): Promise<Message & { conversation: { userId: number; user: User } } | undefined>;
  
  // SAVED PLANS OPERATIONS
  savePlan(data: Omit<InsertSavedPlan, 'id' | 'savedAt'>): Promise<SavedPlan>;
  getSavedPlansByUser(userId: number): Promise<Array<SavedPlan & { message: { conversation: Conversation } }>>;
  deleteSavedPlan(planId: number, userId: number): Promise<boolean>;
  
  // SHARE LOG OPERATIONS
  logShare(data: Omit<InsertShareLog, 'id' | 'sharedAt'>): Promise<ShareLog>;

  // GUEST SESSION OPERATIONS
  getOrCreateGuestSession(sessionId: string, ipAddress: string, userAgent: string): Promise<GuestSession>;
  getGuestSession(sessionId: string): Promise<GuestSession | undefined>;
  incrementGuestConversationCount(sessionId: string, tokensUsed?: number): Promise<GuestSession | undefined>;
  markGuestConverted(sessionId: string, userId: number): Promise<GuestSession | undefined>;
  getGuestStatistics(promptLimit: number): Promise<GuestStatistics>;
  getRecentConversions(limit?: number): Promise<ConvertedGuest[]>;

  // EMAIL CAPTURE OPERATIONS
  createEmailCapture(data: InsertEmailCapture): Promise<EmailCapture>;
  markEmailCaptureReportSent(id: number): Promise<void>;

  // MAGIC LINK OPERATIONS
  createMagicLinkToken(data: InsertMagicLinkToken): Promise<MagicLinkToken>;
  getMagicLinkToken(token: string): Promise<MagicLinkToken | undefined>;
  consumeMagicLinkToken(token: string): Promise<void>;
  countRecentActiveTokens(email: string, sinceMs: number): Promise<number>;

  // ADMIN ANALYTICS
  getTopPrompts(limit?: number): Promise<Array<{
    prompt: string;
    count: number;
    avgTokens: number;
    avgResponseTime: number;
  }>>;
  
  // CONNECTION HEALTH
  testConnection(): Promise<boolean>;
  getConnectionStatus(): 'connected' | 'disconnected' | 'error' | 'unknown';
}

// In-memory storage for backward compatibility
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private usageLogs: Map<number, UsageLog>;
  private conversations: Map<number, Conversation>;
  private messages: Map<number, Message>;
  private savedPlans: Map<number, SavedPlan>;
  private shareLogs: Map<number, ShareLog>;
  private guestSessions: Map<string, GuestSession>;
  private emailCaptures: Map<number, EmailCapture>;
  private emailCaptureIdCounter: number;
  private magicLinkTokens: Map<string, MagicLinkToken>;
  private userIdCounter: number;
  private logIdCounter: number;
  private conversationIdCounter: number;
  private messageIdCounter: number;
  private savedPlanIdCounter: number;
  private shareLogIdCounter: number;

  constructor() {
    this.users = new Map();
    this.usageLogs = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.savedPlans = new Map();
    this.shareLogs = new Map();
    this.guestSessions = new Map();
    this.emailCaptures = new Map();
    this.emailCaptureIdCounter = 1;
    this.magicLinkTokens = new Map();
    this.userIdCounter = 1;
    this.logIdCounter = 1;
    this.conversationIdCounter = 1;
    this.messageIdCounter = 1;
    this.savedPlanIdCounter = 1;
    this.shareLogIdCounter = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.googleId === googleId);
  }

  async getUserByFacebookId(facebookId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.facebookId === facebookId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = {
      id,
      googleId: insertUser.googleId || null,
      facebookId: insertUser.facebookId || null,
      email: insertUser.email,
      name: insertUser.name,
      profilePicture: insertUser.profilePicture || null,
      role: insertUser.role || "user",
      createdAt: now,
      lastLoginAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error("User not found");
    }
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async createUsageLog(insertLog: InsertUsageLog): Promise<UsageLog> {
    const id = this.logIdCounter++;
    const log: UsageLog = {
      id,
      userId: insertLog.userId || null,
      sessionId: insertLog.sessionId,
      promptTokens: insertLog.promptTokens,
      completionTokens: insertLog.completionTokens,
      totalTokens: insertLog.totalTokens,
      conversationLength: insertLog.conversationLength,
      responseTimeMs: insertLog.responseTimeMs,
      timestamp: new Date(),
      userMessage: insertLog.userMessage,
      aiResponse: insertLog.aiResponse,
    };
    this.usageLogs.set(id, log);
    return log;
  }

  async getUserUsageLogs(userId: number, limit = 50): Promise<UsageLog[]> {
    const logs = Array.from(this.usageLogs.values())
      .filter(log => log.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
    return logs;
  }

  async getUsageStatistics(): Promise<UsageStatistics> {
    const totalUsers = this.users.size;
    const totalInteractions = this.usageLogs.size;
    const totalTokensUsed = Array.from(this.usageLogs.values())
      .reduce((sum, log) => sum + log.totalTokens, 0);
    const averageTokensPerUser = totalUsers > 0 ? totalTokensUsed / totalUsers : 0;
    
    // Daily active users (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyActiveUsers = new Set(
      Array.from(this.usageLogs.values())
        .filter(log => log.timestamp > oneDayAgo && log.userId)
        .map(log => log.userId)
    ).size;

    return {
      totalUsers,
      totalInteractions,
      totalTokensUsed,
      averageTokensPerUser: Math.round(averageTokensPerUser),
      dailyActiveUsers,
    };
  }

  async getAllUsers(limit = 50, offset = 0): Promise<User[]> {
    const users = Array.from(this.users.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
    return users;
  }

  async getUserCount(): Promise<number> {
    return this.users.size;
  }

  async updateUserRole(id: number, role: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) {
      return undefined;
    }
    const updatedUser = { ...user, role };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }

    // Delete related data in order to handle dependencies
    // 1. Delete saved plans
    const userSavedPlans = Array.from(this.savedPlans.values()).filter(plan => plan.userId === id);
    userSavedPlans.forEach(plan => this.savedPlans.delete(plan.id));

    // 2. Delete share logs
    const userShareLogs = Array.from(this.shareLogs.values()).filter(log => log.userId === id);
    userShareLogs.forEach(log => this.shareLogs.delete(log.id));

    // 3. Delete messages from user's conversations
    const userConversations = Array.from(this.conversations.values()).filter(conv => conv.userId === id);
    userConversations.forEach(conv => {
      const conversationMessages = Array.from(this.messages.values()).filter(msg => msg.conversationId === conv.id);
      conversationMessages.forEach(msg => this.messages.delete(msg.id));
    });

    // 4. Delete conversations
    userConversations.forEach(conv => this.conversations.delete(conv.id));

    // 5. Delete usage logs
    const userUsageLogs = Array.from(this.usageLogs.values()).filter(log => log.userId === id);
    userUsageLogs.forEach(log => this.usageLogs.delete(log.id));

    // 6. Finally delete the user
    this.users.delete(id);
    return true;
  }

  // CONVERSATION OPERATIONS
  async createConversation(userId: number, title?: string, initialMessage?: string): Promise<Conversation> {
    const id = this.conversationIdCounter++;
    const now = new Date();
    const conversation: Conversation = {
      id,
      userId,
      title: title || 'New Conversation',
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };
    this.conversations.set(id, conversation);

    // Add initial message if provided
    if (initialMessage) {
      await this.addMessageToConversation({
        conversationId: id,
        role: 'user',
        content: initialMessage,
        timestamp: now,
        tokensUsed: null,
        responseTimeMs: null,
      });
    }

    return conversation;
  }

  async getConversationsByUser(userId: number): Promise<Array<Conversation & { messageCount: number }>> {
    const userConversations = Array.from(this.conversations.values())
      .filter(conv => conv.userId === userId && conv.isActive)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return userConversations.map(conv => ({
      ...conv,
      messageCount: Array.from(this.messages.values()).filter(msg => msg.conversationId === conv.id).length
    }));
  }

  async getConversationWithMessages(conversationId: number, userId: number, page = 1): Promise<Conversation & { messages: Message[] } | undefined> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return undefined;
    }

    const limit = 50;
    const offset = (page - 1) * limit;
    const conversationMessages = Array.from(this.messages.values())
      .filter(msg => msg.conversationId === conversationId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(offset, offset + limit);

    return {
      ...conversation,
      messages: conversationMessages
    };
  }

  async updateConversationTitle(conversationId: number, userId: number, title: string): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return undefined;
    }

    const updatedConversation = {
      ...conversation,
      title,
      updatedAt: new Date()
    };
    this.conversations.set(conversationId, updatedConversation);
    return updatedConversation;
  }

  async deleteConversation(conversationId: number, userId: number): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return false;
    }

    const updatedConversation = {
      ...conversation,
      isActive: false,
      updatedAt: new Date()
    };
    this.conversations.set(conversationId, updatedConversation);
    return true;
  }

  // MESSAGE OPERATIONS
  async addMessageToConversation(data: Omit<InsertMessage, 'id'>): Promise<Message> {
    const id = this.messageIdCounter++;
    const message: Message = {
      id,
      conversationId: data.conversationId!,
      role: data.role,
      content: data.content,
      timestamp: data.timestamp || new Date(),
      tokensUsed: data.tokensUsed || null,
      responseTimeMs: data.responseTimeMs || null,
    };
    this.messages.set(id, message);

    // Update conversation timestamp
    const conversation = this.conversations.get(data.conversationId!);
    if (conversation) {
      this.conversations.set(data.conversationId!, {
        ...conversation,
        updatedAt: new Date()
      });
    }

    return message;
  }

  async getMessageById(messageId: number, userId: number): Promise<Message & { conversation: { userId: number; user: User } } | undefined> {
    const message = this.messages.get(messageId);
    if (!message) return undefined;

    const conversation = this.conversations.get(message.conversationId!);
    if (!conversation || conversation.userId !== userId) return undefined;

    const user = this.users.get(conversation.userId);
    if (!user) return undefined;

    return {
      ...message,
      conversation: {
        userId: conversation.userId,
        user
      }
    };
  }

  // SAVED PLANS OPERATIONS
  async savePlan(data: Omit<InsertSavedPlan, 'id' | 'savedAt'>): Promise<SavedPlan> {
    const id = this.savedPlanIdCounter++;
    const savedPlan: SavedPlan = {
      id,
      userId: data.userId!,
      messageId: data.messageId || 0,
      title: data.title || 'Untitled Plan',
      tags: data.tags || [],
      savedAt: new Date(),
    };
    this.savedPlans.set(id, savedPlan);
    return savedPlan;
  }

  async getSavedPlansByUser(userId: number): Promise<Array<SavedPlan & { message: { conversation: Conversation } }>> {
    const userPlans = Array.from(this.savedPlans.values())
      .filter(plan => plan.userId === userId)
      .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());

    return userPlans.map(plan => {
      const message = this.messages.get(plan.messageId!);
      const conversation = message ? this.conversations.get(message.conversationId!) : undefined;
      return {
        ...plan,
        message: {
          conversation: conversation!
        }
      };
    });
  }

  async deleteSavedPlan(planId: number, userId: number): Promise<boolean> {
    const plan = this.savedPlans.get(planId);
    if (!plan || plan.userId !== userId) {
      return false;
    }
    this.savedPlans.delete(planId);
    return true;
  }

  // SHARE LOG OPERATIONS
  async logShare(data: Omit<InsertShareLog, 'id' | 'sharedAt'>): Promise<ShareLog> {
    const id = this.shareLogIdCounter++;
    const shareLog: ShareLog = {
      id,
      userId: data.userId!,
      messageId: data.messageId || 0,
      recipientEmail: data.recipientEmail || null,
      sharedAt: new Date(),
    };
    this.shareLogs.set(id, shareLog);
    return shareLog;
  }

  // GUEST SESSION OPERATIONS
  async getOrCreateGuestSession(sessionId: string, ipAddress: string, userAgent: string): Promise<GuestSession> {
    const existing = this.guestSessions.get(sessionId);
    if (existing) {
      // Touch lastActiveAt
      const updated: GuestSession = { ...existing, lastActiveAt: new Date() };
      this.guestSessions.set(sessionId, updated);
      return updated;
    }
    const now = new Date();
    const session: GuestSession = {
      id: sessionId,
      ipAddress,
      userAgent,
      conversationCount: 0,
      tokensUsed: 0,
      createdAt: now,
      lastActiveAt: now,
      convertedToUserId: null,
      convertedAt: null,
    };
    this.guestSessions.set(sessionId, session);
    return session;
  }

  async getGuestSession(sessionId: string): Promise<GuestSession | undefined> {
    return this.guestSessions.get(sessionId);
  }

  async incrementGuestConversationCount(sessionId: string, tokensUsed = 0): Promise<GuestSession | undefined> {
    const existing = this.guestSessions.get(sessionId);
    if (!existing) return undefined;
    const updated: GuestSession = {
      ...existing,
      conversationCount: existing.conversationCount + 1,
      tokensUsed: existing.tokensUsed + tokensUsed,
      lastActiveAt: new Date(),
    };
    this.guestSessions.set(sessionId, updated);
    return updated;
  }

  async markGuestConverted(sessionId: string, userId: number): Promise<GuestSession | undefined> {
    const existing = this.guestSessions.get(sessionId);
    if (!existing) return undefined;
    // Don't overwrite if already converted (preserve first-conversion timestamp)
    if (existing.convertedToUserId) return existing;
    const updated: GuestSession = {
      ...existing,
      convertedToUserId: userId,
      convertedAt: new Date(),
    };
    this.guestSessions.set(sessionId, updated);
    return updated;
  }

  async getGuestStatistics(promptLimit: number): Promise<GuestStatistics> {
    const all = Array.from(this.guestSessions.values());
    const totalGuests = all.length;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const activeLast24h = all.filter(g => g.lastActiveAt.getTime() > now - oneDay).length;
    const activeLast7d = all.filter(g => g.lastActiveAt.getTime() > now - 7 * oneDay).length;
    const convertedGuests = all.filter(g => g.convertedToUserId !== null).length;
    const totalPrompts = all.reduce((sum, g) => sum + g.conversationCount, 0);
    const avgPromptsPerGuest = totalGuests > 0 ? Math.round(totalPrompts / totalGuests) : 0;
    const guestsAtLimit = all.filter(g => g.conversationCount >= promptLimit).length;
    const conversionRate = totalGuests > 0
      ? Math.round((convertedGuests / totalGuests) * 1000) / 10
      : 0;
    return {
      totalGuests,
      activeLast24h,
      activeLast7d,
      convertedGuests,
      conversionRate,
      avgPromptsPerGuest,
      guestsAtLimit,
    };
  }

  async getRecentConversions(limit = 25): Promise<ConvertedGuest[]> {
    return Array.from(this.guestSessions.values())
      .filter(g => g.convertedToUserId !== null && g.convertedAt !== null)
      .sort((a, b) => (b.convertedAt!.getTime()) - (a.convertedAt!.getTime()))
      .slice(0, limit)
      .map(g => {
        const user = this.users.get(g.convertedToUserId!);
        return {
          sessionId: g.id,
          convertedAt: g.convertedAt!,
          convertedToUserId: g.convertedToUserId!,
          promptsBeforeConversion: g.conversationCount,
          userName: user?.name || 'Unknown',
          userEmail: user?.email || 'unknown@example.com',
        };
      });
  }

  // EMAIL CAPTURE OPERATIONS
  async createEmailCapture(data: InsertEmailCapture): Promise<EmailCapture> {
    const id = this.emailCaptureIdCounter++;
    const capture: EmailCapture = {
      id,
      email: data.email,
      sessionId: data.sessionId || null,
      ipAddress: data.ipAddress,
      source: data.source || "auth_dialog",
      reportSent: data.reportSent ?? false,
      capturedAt: new Date(),
      convertedToUserId: data.convertedToUserId || null,
      convertedAt: data.convertedAt || null,
    };
    this.emailCaptures.set(id, capture);
    return capture;
  }

  async markEmailCaptureReportSent(id: number): Promise<void> {
    const existing = this.emailCaptures.get(id);
    if (!existing) return;
    this.emailCaptures.set(id, { ...existing, reportSent: true });
  }

  // MAGIC LINK OPERATIONS
  async createMagicLinkToken(data: InsertMagicLinkToken): Promise<MagicLinkToken> {
    const tok: MagicLinkToken = {
      token: data.token,
      email: data.email,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
      consumedAt: null,
      requestIp: data.requestIp ?? null,
      requestUserAgent: data.requestUserAgent ?? null,
    };
    this.magicLinkTokens.set(data.token, tok);
    return tok;
  }

  async getMagicLinkToken(token: string): Promise<MagicLinkToken | undefined> {
    return this.magicLinkTokens.get(token);
  }

  async consumeMagicLinkToken(token: string): Promise<void> {
    const existing = this.magicLinkTokens.get(token);
    if (!existing) return;
    this.magicLinkTokens.set(token, { ...existing, consumedAt: new Date() });
  }

  async countRecentActiveTokens(email: string, sinceMs: number): Promise<number> {
    const cutoff = Date.now() - sinceMs;
    const now = Date.now();
    return Array.from(this.magicLinkTokens.values()).filter(
      (t) =>
        t.email === email &&
        t.consumedAt === null &&
        t.createdAt.getTime() > cutoff &&
        t.expiresAt.getTime() > now,
    ).length;
  }

  // ADMIN ANALYTICS
  async getTopPrompts(limit = 20): Promise<Array<{prompt: string; count: number; avgTokens: number; avgResponseTime: number}>> {
    const promptStats = new Map<string, {count: number; totalTokens: number; totalResponseTime: number}>();

    Array.from(this.usageLogs.values()).forEach(log => {
      const prompt = log.userMessage;
      const existing = promptStats.get(prompt) || {count: 0, totalTokens: 0, totalResponseTime: 0};
      promptStats.set(prompt, {
        count: existing.count + 1,
        totalTokens: existing.totalTokens + log.totalTokens,
        totalResponseTime: existing.totalResponseTime + log.responseTimeMs
      });
    });

    return Array.from(promptStats.entries())
      .map(([prompt, stats]) => ({
        prompt,
        count: stats.count,
        avgTokens: Math.round(stats.totalTokens / stats.count),
        avgResponseTime: Math.round(stats.totalResponseTime / stats.count)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // CONNECTION HEALTH
  async testConnection(): Promise<boolean> {
    return true; // Memory storage is always available
  }

  getConnectionStatus(): 'connected' | 'disconnected' | 'error' | 'unknown' {
    return 'connected';
  }
}

import { getDatabase } from "./db";
import { users, usageLogs, conversations, messages, savedPlans, shareLog, guestSessions, emailCaptures, magicLinkTokens } from "@shared/schema";
import { eq, desc, count, sum, gte, and, sql, asc, isNull } from "drizzle-orm";

// Drizzle-based database storage
export class DrizzleStorage implements IStorage {
  private db: ReturnType<typeof getDatabase>;

  constructor() {
    this.db = getDatabase();
    if (!this.db) {
      throw new Error('Database not initialized. Check ENABLE_DATABASE_STORAGE flag and DATABASE_URL.');
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await this.db!.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db!.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await this.db!.select().from(users).where(eq(users.googleId, googleId));
    return user || undefined;
  }

  async getUserByFacebookId(facebookId: string): Promise<User | undefined> {
    const [user] = await this.db!.select().from(users).where(eq(users.facebookId, facebookId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await this.db!
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await this.db!
      .update(users)
      .set({ ...updates, lastLoginAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  async createUsageLog(insertLog: InsertUsageLog): Promise<UsageLog> {
    const [log] = await this.db!
      .insert(usageLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async getUserUsageLogs(userId: number, limit = 50): Promise<UsageLog[]> {
    const logs = await this.db!
      .select()
      .from(usageLogs)
      .where(eq(usageLogs.userId, userId))
      .orderBy(desc(usageLogs.timestamp))
      .limit(limit);
    return logs;
  }

  async getUsageStatistics(): Promise<UsageStatistics> {
    // Get total users
    const [{ count: totalUsers }] = await this.db!
      .select({ count: count() })
      .from(users);

    // Get total interactions and tokens
    const [stats] = await this.db!
      .select({
        totalInteractions: count(),
        totalTokensUsed: sum(usageLogs.totalTokens),
      })
      .from(usageLogs);

    const totalTokensUsed = Number(stats?.totalTokensUsed) || 0;
    const totalInteractions = Number(stats?.totalInteractions) || 0;
    const averageTokensPerUser = totalUsers > 0 ? Math.round(totalTokensUsed / totalUsers) : 0;

    // Get daily active users (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyActiveLogs = await this.db!
      .selectDistinct({ userId: usageLogs.userId })
      .from(usageLogs)
      .where(
        and(
          gte(usageLogs.timestamp, oneDayAgo),
          eq(usageLogs.userId, usageLogs.userId) // This ensures we only count non-null userIds
        )
      );

    return {
      totalUsers,
      totalInteractions,
      totalTokensUsed,
      averageTokensPerUser,
      dailyActiveUsers: dailyActiveLogs.length,
    };
  }

  async getAllUsers(limit = 50, offset = 0): Promise<User[]> {
    const usersList = await this.db!
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
    return usersList;
  }

  async getUserCount(): Promise<number> {
    const [{ count: totalUsers }] = await this.db!
      .select({ count: count() })
      .from(users);
    return totalUsers;
  }

  async updateUserRole(id: number, role: string): Promise<User | undefined> {
    const [user] = await this.db!
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      await this.db!.transaction(async (tx) => {
        // Delete in order to handle foreign key constraints
        // 1. Delete saved plans
        await tx.delete(savedPlans).where(eq(savedPlans.userId, id));
        
        // 2. Delete share logs
        await tx.delete(shareLog).where(eq(shareLog.userId, id));
        
        // 3. Delete messages from user's conversations
        const userConversations = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.userId, id));
        
        for (const conv of userConversations) {
          await tx.delete(messages).where(eq(messages.conversationId, conv.id));
        }
        
        // 4. Delete conversations
        await tx.delete(conversations).where(eq(conversations.userId, id));
        
        // 5. Delete usage logs
        await tx.delete(usageLogs).where(eq(usageLogs.userId, id));
        
        // 6. Finally delete the user
        await tx.delete(users).where(eq(users.id, id));
      });
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  // CONVERSATION OPERATIONS
  async createConversation(userId: number, title?: string, initialMessage?: string): Promise<Conversation> {
    const [conversation] = await this.db!.transaction(async (tx) => {
      const [conv] = await tx.insert(conversations).values({
        userId,
        title: title || 'New Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      if (initialMessage) {
        await tx.insert(messages).values({
          conversationId: conv.id,
          role: 'user',
          content: initialMessage,
          timestamp: new Date(),
        });
      }

      return [conv];
    });

    return conversation;
  }

  async getConversationsByUser(userId: number): Promise<Array<Conversation & { messageCount: number }>> {
    const userConversations = await this.db!
      .select({
        id: conversations.id,
        userId: conversations.userId,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,
        isActive: conversations.isActive,
        messageCount: count(messages.id),
      })
      .from(conversations)
      .leftJoin(messages, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.userId, userId), eq(conversations.isActive, true)))
      .groupBy(conversations.id)
      .orderBy(desc(conversations.updatedAt));

    return userConversations;
  }

  async getConversationWithMessages(conversationId: number, userId: number, page = 1): Promise<Conversation & { messages: Message[] } | undefined> {
    const limit = 50;
    const offset = (page - 1) * limit;

    const conversation = await this.db!
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId)
      ))
      .limit(1);

    if (!conversation.length) {
      return undefined;
    }

    const conversationMessages = await this.db!
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.timestamp))
      .limit(limit)
      .offset(offset);

    return {
      ...conversation[0],
      messages: conversationMessages
    } as Conversation & { messages: Message[] };
  }

  async updateConversationTitle(conversationId: number, userId: number, title: string): Promise<Conversation | undefined> {
    const [updated] = await this.db!
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId)
      ))
      .returning();

    return updated || undefined;
  }

  async deleteConversation(conversationId: number, userId: number): Promise<boolean> {
    const [deleted] = await this.db!
      .update(conversations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId)
      ))
      .returning();

    return !!deleted;
  }

  // MESSAGE OPERATIONS
  async addMessageToConversation(data: Omit<InsertMessage, 'id'>): Promise<Message> {
    const [message] = await this.db!.transaction(async (tx) => {
      const [msg] = await tx.insert(messages).values({
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        timestamp: data.timestamp || new Date(),
        tokensUsed: data.tokensUsed,
        responseTimeMs: data.responseTimeMs,
      }).returning();

      // Update conversation timestamp
      await tx.update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, data.conversationId!));

      return [msg];
    });

    return message;
  }

  async getMessageById(messageId: number, userId: number): Promise<Message & { conversation: { userId: number; user: User } } | undefined> {
    const message = await this.db!.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    
    if (!message || message.length === 0) {
      return undefined;
    }

    const conversation = await this.db!.select().from(conversations).where(eq(conversations.id, message[0].conversationId!)).limit(1);
    
    if (!conversation || conversation.length === 0 || conversation[0].userId !== userId) {
      return undefined;
    }

    const user = await this.db!.select().from(users).where(eq(users.id, conversation[0].userId)).limit(1);
    
    if (!user || user.length === 0) {
      return undefined;
    }

    return {
      ...message[0],
      conversation: {
        userId: conversation[0].userId,
        user: user[0]
      }
    };
  }

  // SAVED PLANS OPERATIONS
  async savePlan(data: Omit<InsertSavedPlan, 'id' | 'savedAt'>): Promise<SavedPlan> {
    const [plan] = await this.db!.insert(savedPlans).values({
      userId: data.userId,
      messageId: data.messageId,
      title: data.title || 'Untitled Plan',
      tags: data.tags || [],
      savedAt: new Date(),
    }).returning();

    return plan;
  }

  async getSavedPlansByUser(userId: number): Promise<Array<SavedPlan & { message: { conversation: Conversation } }>> {
    const plans = await this.db!.select().from(savedPlans).where(eq(savedPlans.userId, userId)).orderBy(desc(savedPlans.savedAt));
    
    const result = [];
    for (const plan of plans) {
      const message = await this.db!.select().from(messages).where(eq(messages.id, plan.messageId!)).limit(1);
      if (message && message.length > 0) {
        const conversation = await this.db!.select().from(conversations).where(eq(conversations.id, message[0].conversationId!)).limit(1);
        if (conversation && conversation.length > 0) {
          result.push({
            ...plan,
            message: {
              ...message[0],
              conversation: conversation[0]
            }
          });
        }
      }
    }
    
    return result;
  }

  async deleteSavedPlan(planId: number, userId: number): Promise<boolean> {
    const result = await this.db!.delete(savedPlans)
      .where(and(
        eq(savedPlans.id, planId),
        eq(savedPlans.userId, userId)
      ));

    return result.rowCount! > 0;
  }

  // SHARE LOG OPERATIONS
  async logShare(data: Omit<InsertShareLog, 'id' | 'sharedAt'>): Promise<ShareLog> {
    const [log] = await this.db!.insert(shareLog).values({
      userId: data.userId,
      messageId: data.messageId,
      recipientEmail: data.recipientEmail,
      sharedAt: new Date()
    }).returning();

    return log;
  }

  // GUEST SESSION OPERATIONS
  async getOrCreateGuestSession(sessionId: string, ipAddress: string, userAgent: string): Promise<GuestSession> {
    // Try INSERT; on conflict (already exists), touch lastActiveAt and return.
    const [inserted] = await this.db!
      .insert(guestSessions)
      .values({
        id: sessionId,
        ipAddress,
        userAgent,
      })
      .onConflictDoUpdate({
        target: guestSessions.id,
        set: { lastActiveAt: new Date() },
      })
      .returning();
    return inserted;
  }

  async getGuestSession(sessionId: string): Promise<GuestSession | undefined> {
    const [session] = await this.db!
      .select()
      .from(guestSessions)
      .where(eq(guestSessions.id, sessionId))
      .limit(1);
    return session || undefined;
  }

  async incrementGuestConversationCount(sessionId: string, tokensUsed = 0): Promise<GuestSession | undefined> {
    const [updated] = await this.db!
      .update(guestSessions)
      .set({
        conversationCount: sql`${guestSessions.conversationCount} + 1`,
        tokensUsed: sql`${guestSessions.tokensUsed} + ${tokensUsed}`,
        lastActiveAt: new Date(),
      })
      .where(eq(guestSessions.id, sessionId))
      .returning();
    return updated || undefined;
  }

  async markGuestConverted(sessionId: string, userId: number): Promise<GuestSession | undefined> {
    // Only set if not already converted, to preserve the first conversion timestamp.
    const [updated] = await this.db!
      .update(guestSessions)
      .set({
        convertedToUserId: userId,
        convertedAt: new Date(),
      })
      .where(and(
        eq(guestSessions.id, sessionId),
        sql`${guestSessions.convertedToUserId} IS NULL`
      ))
      .returning();
    return updated || undefined;
  }

  async getGuestStatistics(promptLimit: number): Promise<GuestStatistics> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [row] = await this.db!
      .select({
        totalGuests: count(),
        activeLast24h: sql<number>`COUNT(*) FILTER (WHERE ${guestSessions.lastActiveAt} > ${oneDayAgo})`.mapWith(Number),
        activeLast7d: sql<number>`COUNT(*) FILTER (WHERE ${guestSessions.lastActiveAt} > ${sevenDaysAgo})`.mapWith(Number),
        convertedGuests: sql<number>`COUNT(*) FILTER (WHERE ${guestSessions.convertedToUserId} IS NOT NULL)`.mapWith(Number),
        avgPromptsPerGuest: sql<number>`COALESCE(AVG(${guestSessions.conversationCount}), 0)`.mapWith(Number),
        guestsAtLimit: sql<number>`COUNT(*) FILTER (WHERE ${guestSessions.conversationCount} >= ${promptLimit})`.mapWith(Number),
      })
      .from(guestSessions);

    const totalGuests = Number(row?.totalGuests) || 0;
    const convertedGuests = Number(row?.convertedGuests) || 0;
    const conversionRate = totalGuests > 0
      ? Math.round((convertedGuests / totalGuests) * 1000) / 10
      : 0;

    return {
      totalGuests,
      activeLast24h: Number(row?.activeLast24h) || 0,
      activeLast7d: Number(row?.activeLast7d) || 0,
      convertedGuests,
      conversionRate,
      avgPromptsPerGuest: Math.round(Number(row?.avgPromptsPerGuest) || 0),
      guestsAtLimit: Number(row?.guestsAtLimit) || 0,
    };
  }

  async getRecentConversions(limit = 25): Promise<ConvertedGuest[]> {
    const rows = await this.db!
      .select({
        sessionId: guestSessions.id,
        convertedAt: guestSessions.convertedAt,
        convertedToUserId: guestSessions.convertedToUserId,
        promptsBeforeConversion: guestSessions.conversationCount,
        userName: users.name,
        userEmail: users.email,
      })
      .from(guestSessions)
      .innerJoin(users, eq(users.id, guestSessions.convertedToUserId))
      .where(sql`${guestSessions.convertedToUserId} IS NOT NULL`)
      .orderBy(desc(guestSessions.convertedAt))
      .limit(limit);

    return rows.map(r => ({
      sessionId: r.sessionId,
      convertedAt: r.convertedAt!,
      convertedToUserId: r.convertedToUserId!,
      promptsBeforeConversion: r.promptsBeforeConversion,
      userName: r.userName,
      userEmail: r.userEmail,
    }));
  }

  // EMAIL CAPTURE OPERATIONS
  async createEmailCapture(data: InsertEmailCapture): Promise<EmailCapture> {
    const [capture] = await this.db!
      .insert(emailCaptures)
      .values(data)
      .returning();
    return capture;
  }

  async markEmailCaptureReportSent(id: number): Promise<void> {
    await this.db!
      .update(emailCaptures)
      .set({ reportSent: true })
      .where(eq(emailCaptures.id, id));
  }

  // MAGIC LINK OPERATIONS
  async createMagicLinkToken(data: InsertMagicLinkToken): Promise<MagicLinkToken> {
    const [tok] = await this.db!
      .insert(magicLinkTokens)
      .values(data)
      .returning();
    return tok;
  }

  async getMagicLinkToken(token: string): Promise<MagicLinkToken | undefined> {
    const [tok] = await this.db!
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.token, token))
      .limit(1);
    return tok || undefined;
  }

  async consumeMagicLinkToken(token: string): Promise<void> {
    await this.db!
      .update(magicLinkTokens)
      .set({ consumedAt: new Date() })
      .where(eq(magicLinkTokens.token, token));
  }

  async countRecentActiveTokens(email: string, sinceMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - sinceMs);
    const now = new Date();
    const [row] = await this.db!
      .select({ n: count() })
      .from(magicLinkTokens)
      .where(and(
        eq(magicLinkTokens.email, email),
        isNull(magicLinkTokens.consumedAt),
        gte(magicLinkTokens.createdAt, cutoff),
        gte(magicLinkTokens.expiresAt, now),
      ));
    return Number(row?.n) || 0;
  }

  // ADMIN ANALYTICS
  async getTopPrompts(limit = 20): Promise<Array<{prompt: string; count: number; avgTokens: number; avgResponseTime: number}>> {
    const topPrompts = await this.db!
      .select({
        prompt: usageLogs.userMessage,
        count: count(usageLogs.id),
        avgTokens: sql<number>`avg(${usageLogs.totalTokens})`,
        avgResponseTime: sql<number>`avg(${usageLogs.responseTimeMs})`
      })
      .from(usageLogs)
      .groupBy(usageLogs.userMessage)
      .orderBy(desc(count(usageLogs.id)))
      .limit(limit);

    return topPrompts.map(row => ({
      prompt: row.prompt,
      count: row.count,
      avgTokens: Math.round(Number(row.avgTokens)),
      avgResponseTime: Math.round(Number(row.avgResponseTime))
    }));
  }

  // CONNECTION HEALTH
  async testConnection(): Promise<boolean> {
    try {
      await this.db!.select({ count: count() }).from(users).limit(1);
      return true;
    } catch (error) {
      return false;
    }
  }

  getConnectionStatus(): 'connected' | 'disconnected' | 'error' | 'unknown' {
    try {
      return this.db ? 'connected' : 'disconnected';
    } catch (error) {
      return 'error';
    }
  }
}

// Feature flag controlled storage initialization
const ENABLE_DATABASE_STORAGE = process.env.ENABLE_DATABASE_STORAGE === 'true';

// Production safety: Force database storage in production
function createStorage(): IStorage {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // CRITICAL: Production deployments must use database storage
  if (isProduction && !ENABLE_DATABASE_STORAGE) {
    console.error('PRODUCTION ERROR: Database storage must be enabled in production');
    console.error('Set ENABLE_DATABASE_STORAGE=true in production environment');
    throw new Error('Production requires database storage - MemStorage not allowed');
  }
  
  if (ENABLE_DATABASE_STORAGE) {
    try {
      return new DrizzleStorage();
    } catch (error) {
      if (isProduction) {
        console.error('PRODUCTION FATAL: Database storage failed to initialize:', error);
        throw new Error('Production database storage initialization failed');
      }
      // Only fall back to memory storage in development
      console.warn('Database storage failed, falling back to memory storage (development only)');
      return new MemStorage();
    }
  }
  
  if (isProduction) {
    throw new Error('Production deployment requires database storage');
  }
  
  return new MemStorage();
}

export const storage = createStorage();
