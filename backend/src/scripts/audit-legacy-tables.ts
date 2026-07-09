/**
 * READ-ONLY audit of the three schema generations (F15).
 *
 * Answers "is the legacy stack safe to delete?" by counting rows in every
 * Gen-1 / Gen-2 / Gen-3 table. Combined with the ai_retrieval_telemetry
 * legacy_sources_cited signal, this turns table removal from a guess into an
 * evidence-backed decision. Makes NO writes.
 *
 * Usage: npx tsx src/scripts/audit-legacy-tables.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GENERATIONS: Record<string, string[]> = {
  "Gen-1 (dead, 1536-dim)": ["past_papers", "paper_chunks", "note_chunks", "ai_chat_history"],
  "Gen-2 (legacy retrieval)": ["papers", "questions", "question_topics", "topics", "marking_schemes", "document_chunks"],
  "Gen-3 (canonical, live)": ["resources", "question_index", "ai_chunks", "chat_messages"],
};

async function countRows(table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) return null; // table may not exist
  return count ?? 0;
}

async function run() {
  console.log("\n=== Legacy schema audit (read-only) ===\n");
  const legacyTotals: number[] = [];

  for (const [gen, tables] of Object.entries(GENERATIONS)) {
    console.log(gen);
    for (const table of tables) {
      const n = await countRows(table);
      const label = n === null ? "does not exist" : `${n} rows`;
      console.log(`  ${table.padEnd(18)} ${label}`);
      if (gen.startsWith("Gen-1") || gen.startsWith("Gen-2")) if (n && n > 0) legacyTotals.push(n);
    }
    console.log("");
  }

  const legacyRowsPresent = legacyTotals.reduce((a, b) => a + b, 0);
  console.log("─────────────────────────────────────────");
  if (legacyRowsPresent === 0) {
    console.log("✓ Gen-1 & Gen-2 tables are EMPTY (or absent).");
    console.log("  If ai_retrieval_telemetry.legacy_sources_cited is also ~0, they are safe to DROP.");
  } else {
    console.log(`⚠ Gen-1/Gen-2 hold ${legacyRowsPresent} rows across tables.`);
    console.log("  Do NOT drop yet — migrate any live content into Gen-3 (question_index/ai_chunks) first.");
  }
  console.log("");
}

run().catch((err) => {
  console.error("[audit-legacy-tables] Fatal:", err);
  process.exit(1);
});
