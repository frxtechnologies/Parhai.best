import { generateAiAnswer, isAiConfigured } from "../lib/ai-service";

/**
 * Revision planner.
 *
 * The timetable itself is produced by a deterministic scheduling engine — the
 * LLM is never asked to compute dates, durations, or the schedule, so the plan
 * can never hallucinate a wrong exam countdown or an impossible day. An LLM is
 * used only, and optionally, to add qualitative study guidance on top of the
 * computed schedule. This means the core feature works with no AI key at all.
 */

export type PreparationLevel = "beginner" | "intermediate" | "advanced";

export interface RevisionPlanInput {
  examDate: string; // ISO date (YYYY-MM-DD) of the target exam
  subjects: string[];
  weakTopics?: string[];
  hoursPerDay?: number; // available study hours per day (default 2)
  studyDaysPerWeek?: number; // 1-7, default 6 (one rest day per week)
  preparationLevel?: PreparationLevel; // default "intermediate"
}

export type RevisionActivity = "learn" | "practice" | "review" | "mock_paper";
export type RevisionPhase = "foundation" | "practice" | "final_review";

export interface RevisionSession {
  subject: string;
  focus: string;
  activity: RevisionActivity;
  minutes: number;
}

export interface RevisionDay {
  date: string;
  label: string;
  phase: RevisionPhase;
  isRestDay: boolean;
  sessions: RevisionSession[];
  totalMinutes: number;
}

export interface RevisionPlan {
  examDate: string;
  daysUntilExam: number;
  totalDays: number;
  studyDays: number;
  subjects: string[];
  weakTopics: string[];
  days: RevisionDay[];
  summary: string;
  aiGuidance?: string;
}

const DAY_MS = 86_400_000;
const MAX_HORIZON_DAYS = 90; // keep plans a manageable size for far-off exams
const SESSION_MINUTES = 50; // target length of a single focused study block
const MIN_TRAILING_SESSION = 20; // only add a final short block if it is worthwhile

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDayLabel(date: Date, index: number): string {
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(date);
  const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  return `Day ${index + 1} · ${weekday} ${day}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Split a day's available minutes into focused study blocks. */
function sessionMinutesFor(totalMinutes: number): number[] {
  const blocks: number[] = [];
  let remaining = totalMinutes;
  while (remaining >= SESSION_MINUTES) {
    blocks.push(SESSION_MINUTES);
    remaining -= SESSION_MINUTES;
  }
  if (remaining >= MIN_TRAILING_SESSION) blocks.push(remaining);
  else if (blocks.length === 0) blocks.push(totalMinutes); // very short day still gets one block
  return blocks;
}

/**
 * Build a day-by-day revision timetable from today until the day before the
 * exam. Deterministic: the same input and `now` always yield the same plan.
 */
export function buildRevisionPlan(input: RevisionPlanInput, now: Date = new Date()): RevisionPlan {
  const subjects = input.subjects.map((s) => s.trim()).filter(Boolean);
  if (subjects.length === 0) throw new Error("Add at least one subject to plan revision.");

  const weakTopics = (input.weakTopics ?? []).map((t) => t.trim()).filter(Boolean);
  const hoursPerDay = Math.min(Math.max(input.hoursPerDay ?? 2, 0.5), 12);
  const studyDaysPerWeek = Math.min(Math.max(Math.round(input.studyDaysPerWeek ?? 6), 1), 7);
  const level = input.preparationLevel ?? "intermediate";

  const today = startOfUtcDay(now);
  const exam = startOfUtcDay(new Date(`${input.examDate}T00:00:00Z`));
  if (Number.isNaN(exam.getTime())) throw new Error("Enter a valid exam date.");

  const daysUntilExam = Math.round((exam.getTime() - today.getTime()) / DAY_MS);
  if (daysUntilExam <= 0) throw new Error("The exam date must be in the future.");

  // Plan window: today up to (but not including) exam day, capped at the horizon.
  const totalDays = Math.min(daysUntilExam, MAX_HORIZON_DAYS);
  const planStart = daysUntilExam > MAX_HORIZON_DAYS ? addDays(exam, -MAX_HORIZON_DAYS) : today;

  // A rest day falls on the last day of each rolling week when the student
  // studies fewer than 7 days a week (spreads recovery evenly).
  const restEveryNth = studyDaysPerWeek < 7 ? 7 : 0;
  const restOffset = 7 - (7 - studyDaysPerWeek); // rest on the final studied slot of the week

  // First pass: mark which calendar days are study days so phases divide evenly.
  const restFlags: boolean[] = [];
  for (let i = 0; i < totalDays; i += 1) {
    restFlags.push(restEveryNth > 0 && i % restEveryNth === restOffset % restEveryNth ? true : false);
  }
  const studyDayCount = restFlags.filter((r) => !r).length;
  const foundationEnd = Math.floor(studyDayCount * 0.5);
  const practiceEnd = Math.floor(studyDayCount * 0.85);

  const mockPapersPerLevel: Record<PreparationLevel, number> = { beginner: 1, intermediate: 2, advanced: 3 };

  const days: RevisionDay[] = [];
  let studyCounter = 0;
  let subjectPointer = 0;
  let weakPointer = 0;

  const nextSubject = () => {
    const subject = subjects[subjectPointer % subjects.length]!;
    subjectPointer += 1;
    return subject;
  };
  const nextWeakFocus = (fallback: string) => {
    if (weakTopics.length === 0) return fallback;
    const topic = weakTopics[weakPointer % weakTopics.length]!;
    weakPointer += 1;
    return topic;
  };

  for (let i = 0; i < totalDays; i += 1) {
    const date = addDays(planStart, i);
    const isRestDay = restFlags[i]!;

    if (isRestDay) {
      days.push({ date: isoDate(date), label: formatDayLabel(date, i), phase: "foundation", isRestDay: true, sessions: [], totalMinutes: 0 });
      continue;
    }

    const phase: RevisionPhase = studyCounter < foundationEnd ? "foundation" : studyCounter < practiceEnd ? "practice" : "final_review";
    studyCounter += 1;

    const blocks = sessionMinutesFor(Math.round(hoursPerDay * 60));
    const sessions: RevisionSession[] = blocks.map((minutes, blockIndex) => {
      const subject = nextSubject();
      if (phase === "foundation") {
        const focus = blockIndex % 2 === 0 ? nextWeakFocus("Core concepts and definitions") : "Consolidate today's topic";
        return { subject, focus, activity: blockIndex % 2 === 0 ? "learn" : "practice", minutes };
      }
      if (phase === "practice") {
        const focus = blockIndex % 2 === 0 ? nextWeakFocus("Topical past-paper questions") : "Timed topical questions";
        return { subject, focus, activity: "practice", minutes };
      }
      // final_review: alternate full mock papers with targeted review of weak areas
      const doMock = blockIndex < mockPapersPerLevel[level];
      return doMock
        ? { subject, focus: "Full past paper under timed conditions", activity: "mock_paper", minutes }
        : { subject, focus: nextWeakFocus("Review mistakes and mark schemes"), activity: "review", minutes };
    });

    days.push({
      date: isoDate(date),
      label: formatDayLabel(date, i),
      phase,
      isRestDay: false,
      sessions,
      totalMinutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
    });
  }

  const summary = buildSummary({ daysUntilExam, totalDays, studyDays: studyDayCount, subjects, weakTopics, hoursPerDay, capped: daysUntilExam > MAX_HORIZON_DAYS });

  return {
    examDate: isoDate(exam),
    daysUntilExam,
    totalDays,
    studyDays: studyDayCount,
    subjects,
    weakTopics,
    days,
    summary,
  };
}

function buildSummary(args: {
  daysUntilExam: number;
  totalDays: number;
  studyDays: number;
  subjects: string[];
  weakTopics: string[];
  hoursPerDay: number;
  capped: boolean;
}): string {
  const weekly = Math.round(args.studyDays * args.hoursPerDay);
  const parts = [
    `${args.daysUntilExam} days until your exam.`,
    `This plan schedules ${args.studyDays} study days across ${args.subjects.length} subject${args.subjects.length === 1 ? "" : "s"} at ${args.hoursPerDay}h/day (~${weekly}h total).`,
  ];
  if (args.weakTopics.length > 0) parts.push(`Weak topics (${args.weakTopics.join(", ")}) are prioritised in the foundation and practice phases.`);
  parts.push("The final phase focuses on full past papers and reviewing mistakes.");
  if (args.capped) parts.push(`Your exam is far away, so the plan shows the ${MAX_HORIZON_DAYS} days leading up to it.`);
  return parts.join(" ");
}

/**
 * Optionally enrich a computed plan with qualitative AI study guidance. Returns
 * the same plan untouched (no aiGuidance) when no AI provider is configured or
 * the call fails — the deterministic plan is always usable on its own.
 */
export async function enrichRevisionPlanWithAi(plan: RevisionPlan): Promise<RevisionPlan> {
  if (!isAiConfigured()) return plan;
  try {
    const system =
      "You are an experienced Cambridge examinations tutor. Give concise, practical revision guidance. " +
      "Do not invent a timetable or dates — one has already been created. Reply in short markdown with a few bullet points.";
    const prompt =
      `A student has ${plan.daysUntilExam} days until their exam and is revising: ${plan.subjects.join(", ")}.` +
      (plan.weakTopics.length ? ` Their weak topics are: ${plan.weakTopics.join(", ")}.` : "") +
      ` Their plan runs in three phases (foundation, practice, final review).` +
      ` Give 4-6 short, high-impact study tips tailored to this situation. Do not restate the schedule.`;
    const guidance = await generateAiAnswer(system, prompt);
    return { ...plan, aiGuidance: guidance.trim() };
  } catch {
    return plan; // guidance is a bonus; never fail the plan because of it
  }
}
