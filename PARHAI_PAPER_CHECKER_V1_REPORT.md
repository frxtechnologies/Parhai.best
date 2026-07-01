# Parhai Paper Checker V1 Report

## Delivered

- Separate `/paper-checker` student route and sidebar navigation.
- Paper selection from approved, processed resources with verified indexed questions.
- Manual answer boxes generated from `question_index`.
- Server-side submission and marking workflow using linked `answer_text`.
- Conservative per-question marks, correct/missing points, mistake category, feedback, confidence, totals, percentage, and topic summary.
- Friendly warnings when a marking scheme, grade threshold, or examiner report is unavailable.
- Admin-readable, student-owner-only submission data.
- AI Tutor action button linking to the full Paper Checker.
- Shared Cambridge data core used by AI Tutor and Paper Checker.

## Database

Migration `20260630080617_paper_checker_v1.sql` adds:

- `paper_check_submissions`
- `paper_check_answers`

Both tables use RLS. Students receive read-only access to their own rows. Marks are written by the authenticated backend workflow; client roles receive no direct insert/update/delete grants. Admin reads use the existing `admin_users` trust source.

A follow-up hardening migration explicitly revokes project-default table and sequence writes from `anon` and `authenticated`, then grants authenticated users `SELECT` only.

## API routes

- `GET /api/paper-checker/papers`
- `GET /api/paper-checker/papers/:resourceId/questions`
- `POST /api/paper-checker/check`

## Marking limitations

V1 uses deterministic lexical matching against extracted official marking points. It does not claim official marking when a scheme is missing. Diagrams, sophisticated mathematical equivalence, alternative-answer dependencies, handwritten OCR, file upload, grade thresholds, examiner reports, and teacher override remain future work. A real release should calibrate marks against teacher-marked samples.

## Shared AI/data core

`backend/src/services/cambridge-context.ts` provides `getQuestionContext`, `getLinkedMarkingScheme`, `getTopicContext`, `getSimilarQuestions`, and `generateExamFeedback`. Paper Checker uses all five; AI Tutor uses the same topic-context function. Practice recommendations come only from verified `question_index` rows.
