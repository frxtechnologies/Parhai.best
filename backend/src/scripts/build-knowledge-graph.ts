/**
 * Build the knowledge graph (Phase C) — related-question edges for taxonomy subjects.
 * Idempotent (edges upsert). Reuses stored question embeddings, so NO AI cost.
 *
 * Usage:
 *   npx tsx src/scripts/build-knowledge-graph.ts
 *   npx tsx src/scripts/build-knowledge-graph.ts --subject 0625 --neighbours 8 --threshold 0.55
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { buildRelatedQuestionEdges } from "../services/knowledge-graph";
import { TAXONOMY_REGISTRY } from "../data/taxonomy-registry";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const argVal = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
const ONLY_SUBJECT = argVal("--subject");
const neighbours = Number(argVal("--neighbours") ?? 6);
const threshold = Number(argVal("--threshold") ?? 0.5);
const limit = Number(argVal("--limit") ?? 0) || undefined;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  const codes = ONLY_SUBJECT ? [ONLY_SUBJECT] : Object.keys(TAXONOMY_REGISTRY);
  const { data: subjects, error } = await supabase.from("subjects").select("id,code,name").in("code", codes);
  if (error) throw error;
  if (!subjects?.length) { console.error(`No subjects found for: ${codes.join(", ")}`); return; }

  for (const s of subjects) {
    console.log(`[graph] building related-question edges for ${s.code} (${s.name})...`);
    const written = await buildRelatedQuestionEdges(supabase, s.id as number, { neighbours, threshold, limit });
    console.log(`[graph]   ${written} edges written for ${s.code}`);
  }
  console.log("[graph] Done.");
}

run().catch((err) => { console.error("[graph] Fatal:", err); process.exit(1); });
