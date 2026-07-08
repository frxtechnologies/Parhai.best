export interface UserProfile {
  id: string;
  googleId?: string | null;
  name: string;
  email: string;
  avatarUrl: string | null;
  level: "O_LEVEL" | "A_LEVEL" | null;
  subjectIds: number[];
  onboarded: boolean;
  streakDays: number;
  createdAt: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  level: "O_LEVEL" | "A_LEVEL";
  board: string;
  description: string;
  color: string;
  icon: string;
  totalPapers: number;
  totalNotes: number;
  totalQuestions: number;
}

export interface Paper {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectCode?: string;
  level?: "O_LEVEL" | "A_LEVEL";
  title: string;
  year: number;
  session: "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";
  paperNumber: number;
  type: "PAST_PAPER" | "MARKING_SCHEME" | "EXAMINER_REPORT";
  variant: number | null;
  fileUrl: string | null;
  markingSchemeUrl?: string | null;
  topicTags?: string[];
  originalFilename?: string | null;
  fileType?: string | null;
}

export interface Note {
  id: number;
  subjectId: number;
  subjectName: string;
  title: string;
  topic: string;
  content: string;
  summary: string;
  readingTime: number;
  createdAt: string;
}

export interface Question {
  id: number;
  subjectId: number;
  subjectName: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  question: string;
  answer: string;
  markingPoints: string[];
  marks: number;
  year: number | null;
}

export interface SubjectProgress {
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  questionsAttempted: number;
  questionsCorrect: number;
  papersCompleted: number;
  notesRead: number;
  hoursStudied: number;
  percentComplete: number;
  lastStudied: string | null;
}

export interface ActivityItem {
  id: number;
  type: string;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  description: string;
  createdAt: string;
}

export interface Exam {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  session: string;
  year: number;
  examDate: string;
  paperNumber: number;
  daysUntil: number;
}

export interface Dashboard {
  user: UserProfile;
  streakDays: number;
  totalHoursStudied: number;
  subjectsEnrolled: number;
  questionsAttempted: number;
  overallScore: number;
  subjectProgress: SubjectProgress[];
  recentActivity: ActivityItem[];
  upcomingExams: Exam[];
}

export interface AiMessage {
  id: number | string;
  subjectId: number;
  role: "user" | "assistant";
  content: string;
  sources?: AiSource[];
  createdAt: string;
}

export interface AiSource {
  chunkId: number;
  sourceType: "resource" | "paper" | "question" | "topic" | "marking_scheme" | "note";
  paperId: number | null;
  year: number | null;
  session: string | null;
  paperNumber: number | null;
  questionNumber: string | null;
  screenshotUrl?: string | null;
  screenshotStatus?: string | null;
  bbox?: { x: number; y: number; width: number; height: number } | null;
  filePath?: string | null;
  confidence?: number | null;
  needsReview?: boolean | null;
  questionText?: string | null;
  answerText?: string | null;
  sourcePage?: number | null;
  resourceId?: number | null;
  variant?: number | null;
  topic?: string | null;
  subtopic?: string | null;
  difficulty?: string | null;
  marks?: number | null;
  sourceFile?: string | null;
  reference: string;
}

export interface OnboardInput {
  level: "O_LEVEL" | "A_LEVEL";
  subjectIds: number[];
}

export type RevisionActivity = "learn" | "practice" | "review" | "mock_paper";
export type RevisionPhase = "foundation" | "practice" | "final_review";
export type PreparationLevel = "beginner" | "intermediate" | "advanced";

export interface RevisionPlanInput {
  examDate: string;
  subjects: string[];
  weakTopics?: string[];
  hoursPerDay?: number;
  studyDaysPerWeek?: number;
  preparationLevel?: PreparationLevel;
  includeGuidance?: boolean;
}

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

export interface ListSubjectsParams {
  level?: "O_LEVEL" | "A_LEVEL";
}

export interface ListPapersParams {
  subjectId?: number;
  type?: "PAST_PAPER" | "MARKING_SCHEME" | "EXAMINER_REPORT";
  year?: number;
}

export interface ListNotesParams {
  subjectId?: number;
  topic?: string;
}

export interface ListQuestionsParams {
  subjectId?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  topic?: string;
}

export interface CreatePaperInput {
  subjectId: number;
  level?: "O_LEVEL" | "A_LEVEL";
  subjectName?: string;
  subjectCode?: string;
  title: string;
  year: number;
  session: "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";
  paperNumber: number;
  type: "PAST_PAPER" | "MARKING_SCHEME";
  variant: number | null;
  fileUrl: string | null;
  markingSchemeUrl?: string | null;
  topicTags?: string[];
}

export interface UploadPastPaperInput {
  level: "O_LEVEL" | "A_LEVEL";
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  year: number;
  session: "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";
  paperNumber: number;
  variant: number | null;
  type: "PAST_PAPER" | "MARKING_SCHEME";
  topicTags: string[];
  paperFile: File;
  markingSchemeFile?: File | null;
}

export interface DirectPdfUploadInput {
  resourceType: "PAPER" | "MARKING_SCHEME" | "EXAMINER_REPORT" | "NOTE";
  level: "O_LEVEL" | "A_LEVEL";
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  title: string;
  topic?: string;
  year: number;
  session: "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";
  paperNumber: number;
  variant: number | null;
  relatedPaperId?: number | null;
  file: File;
}

export interface DirectPdfUploadResult {
  bucket: "papers" | "marking-schemes" | "examiner-reports" | "notes";
  path: string;
  metadataId: number;
}

export interface AiAssistantRequest {
  userId: string;
  studentName: string;
  level: "O_LEVEL" | "A_LEVEL";
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  board: string;
  selectedPaperId?: number | null;
  year?: number | null;
  session?: "MAY_JUNE" | "OCT_NOV" | "FEB_MAR" | null;
  paperNumber?: number | null;
  variant?: number | null;
  message: string;
  answerLength?: "quick" | "teacher" | "full";
  chatHistory: AiMessage[];
}

export interface AiAssistantResponse {
  answer: string;
  sources: AiSource[];
}
