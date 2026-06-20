import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const aiMessagesTable = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  subjectId: integer("subject_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiMessage = typeof aiMessagesTable.$inferSelect;
export type InsertAiMessage = typeof aiMessagesTable.$inferInsert;
