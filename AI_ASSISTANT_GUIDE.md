# AI Assistant And PDF Ingestion Guide

This document explains the active Parhai.com RAG implementation. It is intentionally narrower than the long-term product plan.

## Current Supported Scope

The first production-oriented test supports:

```text
Level:        O Level
Subject:      Physics
Subject code: 5054
Year:         2024
Paper:        1
Inputs:       Question paper PDF + marking-scheme PDF
```

The API rejects other subjects and years. This is deliberate. Validate the first real paper pair before generalizing ingestion.

The current backend uses Gemini for grounded answers and question classification. The API key remains server-side; n8n is not required.

## Main Files

```text
backend/src/routes/ai-assistant.ts
backend/src/routes/ingestion.ts
backend/src/services/physics-ingestion.ts
backend/src/services/physics-paper-parser.ts
backend/src/services/physics-paper-parser.test.ts
backend/src/lib/openai.ts
backend/src/lib/supabase.ts
backend/src/middleware/auth.ts
frontend/src/pages/subject-ai.tsx
frontend/src/pages/admin.tsx
frontend/src/api/client.ts
supabase/migrations/20260619092050_ai_assistant_pipeline.sql
```

## Required Backend Variables

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=
OPENAI_EMBEDDING_MODEL=
```

Without the Supabase server values, the API cannot start. Without `OPENAI_API_KEY`, keyword ingestion can complete with `ready_without_embeddings`, but model-generated answers are unavailable.

## AI Assistant Endpoint

```http
POST /api/ai-assistant
Authorization: Bearer SUPABASE_ACCESS_TOKEN
Content-Type: application/json
```

Accepted request shape:

```json
{
  "message": "Explain question 5 and show the marking-scheme logic.",
  "subjectId": 1,
  "level": "O_LEVEL",
  "selectedPaperId": 10,
  "year": 2024,
  "chatHistory": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```

Snake-case aliases are accepted for `subject_id`, `selected_paper_id`, and `chat_history`.

Successful response:

```json
{
  "answer": "The answer based on the retrieved paper context... [Source 1]",
  "sources": [
    {
      "chunkId": 100,
      "sourceType": "question",
      "paperId": 10,
      "year": 2024,
      "session": "MAY_JUNE",
      "paperNumber": 1,
      "questionNumber": "5",
      "reference": "Physics 5054, 2024 MAY/JUNE, Paper 1, Question 5"
    }
  ]
}
```

Missing-source response:

```json
{
  "answer": "I could not find this paper or marking scheme in the database yet.",
  "sources": []
}
```

This response is not an error. It prevents fabricated paper content.

## Retrieval Flow

1. `requireUser` validates the Supabase access token with `auth.getUser`.
2. Zod validates message, level, subject, paper, year, and history.
3. The API loads the canonical subject row from Supabase.
4. Current scope guards require Physics 5054 and O Level.
5. A question-number expression such as `question 5` triggers an exact lookup.
6. If OpenAI is configured, the message is embedded.
7. The API calls `match_document_chunks` for semantic matches.
8. If fewer than three chunks are found, it calls `search_document_chunks`.
9. Results are deduplicated and limited.
10. Empty retrieval returns the fixed missing-source response.
11. Retrieved chunks are inserted into the model prompt as numbered sources.
12. The model is instructed to use only those sources and cite `[Source N]`.
13. The exchange and source metadata are saved to `chat_messages`.

## Subject Isolation

Retrieval is always filtered by canonical `subject_id` and `level`. Optional paper and year filters narrow it further. Do not remove these filters when generalizing the endpoint.

When adding another subject:

1. Load the subject from `subjects`.
2. Validate the requested level against the row.
3. Pass the canonical subject ID into both retrieval functions.
4. Keep paper filters inside the same subject.
5. Add tests proving that chunks from another subject are never returned.

## OpenAI Adapter

`backend/src/lib/openai.ts` contains three responsibilities:

- Batch embeddings
- Chat completions
- Physics topic classification

Defaults are supplied in code, but production should set explicit model names through environment variables so upgrades are controlled.

Do not call OpenAI directly from the browser. Provider keys and retrieved source content stay server-side.

## PDF Ingestion Endpoint

```http
POST /api/ingest/physics-2024-paper-1
Authorization: Bearer SUPABASE_ADMIN_ACCESS_TOKEN
Content-Type: multipart/form-data
```

Multipart fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `paper` | PDF | Yes | Question paper |
| `markingScheme` | PDF | Yes | Matching marking scheme |
| `session` | Text | No | `MAY_JUNE`, `OCT_NOV`, or `FEB_MAR` |
| `variant` | Integer | No | Variant 1 through 9 |

Each PDF is limited to 25 MB. The endpoint requires an authenticated email present in `admin_users`.

## Ingestion Pipeline

1. Multer accepts two PDFs into memory.
2. The backend extracts text with `pdf-parse`.
3. Metadata detection examines filenames and initial PDF text.
4. The parser detects sequential question numbers, expected from 1 through 40.
5. The marking parser finds question/answer option pairs.
6. Validation requires at least 30 questions and 30 answers.
7. Both PDFs are uploaded to private Supabase buckets.
8. A `papers` row is inserted or updated with status `processing`.
9. A linked `marking_schemes` row is upserted.
10. Previously extracted questions for that paper are replaced.
11. Topic classification runs in batches when OpenAI is configured.
12. Keyword rules provide a safe topic fallback.
13. `topics` and `question_topics` are upserted.
14. Question and marking-scheme chunks are built with paper references.
15. Embeddings are generated in one batch when configured.
16. Existing paper chunks are replaced.
17. Final status becomes `ready` or `ready_without_embeddings`.
18. The API returns `published: true` only after both status updates succeed.
19. Frontend paper, subject, and AI query caches are invalidated.

Ready records immediately appear in subject paper lists because client queries filter on the final ingestion statuses.

## Storage Paths

```text
O_LEVEL/5054/2024/SESSION/paper-1/variant-V/question-paper.pdf
O_LEVEL/5054/2024/SESSION/paper-1/variant-V/marking-scheme.pdf
```

Uploads use `upsert: true`, so re-ingesting the same variant replaces the stored pair and extracted database records.

## Ingestion Statuses

| Status | Meaning |
| --- | --- |
| `pending` | Metadata exists but ingestion has not started |
| `processing` | Source files or extracted records are being written |
| `ready` | Chunks and embeddings are available |
| `ready_without_embeddings` | Chunks are keyword-searchable, but semantic vectors were not generated |

Do not expose `pending` or `processing` records to students.

## Parser Tests

Run:

```bash
npm --prefix backend test
```

The current test verifies sequential Physics Paper 1 question parsing, answer-grid parsing, linking, session detection, and variant detection with structural fixture text. It does not contain copyrighted paper content.

Before expanding the parser, add sanitized structural fixtures for:

- Different sessions and variants
- Multi-column marking grids
- Diagrams with sparse extracted text
- Scanned/image-only PDFs
- Questions that wrap across pages
- Missing or duplicate question numbers

## Adding Notes To RAG

The `document_chunks` table already supports `source_type = 'note'` and `note_id`.

To implement notes ingestion:

1. Add an authenticated admin route.
2. Upload to the private `notes` bucket.
3. Create or update a `notes` row.
4. Extract text and split it into bounded chunks.
5. Attach canonical subject and level fields.
6. Generate embeddings with the same model and dimensions.
7. Insert `document_chunks` rows with `note_id` set.
8. Add retrieval tests that preserve subject isolation.

## Generalizing Paper Ingestion

Do not clone the Physics service for every subject. Refactor in stages:

1. Define a common `PaperMetadata` and `ParsedQuestion` contract.
2. Extract shared Storage and database publishing logic.
3. Create parser strategies by paper format, not just subject name.
4. Add a parser registry keyed by subject, paper type, and format.
5. Replace the fixed endpoint with a validated generic admin endpoint.
6. Keep subject/year/paper metadata server-validated.
7. Add an ingestion-job table if processing becomes asynchronous.
8. Add idempotency keys and failure cleanup.
9. Add end-to-end tests with permitted fixture PDFs.

## Image Questions And OCR

The frontend currently shows image upload as pending. A safe implementation should:

1. Authenticate the student.
2. Restrict file type and size.
3. Store the upload privately or process it ephemerally.
4. Run OCR or a vision model server-side.
5. Detect subject and topic, but require the current workspace subject as a hard filter.
6. Search existing chunks.
7. Answer from retrieved sources or clearly identify a general explanation.
8. Delete temporary images according to a documented retention policy.

## Gemini And Optional Automation

Gemini is active in the backend. Optional automation may be added later, but no active route depends on n8n. When extending automation:

- Keep a single canonical ingestion contract.
- Keep automation optional and outside the basic upload and assistant paths.
- Validate webhook signatures.
- Keep provider secrets server-side.
- Preserve the fixed no-source behavior.
- Add provider and workflow health checks.
- Document exactly which component owns embeddings and chat generation.

## Operational Checks

After an upload, verify:

```sql
select id, title, ingestion_status
from public.papers
order by created_at desc
limit 5;

select source_type, count(*)
from public.document_chunks
where paper_id = YOUR_PAPER_ID
group by source_type;

select question_number, answer, topic
from public.questions
where paper_id = YOUR_PAPER_ID
order by question_number::integer;
```

Then test:

1. Exact question-number retrieval.
2. Topic retrieval.
3. Marking-scheme explanation.
4. Missing paper/year response.
5. Cross-subject isolation.
