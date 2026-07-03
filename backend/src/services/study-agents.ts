import type { SupabaseClient } from "@supabase/supabase-js";
import { createExamEngine } from "./exam-engine";

export function classifyQuestionType(text: string) {
  const value = text.toLowerCase();
  if (/\b(graph|plot|axes|gradient|curve)\b/.test(value)) return "graph-based";
  if (/\b(calculate|determine|work out|formula)\b/.test(value))
    return "calculation-based";
  if (/\b(diagram|draw|ray diagram|draw.*circuit|label)\b/.test(value))
    return "diagram-based";
  if (/\b(table|data|results)\b/.test(value)) return "data/table-based";
  if (/\b(experiment|practical|apparatus|investigate)\b/.test(value))
    return "practical/experimental";
  if (/\b(explain|why|describe)\b/.test(value)) return "explanation-based";
  if (/\b(define|what is meant)\b/.test(value)) return "definition-based";
  return "theory-based";
}

export class PaperAnalyzerAgent {
  constructor(private client: SupabaseClient) {}
  async analyze(resourceId: number) {
    const { data: resource, error } = await this.client
      .from("resources")
      .select(
        "id,subject_id,level,year,session,paper_code,paper_number,variant,original_filename,subjects(name,code)",
      )
      .eq("id", resourceId)
      .eq("resource_type", "PAST_PAPER")
      .single();
    if (error || !resource) throw error ?? new Error("Paper not found.");
    const subject = Array.isArray(resource.subjects)
      ? resource.subjects[0]
      : resource.subjects;
    const analysis = await createExamEngine(this.client).getTopicCountsForPaper(
      {
        subjectCode: String(subject?.code),
        year: Number(resource.year),
        session: String(resource.session),
        paperNumber: Number(resource.paper_number ?? resource.paper_code),
        variant: Number(resource.variant),
      },
    );
    const types: Record<
      string,
      { questions: number; marks: number; questionIds: number[] }
    > = {};
    for (const question of analysis.questions) {
      const type = classifyQuestionType(
        String(
          question.display_question_text ?? question.clean_question_text ?? "",
        ),
      );
      const value = types[type] ?? { questions: 0, marks: 0, questionIds: [] };
      value.questions += 1;
      value.marks += Number(question.total_marks ?? question.marks ?? 0);
      value.questionIds.push(Number(question.id));
      types[type] = value;
    }
    const highScoring = analysis.questions
      .slice()
      .sort(
        (a, b) =>
          Number(b.total_marks ?? b.marks ?? 0) -
          Number(a.total_marks ?? a.marks ?? 0),
      )
      .slice(0, 10)
      .map((q) => ({
        id: q.id,
        questionNumber: q.question_number,
        topic: q.topic,
        marks: q.total_marks ?? q.marks,
        difficulty: q.difficulty,
        markingSchemeLinked: [
          "linked",
          "partial",
          "linked_exact",
          "linked_partial",
        ].includes(q.marking_scheme_link_status),
      }));
    return {
      paper: {
        resourceId: resource.id,
        subjectId: resource.subject_id,
        subject: subject?.name,
        level: resource.level,
        syllabusCode: subject?.code,
        year: resource.year,
        session: resource.session,
        paperNumber: resource.paper_number ?? resource.paper_code,
        variant: resource.variant,
        paperCode: resource.original_filename,
      },
      ...analysis,
      questionTypes: types,
      highScoringQuestions: highScoring,
      weakInRecommendation: analysis.topics
        .slice()
        .sort((a, b) => b.questions - a.questions)
        .slice(0, 5)
        .map((t) => t.topic),
      warnings: [
        analysis.overview.completeness === "partial"
          ? `This paper is only partially indexed. Analysis is based on ${analysis.overview.verifiedQuestions} verified questions.`
          : null,
        analysis.overview.markingSchemeMissing
          ? `Only ${analysis.overview.markingSchemeLinked} of ${analysis.overview.totalIndexedQuestions} questions have linked marking scheme answers.`
          : null,
      ].filter(Boolean),
    };
  }
}

type RepeatedInput = {
  subjectId: number;
  level: string;
  syllabusCode: string;
  yearFrom: number;
  yearTo: number;
  paperNumber?: number;
  variant?: number;
  session?: string;
};
export class RepeatedTopicsAgent {
  constructor(private client: SupabaseClient) {}
  async calculate(input: RepeatedInput) {
    let query = this.client
      .from("question_index")
      .select(
        "id,topic,subtopic,year,session,paper_code,variant,marks,total_marks,difficulty,marking_scheme_answers(marks)",
      )
      .eq("subject_id", input.subjectId)
      .eq("student_verified", true)
      .eq("needs_review", false)
      .gte("year", input.yearFrom)
      .lte("year", input.yearTo);
    if (input.paperNumber)
      query = query.eq("paper_code", String(input.paperNumber));
    if (input.variant) query = query.eq("variant", input.variant);
    if (input.session) query = query.eq("session", input.session);
    const { data, error } = await query.limit(5000);
    if (error) throw error;
    const rows = data ?? [],
      yearsInRange = Math.max(1, input.yearTo - input.yearFrom + 1);
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
      const key = String(row.topic || "Unclassified");
      const group = grouped.get(key) ?? [];
      group.push(row);
      grouped.set(key, group);
    }
    const topics = [...grouped.entries()]
      .map(([topic, items]) => {
        const years = [...new Set(items.map((x) => Number(x.year)))].sort(),
          sessions = [...new Set(items.map((x) => String(x.session)))];
        const marks = items.reduce(
          (sum, x) =>
            sum +
            Number(
              x.total_marks ??
                x.marks ??
                (
                  (Array.isArray(x.marking_scheme_answers)
                    ? x.marking_scheme_answers[0]
                    : x.marking_scheme_answers) as any
                )?.marks ??
                0,
            ),
          0,
        );
        const byYear = new Map<number, number>();
        for (const x of items)
          byYear.set(Number(x.year), (byYear.get(Number(x.year)) ?? 0) + 1);
        const recent = byYear.get(input.yearTo) ?? 0,
          older = byYear.get(input.yearFrom) ?? 0;
        const frequency = Math.min(40, items.length * 4),
          marksScore = Math.min(20, marks),
          recency = Math.min(20, recent * 5),
          spread = Math.min(15, (years.length / yearsInRange) * 15),
          paperRelevance = input.paperNumber ? 5 : 3;
        const score =
          Math.round(
            (frequency + marksScore + recency + spread + paperRelevance) * 10,
          ) / 10;
        const difficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
        for (const x of items)
          if (x.difficulty in difficulty)
            difficulty[x.difficulty as keyof typeof difficulty]++;
        return {
          topic,
          subtopics: [...new Set(items.map((x) => x.subtopic).filter(Boolean))],
          questionCount: items.length,
          totalMarks: marks,
          yearsAppeared: years,
          sessionsAppeared: sessions,
          papersAppeared: [...new Set(items.map((x) => String(x.paper_code)))],
          difficulty,
          predictionScore: score,
          predictionLabel:
            score >= 70
              ? "High chance"
              : score >= 40
                ? "Medium chance"
                : "Low chance",
          trend:
            recent > older
              ? "increasing"
              : recent < older
                ? "decreasing"
                : "stable",
          sourceQuestionIds: items.map((x) => x.id),
          scoreExplanation: {
            frequency,
            marksWeightage: marksScore,
            recency,
            spread,
            paperRelevance,
          },
        };
      })
      .sort((a, b) => b.predictionScore - a.predictionScore)
      .map((x, index) => ({ rank: index + 1, ...x }));
    return {
      filters: input,
      indexedQuestions: rows.length,
      indexedYears: [...new Set(rows.map((x) => x.year))],
      reliable: new Set(rows.map((x) => x.year)).size >= 3,
      warning:
        "Prediction is based on past-paper patterns and is not guaranteed.",
      topics,
    };
  }
}

type PlannerInput = {
  subjectId: number;
  level: string;
  syllabusCode: string;
  currentGrade?: string;
  targetGrade: string;
  examDate: string;
  hoursPerDay: number;
  planLengthDays: 7 | 14 | 30 | 90;
  weakTopics: string[];
  preferredStyle?: string;
};
export class RevisionPlannerAgent {
  constructor(private client: SupabaseClient) {}
  async generate(input: PlannerInput, userId: string) {
    const today = new Date(),
      exam = new Date(`${input.examDate}T00:00:00Z`),
      daysUntil = Math.max(
        0,
        Math.ceil((exam.getTime() - today.getTime()) / 86400000),
      );
    const startYear = new Date().getUTCFullYear() - 4;
    const repeated = await new RepeatedTopicsAgent(this.client).calculate({
      subjectId: input.subjectId,
      level: input.level,
      syllabusCode: input.syllabusCode,
      yearFrom: startYear,
      yearTo: new Date().getUTCFullYear(),
    });
    const priorities = [
      ...new Set([
        ...input.weakTopics,
        ...repeated.topics.slice(0, 6).map((x) => x.topic),
      ]),
    ];
    const minutes = Math.round(input.hoursPerDay * 60),
      revision = Math.round(minutes * 0.4),
      practice = Math.round(minutes * 0.4),
      review = minutes - revision - practice;
    const days = Array.from({ length: input.planLengthDays }, (_, index) => {
      const topic =
        priorities[index % Math.max(1, priorities.length)] ?? "Mixed revision";
      const related = repeated.topics.find((x) => x.topic === topic);
      return {
        day: index + 1,
        date: new Date(today.getTime() + index * 86400000)
          .toISOString()
          .slice(0, 10),
        topic,
        tasks: [
          {
            type: "revise",
            minutes: revision,
            task: `Revise core ${topic} concepts and examples.`,
          },
          {
            type: "past_paper",
            minutes: practice,
            task: `Solve ${Math.max(3, Math.round(practice / 8))} verified ${topic} past-paper questions.`,
            questionIds: related?.sourceQuestionIds.slice(0, 10) ?? [],
          },
          {
            type: "mark_scheme",
            minutes: review,
            task: "Check every answer against the marking scheme and record mistakes.",
          },
        ],
        miniTest: index % 3 === 2,
        estimatedMinutes: minutes,
      };
    });
    const plan = {
      summary: {
        daysUntilExam: daysUntil,
        targetGrade: input.targetGrade,
        dailyMinutes: minutes,
        priorityTopics: priorities.slice(0, 8),
        riskTopics: input.weakTopics,
        planType: `${input.planLengthDays}-day ${input.planLengthDays <= 7 ? "crash" : input.planLengthDays <= 14 ? "focused" : input.planLengthDays <= 30 ? "balanced" : "full preparation"} plan`,
        preferredStyle: input.preferredStyle ?? null,
      },
      days,
    };
    const { data, error } = await this.client
      .from("revision_plans")
      .insert({
        user_id: userId,
        subject_id: input.subjectId,
        level: input.level,
        syllabus_code: input.syllabusCode,
        current_grade: input.currentGrade ?? null,
        target_grade: input.targetGrade,
        exam_date: input.examDate,
        hours_per_day: input.hoursPerDay,
        plan_length_days: input.planLengthDays,
        weak_topics: input.weakTopics,
        plan_json: plan,
      })
      .select("id,created_at")
      .single();
    if (error) throw error;
    return { id: data.id, createdAt: data.created_at, ...plan };
  }
}
