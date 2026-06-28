import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";
import { generateScreenshotsForResource } from "../services/question-screenshots";

if (process.env.ENABLE_QUESTION_SCREENSHOTS !== "true") {
  throw new Error("Set ENABLE_QUESTION_SCREENSHOTS=true before running this command.");
}

const requestedId = Number(process.argv[2]);
let resourceId = Number.isInteger(requestedId) && requestedId > 0 ? requestedId : null;

if (!resourceId) {
  const { data: subject, error: subjectError } = await supabaseAdmin.from("subjects").select("id").eq("code", "5054").limit(1).maybeSingle();
  if (subjectError) throw subjectError;
  if (subject) {
    const { data, error } = await supabaseAdmin.from("resources")
      .select("id,question_index!inner(id,screenshot_status)")
      .eq("resource_type", "PAST_PAPER").eq("subject_id", subject.id)
      .in("question_index.screenshot_status", ["pending", "failed", "not_generated"])
      .limit(1).maybeSingle();
    if (error) throw error;
    resourceId = data?.id ?? null;
  }
}

if (!resourceId) {
  console.log("No Physics 5054 paper with missing screenshots was found.");
} else {
  console.log(`Generating screenshots for resource ${resourceId}...`);
  console.log(await generateScreenshotsForResource(supabaseAdmin, resourceId));
}
