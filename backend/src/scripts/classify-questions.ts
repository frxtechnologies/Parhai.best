/**
 * Idempotent batch topic-classifier for ANY subject with a registered taxonomy
 * (Physics 0625/5054, Math 4024, Chemistry 5070, …). Each question is classified
 * against its own subject's closed-set taxonomy.
 *
 * Usage:
 *   npx tsx src/scripts/classify-questions.ts                 # all taxonomy subjects
 *   npx tsx src/scripts/classify-questions.ts --subject 4024  # one subject
 *   npx tsx src/scripts/classify-questions.ts --force         # reclassify tagged rows
 *   npx tsx src/scripts/classify-questions.ts --dry-run       # preview, no writes
 *   npx tsx src/scripts/classify-questions.ts --limit 200     # cap rows processed
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and one AI provider key.
 */

import { createClient } from "@supabase/supabase-js";
import { classifyQuestionTopicId, keywordClassifyTopicId } from "../services/taxonomy-classifier";
import { TAXONOMY_REGISTRY } from "../data/taxonomy-registry";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = 100;

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");
const argVal = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
const ONLY_SUBJECT = argVal("--subject");
const LIMIT = Number(argVal("--limit") ?? 0);

const SUBJECT_CODES = ONLY_SUBJECT ? [ONLY_SUBJECT] : Object.keys(TAXONOMY_REGISTRY);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
if (ONLY_SUBJECT && !(ONLY_SUBJECT in TAXONOMY_REGISTRY)) {
  console.error(`ERROR: no taxonomy registered for subject '${ONLY_SUBJECT}'. Known: ${Object.keys(TAXONOMY_REGISTRY).join(", ")}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = { id: number; subject_id: number; clean_question_text: string | null; display_question_text: string | null; question_text: string | null };

/** subject_id → subject code, for the subjects we have taxonomies for. */
async function resolveSubjectMap(): Promise<Map<number, string>> {
  const { data, error } = await supabase.from("subjects").select("id,code").in("code", SUBJECT_CODES);
  if (error) throw error;
  const map = new Map<number, string>();
  for (const r of data ?? []) map.set(r.id as number, r.code as string);
  if (map.size === 0) throw new Error(`No subjects found for codes: ${SUBJECT_CODES.join(", ")}`);
  console.log(`[classify] subjects:`, [...map.entries()].map(([id, code]) => `${code}=#${id}`).join(", "));
  return map;
}

async function fetchRows(subjectIds: number[]): Promise<Row[]> {
  const maxRows = LIMIT || 100_000;
  let rows: Row[] = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const take = Math.min(BATCH_SIZE, maxRows - rows.length);
    let q = supabase
      .from("question_index")
      .select("id,subject_id,clean_question_text,display_question_text,question_text")
      .in("subject_id", subjectIds)
      .not("clean_question_text", "is", null)
      .order("id", { ascending: true })
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
  console.log(`[classify] subjects=${SUBJECT_CODES.join(",")} force=${FORCE} dry-run=${DRY_RUN} limit=${LIMIT || "none"}`);
  const subjectMap = await resolveSubjectMap();
  const rows = await fetchRows([...subjectMap.keys()]);
  console.log(`[classify] ${rows.length} rows to process`);
  if (rows.length === 0) { console.log("[classify] Nothing to do."); return; }

  let classified = 0, review = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const code = subjectMap.get(row.subject_id)!;
    const text = (row.clean_question_text ?? row.display_question_text ?? row.question_text ?? "").trim();
    if (!text) { review++; continue; }

    let result: Awaited<ReturnType<typeof classifyQuestionTopicId>>;
    try {
      result = await classifyQuestionTopicId(text, code);
    } catch (err) {
      console.warn(`[classify] row ${row.id}: AI error — ${String(err)}`);
      const kwId = keywordClassifyTopicId(text, code);
      result = kwId ? { topic_id: kwId, confidence: 0.5, needs_review: true } : { topic_id: null, confidence: 0, needs_review: true };
    }

    const tag = result.topic_id ? `${result.topic_id} (${(result.confidence * 100).toFixed(0)}%)` : "null";
    console.log(`[classify] ${code} row ${row.id} [${i + 1}/${rows.length}] → ${tag}${result.needs_review ? " [needs_review]" : ""}`);

    if (!DRY_RUN && (result.topic_id || result.needs_review)) {
      const { error } = await supabase.from("question_index").update({
        taxonomy_topic_id: result.topic_id,
        taxonomy_confidence: result.confidence,
        needs_review: result.needs_review || undefined,
      }).eq("id", row.id);
      if (error) console.error(`[classify] row ${row.id} write error:`, error.message);
    }

    if (result.topic_id) classified++;
    else if (result.needs_review) review++;
  }

  console.log(`[classify] Done — classified: ${classified}, needs_review: ${review}`);
}

run().catch((err) => { console.error("[classify] Fatal:", err); process.exit(1); });
