# Question Screenshot Pipeline

## Processing flow

When a supported question-bearing PDF is processed, the backend:

1. Downloads the original PDF from Supabase Storage.
2. Extracts and indexes its real text as before.
3. Uses PDF text coordinates to locate each detected question start.
4. Treats the next detected question as the current crop boundary.
5. Renders affected pages server-side and uploads PNG crops.
6. Saves every image in `question_images` and mirrors the first image onto `question_index`.

Multi-page questions create `q-{number}-part-1.png`, `q-{number}-part-2.png`, and so on. If an exact boundary cannot be found, the processor stores a full-page fallback and marks the crop `needs_review`.

## Storage

Images use the `question-screenshots` bucket:

`{level}/{subject_code}/{year}/{session}/paper-{paper_number}/variant-{variant}/q-{question_number}.png`

The bucket permits public reads because approved student questions display these images. Upload, update, and deletion remain restricted to authenticated admins.

## Database

`question_index` stores the primary crop URL/path, source page, bounding box, and review status. `question_images` stores all crop parts in display order with their page number and bounding box.

Deleting a resource cascades through `question_index` and `question_images`. Existing resource processing remains the entry point, so direct upload, bulk import, retry, and automatic processing all use the screenshot pipeline.

## Admin review

Open **Admin → Processing → Review questions** to:

- inspect every crop part
- compare extracted text and marking-scheme answer
- mark a crop correct or incorrect
- reprocess the resource when a crop needs regeneration

## Student rendering

Question consumers should render ordered `question_images` first, followed by `question_text`, `answer_text`, AI explanation, and the existing source citation. Never substitute demonstration images when no crop exists.
