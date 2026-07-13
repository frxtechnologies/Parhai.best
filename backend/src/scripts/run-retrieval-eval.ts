/**
 * Offline retrieval evaluation for the physics taxonomy.
 *
 * Measures how accurately the query classifier maps a natural-language question
 * to the correct taxonomy topic — the single metric that determines whether
 * topic-first retrieval sends the vector search to the right slice of the corpus.
 *
 * Usage:
 *   npx tsx src/scripts/run-retrieval-eval.ts
 *   npx tsx src/scripts/run-retrieval-eval.ts --subject 0625 --label "post-threshold-tune"
 *   npx tsx src/scripts/run-retrieval-eval.ts --dry-run          # don't persist the run
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and one AI provider key.
 *
 * NOTE: hit@k / MRR are reserved (recorded as null). Those need the full live
 * retrieval stack against an indexed corpus and will be added as a second pass —
 * this script deliberately does not fabricate them.
 */

import { createClient } from "@supabase/supabase-js";
import { classifyQueryTopicId, keywordClassifyTopicId } from "../services/taxonomy-classifier";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const arg = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1]! : fallback;
};
const SUBJECT = arg("--subject", "0625");
const LABEL = arg("--label", `eval-${new Date().toISOString().slice(0, 19)}`);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Case = { id: number; query_text: string; expected_topic_id: string | null };

/** Mirror the live query-time resolution: local model / API teacher, then keyword fallback. */
async function resolveTopic(query: string): Promise<{ topicId: string | null; method: "local" | "api" | "keyword" | "none" }> {
  const classified = await classifyQueryTopicId(query, SUBJECT).catch(() => ({ topicId: null, method: "none" as const }));
  if (classified.topicId) return classified;
  const kw = keywordClassifyTopicId(query, SUBJECT);
  if (kw) return { topicId: kw, method: "keyword" };
  return { topicId: null, method: "none" };
}

async function run() {
  console.log(`[eval] subject=${SUBJECT} label="${LABEL}" dry-run=${DRY_RUN}`);

  const { data: cases, error } = await supabase
    .from("retrieval_eval_case")
    .select("id,query_text,expected_topic_id")
    .eq("subject_code", SUBJECT)
    .eq("active", true);
  if (error) throw error;
  if (!cases || cases.length === 0) { console.log("[eval] No active eval cases found."); return; }

  let correct = 0;
  const methodCounts: Record<string, number> = { local: 0, api: 0, keyword: 0, none: 0 };
  const failures: Array<{ query: string; expected: string | null; got: string | null; method: string }> = [];

  console.log(`\n[eval] Running ${cases.length} cases...\n`);
  for (const c of cases as Case[]) {
    const { topicId, method } = await resolveTopic(c.query_text);
    methodCounts[method] = (methodCounts[method] ?? 0) + 1;
    const ok = topicId === c.expected_topic_id;
    if (ok) correct++;
    else failures.push({ query: c.query_text, expected: c.expected_topic_id, got: topicId, method });
    console.log(`  ${ok ? "✓" : "✗"} [${method}] ${topicId ?? "null"}  ← ${c.query_text.slice(0, 60)}`);
  }

  const topicAccuracy = correct / cases.length;
  console.log(`\n[eval] ─────────────────────────────────────────`);
  console.log(`[eval] Topic accuracy: ${(topicAccuracy * 100).toFixed(1)}%  (${correct}/${cases.length})`);
  console.log(`[eval] Resolution method: local=${methodCounts.local} api=${methodCounts.api} keyword=${methodCounts.keyword} none=${methodCounts.none}`);
  if (failures.length) {
    console.log(`\n[eval] Misses:`);
    for (const f of failures) console.log(`  expected ${f.expected}  got ${f.got ?? "null"} [${f.method}]  — "${f.query.slice(0, 55)}"`);
  }

  if (!DRY_RUN) {
    const { error: writeErr } = await supabase.from("retrieval_eval_run").insert({
      run_label: LABEL,
      subject_code: SUBJECT,
      total_cases: cases.length,
      topic_accuracy: topicAccuracy,
      hit_at_3: null,
      hit_at_5: null,
      mrr: null,
      config: {
        threshold: Number(process.env.TAXONOMY_CONFIDENCE_THRESHOLD ?? "0.75"),
        provider: process.env.AI_PROVIDER ?? "gemini",
        method_counts: methodCounts,
      },
    });
    if (writeErr) console.error("[eval] Could not persist run:", writeErr.message);
    else console.log(`\n[eval] Run "${LABEL}" saved.`);
  }
}

run().catch((err) => {
  console.error("[eval] Fatal:", err);
  process.exit(1);
});
