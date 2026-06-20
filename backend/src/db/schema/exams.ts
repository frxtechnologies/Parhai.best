import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";

export const examsTable = pgTable("exams", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull(),
  session: text("session").notNull(),
  year: integer("year").notNull(),
  examDate: date("exam_date", { mode: "string" }).notNull(),
  paperNumber: integer("paper_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Exam = typeof examsTable.$inferSelect;
export type InsertExam = typeof examsTable.$inferInsert;
