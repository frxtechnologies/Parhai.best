/**
 * Backfill embeddings for question_index (Phase 2, F18).
 *
 * Generates 768-dim embeddings over clean_question_text so match_questions can
 * do topic-filtered semantic retrieval. Idempotent: only embeds rows missing an
 * embedding unless --force is passed.
 *
 * Usage:
 *   npx tsx src/scripts/embed-question-index.ts
 *   npx tsx src/scripts/embed-question-index.ts --subject 0625
 *   npx tsx src/scripts/embed-question-index.ts --force --limit 500
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and an AI provider key.
 */

import { createClient } from "@supabase/supabase-js";
import { generateDocumentEmbeddings, AI_EMBEDDING_MODEL } from "../lib/ai-service";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH = 32;

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const argVal = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
const SUBJECT_CODE = argVal("--subject");
const LIMIT = Number(argVal("--limit") ?? 0);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = { id: number; clean_question_text: string | null };

async function resolveSubjectIds(): Promise<number[] | null> {
  if (!SUBJECT_CODE) return null;
  const { data, error } = await supabase.from("subjects").select("id").eq("code", SUBJECT_CODE);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as number);
}

async function run() {
  console.log(`[embed] force=${FORCE} subject=${SUBJECT_CODE ?? "all"} limit=${LIMIT || "none"} model=${AI_EMBEDDING_MODEL}`);
  const subjectIds = await resolveSubjectIds();

  const maxRows = LIMIT || 100_000;
  let processed = 0;
  let embedded = 0;

  while (processed < maxRows) {
    let q = supabase
      .from("question_index")
      .select("id,clean_question_text")
      .not("clean_question_text", "is", null)
      .in("text_quality_status", ["good", "acceptable"])
      .order("id", { ascending: true })
      .limit(BATCH);
    if (!FORCE) q = q.is("embedding", null);
    if (subjectIds) q = q.in("subject_id", subjectIds);
    // When FORCE re-embeds, skip already-done ids by paging past processed count.
    if (FORCE) q = q.range(processed, processed + BATCH - 1);

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    const texts = rows.map((r) => r.clean_question_text!.slice(0, 2000));
    let embeddings: number[][];
    try {
      embeddings = await generateDocumentEmbeddings(texts);
    } catch (err) {
      console.error(`[embed] batch failed (ids ${rows[0]!.id}..${rows[rows.length - 1]!.id}):`, String(err));
      break;
    }

    for (let i = 0; i < rows.length; i++) {
      const { error: upErr } = await supabase
        .from("question_index")
        .update({ embedding: `[${embeddings[i]!.join(",")}]`, embedding_model: AI_EMBEDDING_MODEL })
        .eq("id", rows[i]!.id);
      if (upErr) console.error(`[embed] row ${rows[i]!.id} write error:`, upErr.message);
      else embedded++;
    }

    processed += rows.length;
    console.log(`[embed] ${embedded} embedded (scanned ${processed})`);
    if (rows.length < BATCH && !FORCE) break;
  }

  console.log(`[embed] Done — ${embedded} questions embedded.`);
}

run().catch((err) => {
  console.error("[embed] Fatal:", err);
  process.exit(1);
});
