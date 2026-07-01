# AI Paper Checker / Mark My Paper — Technical Plan

Status: planning only. No feature code or database migration is included.

## 1. Current-system fit

The feature should extend, not duplicate, the existing pipeline:

- `resources` identifies Cambridge question papers, marking schemes, examiner reports, and grade thresholds.
- `resource_links` pairs papers with marking schemes and grade thresholds.
- `question_index` provides verified question metadata, topic/subtopic, marks, source page, and student-safe text.
- `marking_scheme_answers` provides answer-level official evidence and link confidence.
- `topic_maps` provides subject-aware topic classification.
- `ai_chunks` and the AI Tutor provide evidence-grounded retrieval and explanation.
- Existing backend authentication middleware should protect every paper-check endpoint.

The checker must only accept a paper when its question paper is indexed. Phase A must also require a linked marking scheme. Examiner reports and thresholds enrich the result but are not required to calculate question marks.

## 2. Required user flow

1. Student opens **Mark My Paper**.
2. Student selects level, subject, year, session, paper number, and variant.
3. Backend resolves one approved question-paper `resource`, its indexed questions, linked marking scheme, optional examiner report, and optional grade threshold.
4. UI shows coverage before upload: indexed question count, marking-scheme availability, threshold availability, and supported upload types.
5. Student uploads a typed PDF or text file in Phase A.
6. Server validates ownership, MIME type, size, malware-scan status if available, and selected-paper consistency.
7. A `paper_check_submission` enters `uploaded`, then `extracting`, `matching`, `marking`, `reporting`, and finally `completed`, `needs_review`, or `failed`.
8. Extraction separates answers by Cambridge question number and part and records missing/ambiguous sections.
9. Matching maps each extracted answer to a verified `question_index` row using the selected paper plus normalized question number/part.
10. Marking compares the original question, student answer, official marking-scheme answer, maximum marks, and optional examiner evidence.
11. Deterministic code validates awarded marks, totals, percentages, and threshold lookup. AI must never calculate the authoritative total itself.
12. Student receives a report with per-question evidence, confidence, mistakes, weak topics, an improvement plan, and verified similar practice questions.

Resubmission should create a new immutable attempt rather than overwrite a completed report.

## 3. Proposed database model

### `paper_check_submissions`

Purpose: one student attempt and its processing lifecycle.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id)`
- `question_paper_resource_id bigint not null references resources(id)`
- `marking_scheme_resource_id bigint references resources(id)`
- `examiner_report_resource_id bigint references resources(id)`
- `grade_threshold_resource_id bigint references resources(id)`
- snapshot metadata: `subject_id`, `subject_code`, `level`, `year`, `session`, `paper_number`, `variant`
- `status text`: `uploaded`, `extracting`, `matching`, `marking`, `reporting`, `completed`, `needs_review`, `failed`, `cancelled`
- `extraction_mode text`: initially `typed_pdf` or `text`
- `total_awarded numeric`, `total_available numeric`, `percentage numeric`
- `estimated_grade text`, `grade_is_estimate boolean`
- `overall_confidence numeric`
- `error_code text`, `error_message_admin text`
- `started_at`, `completed_at`, `created_at`, `updated_at`

Relations: parent of files, extracted answers, results, and feedback.

RLS: owner can select/insert their rows; owner may cancel only active rows. Students cannot directly update scores or status. Backend service writes processing fields. Admin access must use the existing trusted admin check, never user-editable metadata.

### `paper_check_files`

Purpose: private file registry and retention/audit metadata.

Columns:

- `id uuid primary key`
- `submission_id uuid not null references paper_check_submissions(id) on delete cascade`
- `user_id uuid not null`
- `file_kind text`: `student_original`, `normalized_pdf`, `page_image`, `extraction_artifact`
- `bucket text`, `storage_path text`, `original_filename text`
- `mime_type text`, `size_bytes bigint`, `sha256 text`
- `page_count integer`
- `scan_status text`
- `created_at`, `deleted_at`

RLS: access requires both submission ownership and matching `user_id`. Admin inspection should be logged. Generated artifacts should not be browser-listable.

### `paper_check_answers`

Purpose: extracted student answer sections before marking.

Columns:

- `id uuid primary key`
- `submission_id uuid not null references paper_check_submissions(id) on delete cascade`
- `question_id bigint references question_index(id)`
- `question_number text`, `question_part text`
- `raw_answer_text text`
- `clean_answer_text text`
- `source_pages integer[]`
- `answer_bbox jsonb`
- `extraction_confidence numeric`
- `match_confidence numeric`
- `answer_status text`: `matched`, `missing`, `blank`, `ambiguous`, `unmatched`, `needs_review`
- `contains_diagram boolean`, `contains_table boolean`, `contains_math boolean`
- `created_at`, `updated_at`

RLS: owner read-only after processing; backend-only mutation. Raw extraction must not be exposed outside the owner/admin context.

### `paper_check_results`

Purpose: auditable mark decision for one answer.

Columns:

- `id uuid primary key`
- `submission_id uuid not null`
- `paper_check_answer_id uuid not null unique`
- `question_id bigint not null references question_index(id)`
- `marking_scheme_answer_id bigint references marking_scheme_answers(id)`
- `awarded_marks numeric not null`
- `max_marks numeric not null`
- `marking_status text`: `official_scheme`, `estimated`, `needs_review`, `not_markable`
- `correct_points jsonb`
- `missing_points jsonb`
- `mistake_types text[]`
- `feedback text`, `examiner_tip text`
- `marking_confidence numeric`
- `model_provider text`, `model_name text`, `prompt_version text`
- evidence snapshots: `question_snapshot`, `scheme_snapshot`, `examiner_evidence jsonb`
- `created_at`, `updated_at`

Constraints: `0 <= awarded_marks <= max_marks`; official status requires a scheme answer; low confidence must imply `needs_review`.

RLS: owner select only. Only trusted server processing can insert/update. Snapshot fields make later audits reproducible if source data changes.

### `paper_check_feedback`

Purpose: report-level synthesis without mixing it into authoritative per-question marks.

Columns:

- `id uuid primary key`
- `submission_id uuid not null`
- `feedback_type text`: `overall`, `weak_topic`, `improvement_step`, `examiner_pattern`, `practice_recommendation`
- `topic`, `subtopic`
- `content text`
- `priority integer`
- `evidence_question_ids bigint[]`
- `recommended_question_ids bigint[]`
- `confidence numeric`
- `created_at`

RLS: owner select only; backend writes.

### Optional later tables

- `paper_check_reviews`: teacher/human overrides, reason, original and revised marks.
- `paper_check_events`: append-only processing/audit events.
- `grade_threshold_entries`: structured threshold rows parsed from threshold resources by component and grade.

Do not store one large opaque AI JSON result as the source of truth. Keep marks, evidence, and feedback queryable and constrained.

## 4. Upload and storage design

Create a private bucket such as `paper-check-submissions`.

Path:

`{user_id}/{submission_id}/original/{sanitized_filename}`

Generated files:

`{user_id}/{submission_id}/derived/{artifact_name}`

Rules:

- Bucket remains private; never use public URLs.
- Permit authenticated upload/select/delete only when the first path segment equals `(select auth.uid())::text`.
- Database RLS must independently verify submission ownership; Storage ownership alone is not authorization.
- Prefer authenticated downloads. If a worker needs a signed URL, keep expiry short and never persist it.
- Browser uploads should use the user JWT so Storage records an owner. A service-role upload does not automatically set user ownership.
- Restrict MIME types to PDF and plain text in Phase A; impose file and page limits.
- Reject executable/polyglot files, sanitize filenames, calculate a server-side hash, and rate-limit submissions.
- Service-role credentials stay backend-only.
- Define retention: for example, student-controlled deletion plus automatic deletion of derived artifacts after a configurable period. Deletion must cover Storage and dependent database rows.
- Admin inspection requires an explicit support action and should create an audit event.

## 5. Answer extraction

### Phase A: typed files

1. Extract page-aware text server-side.
2. Normalize Unicode while preserving equations, units, line breaks, and answer numbering.
3. Detect anchors such as `1`, `1(a)`, `(b)(i)`, `Q2`, and page headers.
4. Use the selected paper’s known `question_index` sequence as the expected answer template.
5. Split from one recognized answer anchor to the next.
6. Record every expected question part, including `missing` or `blank` rows.
7. Match only within the selected paper resource; never globally match by question number.

Diagrams/tables:

- Detect image regions and phrases such as “see diagram”, “graph”, or “table”.
- Preserve page number and bbox even when text is extracted.
- In Phase A, mark diagram-dependent answers `needs_review` unless a reliable rubric exists.

### Phase B: scanned PDF/image OCR

- Render pages server-side and OCR with page coordinates.
- Store OCR confidence per block.
- Reconcile OCR blocks with expected question anchors.
- Route low-confidence math, units, and symbols to review.

### Phase C: handwriting

- Use handwriting-capable OCR/vision with strict confidence thresholds.
- Keep the original image beside transcription.
- Require review for illegible text, crossed-out alternatives, diagrams, and uncertain symbols.

Never let OCR failure turn a missing extraction into a confidently blank student answer.

## 6. Marking method

For each matched answer, assemble a bounded evidence packet:

- verified original question and max marks;
- student’s clean answer plus source page/image;
- linked official marking-scheme answer and marking points;
- optional examiner-report passages retrieved within the same subject/paper/topic;
- topic/subtopic and command word.

Then:

1. Convert the marking scheme into atomic marking points with types where possible (`M`, `A`, `B`, independent point, alternative).
2. Evaluate each point as `met`, `not_met`, `ambiguous`, or `not_applicable`, attaching a short quotation or location from the student answer.
3. Apply deterministic rules for maximum marks and method/dependency constraints.
4. Produce:
   - `awarded_marks`
   - `max_marks`
   - `correct_points`
   - `missing_points`
   - `mistake_type`
   - `feedback`
   - `examiner_tip`
   - `confidence`
5. Mark low-confidence or diagram-dependent results `needs_review`.
6. Sum marks and calculate percentage in application/database code, not through the LLM.

If no marking scheme is linked, Phase A should block official marking for that paper. A later mode may provide clearly labelled estimated feedback, but it must not look like an official score.

## 7. Mistake taxonomy

Use controlled values:

- `concept_error`
- `calculation_error`
- `missing_unit`
- `missing_working`
- `incomplete_explanation`
- `wrong_formula`
- `graph_diagram_error`
- `careless_mistake`
- `not_enough_detail`
- `wrong_command_word`

Allow multiple categories per answer. Store a human-readable explanation separately so analytics remain stable.

## 8. Examiner-report integration

- Resolve an approved examiner-report resource by subject, year/session, and paper where available.
- Retrieve passages using topic, subtopic, command word, and question type.
- Save the exact chunk IDs/text snapshots used.
- Present report-derived advice as “Examiner report guidance”.
- If no relevant passage passes the retrieval threshold, omit the section.
- Never attribute generic AI advice to an examiner report.

## 9. Grade-threshold integration

Grade thresholds require structured entries, not free-text guessing:

- threshold resource;
- syllabus/component or component combination;
- session/year;
- grade/band;
- minimum raw mark and maximum available mark;
- source page.

Choose a threshold only when the submission’s exact syllabus, session, year, and component combination match. Calculate percentage independently, then label the grade **Estimated grade based on the uploaded threshold** and link its source. If no exact structured threshold exists, show score and percentage only—never an “official” grade.

## 10. AI accuracy and safety rules

- Official-looking marks require a linked marking scheme.
- Every result carries marking confidence and evidence provenance.
- Confidence below the agreed threshold, ambiguous alternative answers, diagrams, or unreadable text require review.
- AI cannot award more than `max_marks`; totals must equal the sum of stored result rows.
- Missing answers receive zero only when extraction confidently identified the section as blank; otherwise use `needs_review`.
- Do not hallucinate examiner advice or threshold grades.
- Keep model/prompt versions for reproducibility.
- Treat uploaded text as untrusted data and isolate it from system instructions.
- Student-facing output must clearly distinguish official-scheme marking, estimated marking, and review-required results.
- Provide a later “Request teacher review” path and preserve revisions in an audit trail.

## 11. UI design

### Mark My Paper upload page

- Paper selectors sourced only from approved indexed papers.
- Coverage card: marking scheme, examiner report, threshold, indexed questions.
- File requirements, privacy notice, and consent.
- Disable submission when Phase A prerequisites are missing.

### Processing status page

- Stepper: upload → extraction → matching → marking → report.
- Friendly errors and retry for recoverable stages.
- Do not expose model logs or raw OCR errors.

### Results report page

- Score, percentage, estimated grade label/source, confidence/review banner.
- Topic-performance chart.
- Mistake summary and improvement plan.
- Download/export can come after the report is stable.

### Per-question feedback cards

- Question reference, awarded/max marks, marking confidence.
- Student answer, official points met/missed, concise feedback, examiner tip.
- “Open original page”, “View marking scheme”, and “Flag for review”.

### Weak-topic dashboard

- Aggregate only completed, sufficiently confident results.
- Link weak topics to existing verified practice questions and AI Tutor.

## 12. Implementation phases

### Phase A — typed answers, narrow pilot

- One subject/paper family initially; Physics 5054 Paper 2 is a sensible pilot.
- Typed PDF/text only.
- Indexed paper and linked marking scheme required.
- Private upload, deterministic answer matching, per-point marking, totals, basic report.
- No examiner report or grade estimate unless structured support is already reliable.

### Phase B — scanned PDF and image OCR

- Page rendering, OCR coordinates, answer-region matching, confidence review queue.

### Phase C — handwritten answers

- Handwriting OCR/vision, transcription confirmation, diagram handling, stricter review.

### Phase D — examiner reports and grade thresholds

- Evidence retrieval from examiner reports.
- Structured threshold parser and exact component matching.

### Phase E — student progress

- Attempt history, topic trends, practice completion, teacher review, controlled retention/export.

## 13. Recommended implementation order

1. Freeze Phase A scope and choose one fully indexed paper with high-quality linked scheme answers.
2. Define confidence, review, retention, and grading policies.
3. Add schema plus owner/admin RLS and private Storage policies; test cross-user denial first.
4. Build submission creation and state machine.
5. Implement typed extraction against expected question structure.
6. Implement deterministic question/part matching.
7. Implement evidence-packet marking and constraints.
8. Build result aggregation and invariant checks.
9. Add the minimal upload/status/report UI.
10. Run golden-answer evaluation with teacher-reviewed samples.
11. Pilot internally, measure agreement and review rates, then broaden papers.
12. Add OCR, examiner reports, thresholds, and progress only after Phase A quality gates pass.

## 14. Risks and mitigations

- Handwriting OCR: defer; preserve image evidence and require review.
- Marking reliability: atomic rubric decisions, confidence, golden tests, teacher overrides.
- Missing schemes: block official marking and explain why.
- Ambiguous answers: `needs_review`, never forced marks.
- Diagrams/math notation: retain bboxes/images; specialized processing later.
- Hallucinated feedback: closed evidence packets, provenance, output validation.
- Prompt injection in uploads: treat student text as quoted untrusted content.
- Privacy/security: private bucket, ownership RLS, backend authorization, short signed URLs, audit admin access.
- Cost/latency: asynchronous jobs, idempotent stages, per-answer retries, bounded evidence.
- Changed source data: snapshot evidence and model/prompt version.
- Grade mismatch: exact component threshold matching and explicit estimate labels.

## 15. Acceptance tests

### Functional

1. Upload a typed Physics 5054 Paper 2 answer file and complete processing.
2. Match Q1(a) to the correct `question_index` and `marking_scheme_answers` rows.
3. Show awarded/max marks, correct points, and missing points.
4. Sum per-question marks exactly into total score and percentage.
5. Identify weak topics only from marked, sufficiently confident answers.
6. Recommend only verified questions from the same subject/topic.
7. Mark an omitted expected answer as blank/missing when extraction is confident.
8. Route an ambiguous answer or diagram to review.
9. Refuse official marking when the scheme is absent.
10. Show no grade when an exact threshold is absent.
11. Show an estimated grade and threshold source when an exact threshold exists.

### Security

12. Student A cannot select, update, delete, list, download, or create a signed URL for Student B’s submission/files.
13. Changing `user_id` in a client payload is rejected by RLS.
14. Anonymous users cannot access submission tables or bucket objects.
15. Student cannot modify awarded marks, status, confidence, or evidence.
16. Admin access works only through the trusted admin path and is auditable.

### Accuracy/invariants

17. `awarded_marks` never exceeds `max_marks`.
18. Submission total equals the sum of result rows.
19. Every official result references an official scheme answer.
20. Low-confidence results appear in the review count and not as definitive marks.
21. Examiner advice always references stored examiner-report evidence.
22. Reprocessing is idempotent and does not duplicate results.

## 16. Phase A release gate

Do not release broadly until:

- cross-user database and Storage access tests pass;
- at least 50–100 teacher-marked answer samples have been compared;
- exact/near-exact marking agreement meets an agreed target;
- no unsupported official marks or grades are emitted;
- all totals pass invariant checks;
- review-required cases are clearly visible;
- deletion and retention behavior has been verified.

