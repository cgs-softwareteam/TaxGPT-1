import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// OAuth-based user system
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: varchar("google_id", { length: 255 }).unique(),
  facebookId: varchar("facebook_id", { length: 255 }).unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  profilePicture: text("profile_picture"),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at").defaultNow().notNull(),
});

// Usage tracking system
export const usageLogs = pgTable("usage_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  conversationLength: integer("conversation_length").notNull(),
  responseTimeMs: integer("response_time_ms").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response").notNull(),
}, (table) => [
  index("usage_logs_user_id_idx").on(table.userId),
  index("usage_logs_timestamp_idx").on(table.timestamp),
  index("usage_logs_session_id_idx").on(table.sessionId),
]);

// Session storage for authentication
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (table) => [
  index("sessions_expire_idx").on(table.expire),
]);

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  usageLogs: many(usageLogs),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  user: one(users, {
    fields: [usageLogs.userId],
    references: [users.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  googleId: true,
  facebookId: true,
  email: true,
  name: true,
  profilePicture: true,
  role: true,
});

export const insertUsageLogSchema = createInsertSchema(usageLogs).pick({
  userId: true,
  sessionId: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  conversationLength: true,
  responseTimeMs: true,
  userMessage: true,
  aiResponse: true,
});

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UsageLog = typeof usageLogs.$inferSelect;
export type InsertUsageLog = z.infer<typeof insertUsageLogSchema>;

// Admin statistics type
export type UsageStatistics = {
  totalUsers: number;
  totalInteractions: number;
  totalTokensUsed: number;
  averageTokensPerUser: number;
  dailyActiveUsers: number;
};
