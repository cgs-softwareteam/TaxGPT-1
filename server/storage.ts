import { type User, type InsertUser, type UsageLog, type InsertUsageLog, type UsageStatistics } from "@shared/schema";
import { randomUUID } from "crypto";

// OAuth-focused storage interface
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByFacebookId(facebookId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  
  // Usage tracking
  createUsageLog(log: InsertUsageLog): Promise<UsageLog>;
  getUserUsageLogs(userId: number, limit?: number): Promise<UsageLog[]>;
  getUsageStatistics(): Promise<UsageStatistics>;
  
  // Admin operations
  getAllUsers(limit?: number, offset?: number): Promise<User[]>;
  getUserCount(): Promise<number>;
}

// In-memory storage for backward compatibility
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private usageLogs: Map<number, UsageLog>;
  private userIdCounter: number;
  private logIdCounter: number;

  constructor() {
    this.users = new Map();
    this.usageLogs = new Map();
    this.userIdCounter = 1;
    this.logIdCounter = 1;
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
}

import { getDatabase } from "./db";
import { users, usageLogs } from "@shared/schema";
import { eq, desc, count, sum, gte, and } from "drizzle-orm";

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
}

// Feature flag controlled storage initialization
const ENABLE_DATABASE_STORAGE = process.env.ENABLE_DATABASE_STORAGE === 'true';

// Storage factory with feature flag support
function createStorage(): IStorage {
  if (ENABLE_DATABASE_STORAGE) {
    try {
      return new DrizzleStorage();
    } catch (error) {
      console.warn('Failed to initialize database storage, falling back to memory storage:', error);
      return new MemStorage();
    }
  }
  return new MemStorage();
}

export const storage = createStorage();
