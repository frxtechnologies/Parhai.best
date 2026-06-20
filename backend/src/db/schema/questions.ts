import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const questionsTable = pgTable("questions", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull(),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  markingPoints: text("marking_points").array().notNull().default([]),
  marks: integer("marks").notNull().default(2),
  year: integer("year"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Question = typeof questionsTable.$inferSelect;
export type InsertQuestion = typeof questionsTable.$inferInsert;
