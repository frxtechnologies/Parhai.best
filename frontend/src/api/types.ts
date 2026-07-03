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
  intent?: string;
  pagination?: { total:number;limit:number;offset:number;hasMore?:boolean };
  searchContext?: AiSearchContext;
  analysis?: PaperAnalysis;
  createdAt: string;
}

export interface PaperAnalysis {
  overview?: {
    subjectCode:string;year:number;session:string;paperNumber:number;variant:number;
    totalIndexedQuestions:number;verifiedQuestions:number;totalMarks:number;
    markingSchemeLinked:number;markingSchemeMissing:number;screenshotsAvailable:number;
    completeness:"complete"|"partial";
  };
  topics?: Array<{topic:string;questions:number;marks:number;percentageOfMarks:number;averageDifficulty:string;markingSchemeLinked:number;subtopics:Record<string,number>}>;
  difficulty?: Record<string,{questions:number;marks:number}>;
  highValueTopics?: Array<{topic:string;priority:string;reason:string}>;
  revisionRecommendation?: string[];
}

export interface AiSource {
  chunkId: number;
  sourceType:
    | "resource"
    | "paper"
    | "question"
    | "topic"
    | "marking_scheme"
    | "note";
  paperId: number | null;
  year: number | null;
  session: string | null;
  paperNumber: number | null;
  questionNumber: string | null;
  screenshotUrl?: string | null;
  screenshotStatus?: string | null;
  screenshotError?: string | null;
  pageMatchScore?: number | null;
  screenshotFallbackUsed?: boolean | null;
  bbox?: { x: number; y: number; width: number; height: number } | null;
  filePath?: string | null;
  confidence?: number | null;
  needsReview?: boolean | null;
  questionText?: string | null;
  answerText?: string | null;
  markingSchemeLinkStatus?:
    | "linked"
    | "partial"
    | "linked_exact"
    | "linked_partial"
    | "unlinked"
    | "needs_review"
    | "general_guidance"
    | null;
  markingSchemeResourceId?: number | null;
  markingSchemeStatus?: "linked"|"resource_missing"|"resource_exists_answer_missing"|"answer_extracted_not_linked"|"answer_not_extracted"|"needs_review"|"generic_guidance_only"|"invalid_link"|null;
  sourcePage?: number | null;
  resourceId?: number | null;
  resourceType?: string | null;
  subjectName?: string | null;
  subjectCode?: string | null;
  variant?: number | null;
  topic?: string | null;
  subtopic?: string | null;
  difficulty?: string | null;
  questionType?: string | null;
  marks?: number | null;
  sourceFile?: string | null;
  reference: string;
}

export type TutorAction =
  | {type:"paper_analysis"|"show_questions_from_paper";subjectCode:string;year:number;session:string;paperNumber:number;variant:number;resourceId?:number}
  | {type:"explain_question"|"show_marking_scheme";questionId:number}
  | {type:"load_more";queryState:AiSearchContext;offset:number;limit:number};

export interface OnboardInput {
  level: "O_LEVEL" | "A_LEVEL";
  subjectIds: number[];
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
  limit?: number;
  offset?: number;
  message: string;
  action?: TutorAction;
  answerLength?: "quick" | "teacher" | "full";
  chatHistory: AiMessage[];
}

export interface AiAssistantResponse {
  answer: string;
  sources: AiSource[];
  intent?: string;
  pagination?: { total:number;limit:number;offset:number;hasMore?:boolean };
  searchContext?: AiSearchContext;
  analysis?: PaperAnalysis;
}

export interface AiSearchContext {
  subjectCode:string;
  topic:string|null;
  year:number|null;
  yearFrom:number|null;
  yearTo:number|null;
  session:string|null;
  paperNumber:number|null;
  variant:number|null;
  difficulty:string|null;
  markingSchemeOnly:boolean;
}
