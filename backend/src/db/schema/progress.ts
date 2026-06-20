import { pgTable, serial, timestamp, integer, real } from "drizzle-orm/pg-core";

export const progressTable = pgTable("progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  subjectId: integer("subject_id").notNull(),
  questionsAttempted: integer("questions_attempted").notNull().default(0),
  questionsCorrect: integer("questions_correct").notNull().default(0),
  papersCompleted: integer("papers_completed").notNull().default(0),
  notesRead: integer("notes_read").notNull().default(0),
  hoursStudied: real("hours_studied").notNull().default(0),
  lastStudied: timestamp("last_studied", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Progress = typeof progressTable.$inferSelect;
export type InsertProgress = typeof progressTable.$inferInsert;
