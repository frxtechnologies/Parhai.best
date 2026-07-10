/**
 * Sync the code taxonomy registry → the taxonomy_topics table (idempotent upsert).
 * The TypeScript registry is the single source of truth; this mirrors it into the
 * DB so question_index.taxonomy_topic_id FKs resolve. Safe to re-run; adding a new
 * subject's taxonomy in code + running this is all that's needed to enable it.
 *
 * Usage:  npx tsx src/scripts/sync-taxonomy.ts   (needs SUPABASE_URL + SERVICE_ROLE_KEY)
 */

import { createClient } from "@supabase/supabase-js";
import { ALL_TAXONOMY_TOPICS } from "../data/taxonomy-registry";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Derive the syllabus code from a topic id prefix (physics ids are shared by 0625/5054). */
function subjectCodeForId(id: string): string {
  if (id.startsWith("phys.")) return "0625";
  if (id.startsWith("math.")) return "4024";
  if (id.startsWith("chem.")) return "5070";
  return "unknown";
}

async function upsertBatch(topics: typeof ALL_TAXONOMY_TOPICS) {
  const rows = topics.map((t) => ({
    id: t.id,
    subject_code: subjectCodeForId(t.id),
    parent_id: t.parent_id,
    name: t.name,
    level: t.level,
    keywords: t.keywords,
  }));
  const { error } = await supabase.from("taxonomy_topics").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function run() {
  const level1 = ALL_TAXONOMY_TOPICS.filter((t) => t.level === 1);
  const level2 = ALL_TAXONOMY_TOPICS.filter((t) => t.level === 2);
  console.log(`[sync-taxonomy] upserting ${level1.length} sections then ${level2.length} subtopics...`);
  // Level-1 first so level-2 parent_id FKs resolve.
  await upsertBatch(level1);
  await upsertBatch(level2);
  const bySubject = ALL_TAXONOMY_TOPICS.reduce<Record<string, number>>((acc, t) => {
    const c = subjectCodeForId(t.id); acc[c] = (acc[c] ?? 0) + 1; return acc;
  }, {});
  console.log(`[sync-taxonomy] Done — ${ALL_TAXONOMY_TOPICS.length} topics:`, bySubject);
}

run().catch((err) => { console.error("[sync-taxonomy] Fatal:", err); process.exit(1); });
