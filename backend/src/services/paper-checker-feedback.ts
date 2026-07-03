import type { SupabaseClient } from "@supabase/supabase-js";

export type PerformanceResult = {
  id: number;
  topic?: string | null;
  subtopic?: string | null;
  maxMarks: number;
  awardedMarks: number | null;
  mistakeType?: string | null;
  feedback?: string;
  confidence?: number;
};

export async function recordPaperCheckerPerformance(
  client: SupabaseClient,
  input: {
    userId: string;
    subjectId: number;
    submissionId: string;
    results: PerformanceResult[];
  },
) {
  const markable = input.results.filter((row) => row.awardedMarks !== null);
  if (!markable.length) return { events: 0, topics: 0 };

  const events = markable.map((row) => ({
    user_id: input.userId,
    subject_id: input.subjectId,
    question_id: row.id,
    submission_id: input.submissionId,
    event_type: "paper_checker",
    topic: row.topic ?? null,
    subtopic: row.subtopic ?? null,
    marks_available: row.maxMarks,
    marks_scored: row.awardedMarks,
    mistake_type: row.mistakeType ?? null,
    feedback_json: {
      feedback: row.feedback ?? null,
      confidence: row.confidence ?? null,
    },
  }));
  const { error: eventError } = await client
    .from("student_performance_events")
    .insert(events);
  if (eventError) throw eventError;

  const grouped = new Map<string, { topic: string; subtopic: string; scored: number; available: number; attempts: number; correct: number }>();
  for (const row of markable) {
    const topic = row.topic?.trim() || "Unclassified";
    const subtopic = row.subtopic?.trim() || "";
    const key = `${topic}\u0000${subtopic}`;
    const value = grouped.get(key) ?? { topic, subtopic, scored: 0, available: 0, attempts: 0, correct: 0 };
    value.scored += Number(row.awardedMarks);
    value.available += Math.max(0, Number(row.maxMarks));
    value.attempts += 1;
    value.correct += Number(row.awardedMarks) >= Number(row.maxMarks) && row.maxMarks > 0 ? 1 : 0;
    grouped.set(key, value);
  }
  for (const value of grouped.values()) {
    const mastery = value.available ? Number((value.scored / value.available * 100).toFixed(2)) : 0;
    const { data: current } = await client.from("student_topic_progress")
      .select("attempted_count,correct_count")
      .eq("user_id", input.userId).eq("subject_id", input.subjectId)
      .eq("topic", value.topic).eq("subtopic", value.subtopic).maybeSingle();
    const { error } = await client.from("student_topic_progress").upsert({
      user_id: input.userId,
      subject_id: input.subjectId,
      topic: value.topic,
      subtopic: value.subtopic,
      attempted_count: Number(current?.attempted_count ?? 0) + value.attempts,
      correct_count: Number(current?.correct_count ?? 0) + value.correct,
      mastery_score: mastery,
      last_studied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,subject_id,topic,subtopic" });
    if (error) throw error;
  }
  await client.from("student_learning_profile").upsert({
    user_id: input.userId,
    last_subject_id: input.subjectId,
    last_studied_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  return { events: events.length, topics: grouped.size };
}

