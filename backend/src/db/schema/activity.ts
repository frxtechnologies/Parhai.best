import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  type: text("type").notNull(),
  subjectId: integer("subject_id").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityEntry = typeof activityTable.$inferSelect;
export type InsertActivity = typeof activityTable.$inferInsert;
