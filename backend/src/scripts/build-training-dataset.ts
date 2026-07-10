/**
 * Build a versioned training dataset (Phase D) from Parhai's own knowledge —
 * the structured question corpus (+ marking points) and the verified gold
 * Interaction Ledger. No manual authoring, no API calls. Idempotent + deduped.
 *
 * Usage:
 *   npx tsx src/scripts/build-training-dataset.ts
 *   npx tsx src/scripts/build-training-dataset.ts --version v1 --subject 0625
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { TAXONOMY_REGISTRY } from "../data/taxonomy-registry";
import { exampleFromQuestion, exampleFromGoldLedger, type TrainingExample } from "../services/dataset-builder";
import { isGoldReady } from "../services/gold-promotion";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const argVal = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
const VERSION = argVal("--version") ?? `v-${new Date().toISOString().slice(0, 10)}`;
const ONLY_SUBJECT = argVal("--subject");
const SUBJECT_CODES = ONLY_SUBJECT ? [ONLY_SUBJECT] : Object.keys(TAXONOMY_REGISTRY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function persist(examples: TrainingExample[]): Promise<number> {
  if (examples.length === 0) return 0;
  const rows = examples.map((e) => ({
    dataset_version: VERSION, source: e.source, subject_code: e.subjectCode, topic_id: e.topicId,
    difficulty: e.difficulty, marks: e.marks, instruction: e.instruction, input: e.input,
    output: e.output, metadata: e.metadata, content_hash: e.contentHash,
  }));
  const { error } = await supabase.from("training_examples").upsert(rows, { onConflict: "dataset_version,content_hash", ignoreDuplicates: true });
  if (error) { console.error("[dataset] persist error:", error.message); return 0; }
  return rows.length;
}

async function run() {
  console.log(`[dataset] version=${VERSION} subjects=${SUBJECT_CODES.join(",")}`);
  const { data: subjects, error } = await supabase.from("subjects").select("id,code").in("code", SUBJECT_CODES);
  if (error) throw error;
  const subjectMap = new Map<number, string>((subjects ?? []).map((s) => [s.id as number, s.code as string]));

  let fromQuestions = 0;
  // 1) Question corpus → examples.
  for (const [subjectId, code] of subjectMap) {
    for (let offset = 0; ; offset += 500) {
      const { data, error: qErr } = await supabase
        .from("question_index")
        .select("clean_question_text,display_question_text,question_text,answer_text,marking_points,taxonomy_topic_id,difficulty,total_marks,marks")
        .eq("subject_id", subjectId)
        .in("text_quality_status", ["good", "acceptable"])
        .range(offset, offset + 499);
      if (qErr) throw qErr;
      const rows = data ?? [];
      const examples = rows.map((r) => exampleFromQuestion(r, code)).filter((e): e is TrainingExample => e !== null);
      fromQuestions += await persist(examples);
      if (rows.length < 500) break;
    }
  }

  // 2) Verified gold ledger → examples.
  let fromGold = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error: lErr } = await supabase
      .from("ai_interaction_ledger")
      .select("query_text,answer_text,subject_code,resolved_topic_id,citations,model_name,verification_status,quality_score")
      .in("subject_code", SUBJECT_CODES)
      .in("verification_status", ["teacher_verified", "student_positive"])
      .range(offset, offset + 499);
    if (lErr) throw lErr;
    const rows = data ?? [];
    const gold = rows.filter((r) => isGoldReady(r));
    const examples = gold.map(exampleFromGoldLedger).filter((e): e is TrainingExample => e !== null);
    fromGold += await persist(examples);
    if (rows.length < 500) break;
  }

  console.log(`[dataset] Done — ${fromQuestions} from question corpus, ${fromGold} from gold ledger (version ${VERSION}).`);
}

run().catch((err) => { console.error("[dataset] Fatal:", err); process.exit(1); });
