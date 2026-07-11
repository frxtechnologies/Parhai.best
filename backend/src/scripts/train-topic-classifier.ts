/**
 * Train the Parhai-owned local topic classifier (Phase E).
 *
 * Labels: taxonomy_topic_id where the AI teacher has classified a question,
 * otherwise a deterministic keyword bootstrap — so a useful model exists NOW and
 * sharpens as more AI labels accrue. Trains a pure-TS Naive Bayes model, reports
 * holdout accuracy, and writes the model artifact to disk (no API at inference).
 *
 * Usage:  npx tsx src/scripts/train-topic-classifier.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (no AI key needed).
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { TopicClassifierModel, type TrainingLabel } from "../services/topic-classifier-model";
import { keywordClassifyTopicId } from "../services/taxonomy-classifier";
import { getSubjectTaxonomy, TAXONOMY_REGISTRY } from "../data/taxonomy-registry";
import { MODEL_PATH } from "../services/local-topic-classifier";
import { registerAndGate } from "../services/model-registry";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

type Labeled = { text: string; topicId: string; subjectCode: string };

/** Deterministic shuffle (mulberry32) so runs are reproducible. */
function shuffle<T>(arr: T[], seed = 42): T[] {
  let s = seed;
  const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

async function collectLabels(): Promise<{ labels: Labeled[]; fromAi: number; fromKeyword: number }> {
  const { data: subjects, error } = await supabase.from("subjects").select("id,code").in("code", Object.keys(TAXONOMY_REGISTRY));
  if (error) throw error;
  const codeById = new Map<number, string>((subjects ?? []).map((s) => [s.id as number, s.code as string]));
  const subjectIds = [...codeById.keys()];

  const labels: Labeled[] = [];
  let fromAi = 0, fromKeyword = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error: qErr } = await supabase
      .from("question_index")
      .select("clean_question_text,taxonomy_topic_id,subject_id")
      .in("subject_id", subjectIds)
      .in("text_quality_status", ["good", "acceptable"])
      .not("clean_question_text", "is", null)
      .range(offset, offset + 999);
    if (qErr) throw qErr;
    const rows = data ?? [];
    for (const r of rows) {
      const code = codeById.get(r.subject_id as number);
      const text = (r.clean_question_text as string | null) ?? "";
      if (!code || !text.trim()) continue;
      let topicId = r.taxonomy_topic_id as string | null;
      if (topicId) fromAi++;
      else { topicId = keywordClassifyTopicId(text, code); if (topicId) fromKeyword++; }
      if (topicId) labels.push({ text, topicId, subjectCode: code });
    }
    if (rows.length < 1000) break;
  }
  return { labels, fromAi, fromKeyword };
}

async function run() {
  console.log("[train] collecting labels...");
  const { labels, fromAi, fromKeyword } = await collectLabels();
  console.log(`[train] ${labels.length} labeled questions (${fromAi} AI, ${fromKeyword} keyword-bootstrap)`);
  if (labels.length < 30) { console.error("[train] Not enough labeled data to train (need >= 30)."); return; }

  const shuffled = shuffle(labels);
  const split = Math.floor(shuffled.length * 0.85);
  const trainSet = shuffled.slice(0, split);
  const testSet = shuffled.slice(split);

  const model = new TopicClassifierModel();
  model.train(trainSet.map<TrainingLabel>((l) => ({ text: l.text, topicId: l.topicId })));

  // Holdout accuracy, masked to each question's subject.
  let correct = 0;
  for (const t of testSet) {
    const allowed = (getSubjectTaxonomy(t.subjectCode)?.topics ?? []).filter((x) => x.level === 2).map((x) => x.id);
    if (model.predict(t.text, allowed).topicId === t.topicId) correct++;
  }
  const accuracy = testSet.length ? correct / testSet.length : 0;

  const serialized = model.toJSON();
  const artifact = JSON.stringify(serialized);
  const version = `nb-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  const metrics = { accuracy: Math.round(accuracy * 1000) / 1000, classes: serialized.classes.length, vocab: serialized.vocabSize, testSize: testSet.length };

  console.log(`[train] ─────────────────────────────────────────`);
  console.log(`[train] train=${trainSet.length}  test=${testSet.length}  classes=${serialized.classes.length}  vocab=${serialized.vocabSize}`);
  console.log(`[train] holdout accuracy = ${(accuracy * 100).toFixed(1)}%`);

  // Eval gate + registry (Phase F). If the registry table isn't applied yet, deploy locally anyway.
  const gate = await registerAndGate(supabase, { modelKey: "topic-classifier", version, metrics, artifact, trainSize: trainSet.length });
  const deploy = !gate.ok || gate.promoted;
  if (gate.ok) console.log(`[train] gate: ${gate.promoted ? "✅ PROMOTED" : "⛔ REJECTED"} — ${gate.reason}`);
  else console.log(`[train] gate: registry unavailable (${gate.reason}) — deploying locally`);

  if (deploy) {
    fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
    fs.writeFileSync(MODEL_PATH, artifact);
    console.log(`[train] model ${version} saved → ${MODEL_PATH} (${(fs.statSync(MODEL_PATH).size / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`[train] candidate rejected by the gate — active model on disk left unchanged.`);
  }
}

run().catch((err) => { console.error("[train] Fatal:", err); process.exit(1); });
