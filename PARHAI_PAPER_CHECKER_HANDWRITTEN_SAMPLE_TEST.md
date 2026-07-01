# Handwritten Sample Test - Maths 4024/12 May/June 2023

Sample: `Maths P1 23 Solved .pdf` (16 pages).

## Findings

- Paper metadata visible in the PDF: Mathematics (Syllabus D) 4024/12, Paper 1, May/June 2023, Variant 2.
- The printed Cambridge paper text is selectable on all 16 pages.
- Handwriting is vector ink, not selectable answer text and not embedded page images.
- Normal PDF extraction therefore cannot safely distinguish answers from printed questions.

## Fix and expected flow

- Cambridge question-paper signatures now force the vision/manual-review path.
- Every page is rendered server-side to PNG memory buffers for a configured vision provider.
- No handwriting vision provider is currently configured.
- The safe result is `needs_manual_review`, with editable placeholders created from the selected `4024_s23_qp_12` `question_index` rows.
- The UI advances to Review Answers and displays the explicit handwriting-provider message.
- Reviewed text is marked only against linked `4024_s23_ms_12` answers.

## Current limitations

No handwritten answers are claimed as extracted until a vision provider is configured. Page images are rendered but not permanently stored. Accurate handwriting transcription, page/bbox mapping, crossed-out work, diagrams, and mathematical notation remain provider-dependent.
