import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const papersTable = pgTable("papers", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull(),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  session: text("session").notNull(),
  paperNumber: integer("paper_number").notNull(),
  type: text("type").notNull(),
  variant: integer("variant"),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Paper = typeof papersTable.$inferSelect;
export type InsertPaper = typeof papersTable.$inferInsert;
