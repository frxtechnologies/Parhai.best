/**
 * Retrieval precision evaluation (Phase 2, F19 measurement).
 *
 * Runs the REAL topic-filtered semantic retrieval (match_questions) for every
 * golden case and measures how on-topic the top-k results are:
 *   - precision@3 / precision@5 : fraction of top-k questions whose
 *     taxonomy_topic_id matches the case's expected topic
 *   - MRR : reciprocal rank of the first on-topic result
 *
 * This is an HONEST retrieval-quality metric that F18 (topic-filtered vector
 * search) and F19 (reranker) are designed to move. It is NOT gold-source hit@k
 * (that needs per-query curated answer ids); it measures topic precision, which
 * the golden set already encodes. Results persist to retrieval_eval_run
 * (hit_at_3 / hit_at_5 / mrr).
 *
 * Usage:
 *   npx tsx src/scripts/run-retrieval-precision-eval.ts
 *   npx tsx src/scripts/run-retrieval-precision-eval.ts --subject 0625 --label "post-f19"
 *   npx tsx src/scripts/run-retrieval-precision-eval.ts --dry-run
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and an AI provider key.
 */

import { createClient } from "@supabase/supabase-js";
import { generateQueryEmbedding, isAiConfigured } from "../lib/ai-service";
import { classifyQueryTopicId, keywordClassifyTopicId, parentTopicId } from "../services/physics-taxonomy-classifier";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const argVal = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
const SUBJECT = argVal("--subject") ?? "0625";
const LABEL = argVal("--label") ?? `precision-${new Date().toISOString().slice(0, 19)}`;
const K_MAX = 5;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
if (!isAiConfigured()) {
  console.error("ERROR: no AI provider key configured (need embeddings).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Case = { id: number; query_text: string; expected_topic_id: string | null };

async function subjectId(): Promise<number | null> {
  const { data } = await supabase.from("subjects").select("id").eq("code", SUBJECT).limit(1).maybeSingle();
  return (data?.id as number) ?? null;
}

async function resolveTopic(query: string): Promise<string | null> {
  return (await classifyQueryTopicId(query).catch(() => null)) ?? keywordClassifyTopicId(query);
}

async function run() {
  console.log(`[precision] subject=${SUBJECT} label="${LABEL}" dry-run=${DRY_RUN}`);
  const subId = await subjectId();
  if (!subId) { console.error(`[precision] subject ${SUBJECT} not found.`); return; }

  const { data: cases, error } = await supabase
    .from("retrieval_eval_case")
    .select("id,query_text,expected_topic_id")
    .eq("subject_code", SUBJECT)
    .eq("active", true);
  if (error) throw error;
  const rows = (cases ?? []) as Case[];
  if (rows.length === 0) { console.log("[precision] No active eval cases."); return; }

  let sumP3 = 0, sumP5 = 0, sumRR = 0, scored = 0;

  for (const c of rows) {
    if (!c.expected_topic_id) continue;
    const resolved = await resolveTopic(c.query_text);
    const embedding = await generateQueryEmbedding(c.query_text);
    const matchTopicId = resolved && resolved === c.expected_topic_id ? resolved : null;
    const matchPrefix = resolved && resolved !== c.expected_topic_id ? `${parentTopicId(resolved)}.%` : null;

    const { data: hits, error: rpcErr } = await supabase.rpc("match_questions", {
      query_embedding: `[${embedding.join(",")}]`,
      match_subject_id: subId,
      match_count: K_MAX,
      match_threshold: 0.15,
      match_taxonomy_topic_id: matchTopicId,
      match_taxonomy_prefix: matchPrefix,
    });
    if (rpcErr) { console.warn(`[precision] case ${c.id} rpc error: ${rpcErr.message}`); continue; }

    const topics = (hits ?? []).map((h: { taxonomy_topic_id: string | null }) => h.taxonomy_topic_id);
    const onTopic = (t: string | null) => t === c.expected_topic_id;
    const p3 = topics.slice(0, 3).filter(onTopic).length / 3;
    const p5 = topics.slice(0, 5).filter(onTopic).length / 5;
    const firstHit = topics.findIndex(onTopic);
    const rr = firstHit === -1 ? 0 : 1 / (firstHit + 1);

    sumP3 += p3; sumP5 += p5; sumRR += rr; scored++;
    console.log(`  ${onTopic(topics[0] ?? null) ? "✓" : "·"} P@3=${p3.toFixed(2)} P@5=${p5.toFixed(2)} RR=${rr.toFixed(2)}  (${topics.length} hits)  ${c.query_text.slice(0, 48)}`);
  }

  if (scored === 0) {
    console.log("\n[precision] No cases scored — are question_index embeddings backfilled? Run embed-question-index first.");
    return;
  }

  const p3 = sumP3 / scored, p5 = sumP5 / scored, mrr = sumRR / scored;
  console.log(`\n[precision] ─────────────────────────────────`);
  console.log(`[precision] precision@3 = ${(p3 * 100).toFixed(1)}%`);
  console.log(`[precision] precision@5 = ${(p5 * 100).toFixed(1)}%`);
  console.log(`[precision] MRR         = ${mrr.toFixed(3)}   (${scored} cases)`);

  if (!DRY_RUN) {
    const { error: writeErr } = await supabase.from("retrieval_eval_run").insert({
      run_label: LABEL,
      subject_code: SUBJECT,
      total_cases: scored,
      topic_accuracy: null,
      hit_at_3: p3,
      hit_at_5: p5,
      mrr,
      config: { metric: "topic_precision@k", threshold: 0.15, provider: process.env.AI_PROVIDER ?? "gemini" },
    });
    if (writeErr) console.error("[precision] persist error:", writeErr.message);
    else console.log(`\n[precision] Run "${LABEL}" saved.`);
  }
}

run().catch((err) => { console.error("[precision] Fatal:", err); process.exit(1); });
