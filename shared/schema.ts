import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial, index, boolean } from "drizzle-orm/pg-core";
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

// Conversations table for persistent chat history
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
  index("conversations_user_id_idx").on(table.userId),
  index("conversations_updated_at_idx").on(table.updatedAt),
]);

// Messages table for individual chat messages
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id),
  role: varchar("role", { length: 20 }).notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  tokensUsed: integer("tokens_used"),
  responseTimeMs: integer("response_time_ms"),
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
  index("messages_timestamp_idx").on(table.timestamp),
]);

// Saved plans table for bookmarked messages
export const savedPlans = pgTable("saved_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  messageId: integer("message_id").references(() => messages.id),
  title: varchar("title", { length: 255 }),
  tags: text("tags").array(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
}, (table) => [
  index("saved_plans_user_id_idx").on(table.userId),
  index("saved_plans_saved_at_idx").on(table.savedAt),
]);

// Share log table for tracking email shares
export const shareLog = pgTable("share_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  messageId: integer("message_id").references(() => messages.id),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  sharedAt: timestamp("shared_at").defaultNow().notNull(),
}, (table) => [
  index("share_log_user_id_idx").on(table.userId),
  index("share_log_shared_at_idx").on(table.sharedAt),
]);

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  usageLogs: many(usageLogs),
  conversations: many(conversations),
  savedPlans: many(savedPlans),
  shareLog: many(shareLog),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  user: one(users, {
    fields: [usageLogs.userId],
    references: [users.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  savedPlans: many(savedPlans),
  shareLog: many(shareLog),
}));

export const savedPlansRelations = relations(savedPlans, ({ one }) => ({
  user: one(users, { fields: [savedPlans.userId], references: [users.id] }),
  message: one(messages, { fields: [savedPlans.messageId], references: [messages.id] }),
}));

export const shareLogRelations = relations(shareLog, ({ one }) => ({
  user: one(users, { fields: [shareLog.userId], references: [users.id] }),
  message: one(messages, { fields: [shareLog.messageId], references: [messages.id] }),
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
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type SavedPlan = typeof savedPlans.$inferSelect;
export type InsertSavedPlan = typeof savedPlans.$inferInsert;
export type ShareLog = typeof shareLog.$inferSelect;
export type InsertShareLog = typeof shareLog.$inferInsert;

// Admin statistics type
export type UsageStatistics = {
  totalUsers: number;
  totalInteractions: number;
  totalTokensUsed: number;
  averageTokensPerUser: number;
  dailyActiveUsers: number;
};
