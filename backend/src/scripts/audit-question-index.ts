import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";

async function count(apply: (query: any) => any) {
  const query = apply(supabaseAdmin.from("question_index").select("id", { count: "exact", head: true }));
  const { count: value, error } = await query;
  if (error) throw error;
  return value ?? 0;
}

const report = {
  generatedAt: new Date().toISOString(),
  totalQuestions: await count((query) => query),
  missingCleanText: await count((query) => query.or("clean_question_text.is.null,clean_question_text.eq.")),
  missingTopic: await count((query) => query.or("topic.is.null,topic.eq.,topic.ilike.Unclassified")),
  lowConfidence: await count((query) => query.or("confidence.is.null,confidence.lt.0.7")),
  needsReview: await count((query) => query.eq("needs_review", true)),
  missingSourcePage: await count((query) => query.is("source_page", null)),
  screenshotMissingOrFailed: await count((query) => query.in("screenshot_status", ["pending", "not_generated", "failed", "failed_page_match"])),
  markingSchemeLinked: await count((query) => query.not("answer_text", "is", null)),
  weakText: await count((query) => query.in("text_quality_status", ["needs_review", "rejected"])),
};

console.log(JSON.stringify(report, null, 2));
