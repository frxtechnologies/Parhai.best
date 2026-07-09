/**
 * Idempotent batch classifier for Cambridge IGCSE Physics (0625) questions.
 *
 * Usage:
 *   npx tsx src/scripts/classify-physics-questions.ts
 *   npx tsx src/scripts/classify-physics-questions.ts --force      # reclassify already-tagged rows
 *   npx tsx src/scripts/classify-physics-questions.ts --dry-run    # preview without writing
 *   npx tsx src/scripts/classify-physics-questions.ts --limit 50   # cap rows processed
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and one AI provider key in env.
 */

import { createClient } from "@supabase/supabase-js";
import { classifyQuestionTopicId, keywordClassifyTopicId } from "../services/physics-taxonomy-classifier";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PHYSICS_CODES = ["0625", "5054"];
const BATCH_SIZE = 10;

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 && args[idx + 1] ? Number(args[idx + 1]) : 0;
})();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = {
  id: number;
  clean_question_text: string | null;
  display_question_text: string | null;
  question_text: string | null;
  topic: string | null;
  subtopic: string | null;
  taxonomy_topic_id: string | null;
};

async function resolvePhysicsSubjectIds(): Promise<number[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id,code")
    .in("code", PHYSICS_CODES);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id as number);
  if (ids.length === 0) throw new Error(`No subjects found for codes: ${PHYSICS_CODES.join(", ")}`);
  console.log(`[classify-physics] Subject IDs for ${PHYSICS_CODES.join("/")}:`, ids);
  return ids;
}

async function fetchRows(subjectIds: number[]): Promise<Row[]> {
  const maxRows = LIMIT || 10_000;
  let rows: Row[] = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const take = Math.min(BATCH_SIZE * 10, maxRows - rows.length);
    let q = supabase
      .from("question_index")
      .select("id,clean_question_text,display_question_text,question_text,topic,subtopic,taxonomy_topic_id")
      .in("subject_id", subjectIds)
      .not("clean_question_text", "is", null)
      .range(offset, offset + take - 1);
    if (!FORCE) q = q.is("taxonomy_topic_id", null);
    const { data, error } = await q;
    if (error) throw error;
    rows = [...rows, ...(data ?? [])];
    if ((data?.length ?? 0) < take) break;
    offset += take;
  }
  return rows;
}

async function run() {
  console.log(`[classify-physics] Starting — force=${FORCE}, dry-run=${DRY_RUN}, limit=${LIMIT || "none"}`);

  const subjectIds = await resolvePhysicsSubjectIds();
  const rows = await fetchRows(subjectIds);
  console.log(`[classify-physics] ${rows.length} rows to process`);
  if (rows.length === 0) { console.log("[classify-physics] Nothing to do."); return; }

  let classified = 0, keyworded = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const text = (row.clean_question_text ?? row.display_question_text ?? row.question_text ?? "").trim();
    if (!text) { failed++; continue; }

    let result: Awaited<ReturnType<typeof classifyQuestionTopicId>>;
    try {
      result = await classifyQuestionTopicId(text);
    } catch (err) {
      console.warn(`[classify-physics] row ${row.id}: AI error — ${String(err)}`);
      // Fall back to keyword classification
      const kwId = keywordClassifyTopicId(text);
      result = kwId
        ? { topic_id: kwId, confidence: 0.5, needs_review: true }
        : { topic_id: null, confidence: 0, needs_review: true };
    }

    const tag = result.topic_id ? `${result.topic_id} (${(result.confidence * 100).toFixed(0)}%)` : "null";
    const flag = result.needs_review ? " [needs_review]" : "";
    console.log(`[classify-physics] row ${row.id} [${i + 1}/${rows.length}] → ${tag}${flag}`);

    if (!DRY_RUN && (result.topic_id || result.needs_review)) {
      const { error } = await supabase
        .from("question_index")
        .update({
          taxonomy_topic_id: result.topic_id,
          taxonomy_confidence: result.confidence,
          needs_review: result.needs_review || undefined,
        })
        .eq("id", row.id);
      if (error) console.error(`[classify-physics] row ${row.id} write error:`, error.message);
    }

    if (result.topic_id) classified++;
    else if (result.needs_review) failed++;
  }

  console.log(`[classify-physics] Done — classified: ${classified}, keyword-only: ${keyworded}, needs_review: ${failed}`);
}

run().catch((err) => {
  console.error("[classify-physics] Fatal:", err);
  process.exit(1);
});
