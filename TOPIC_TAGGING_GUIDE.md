# Topic Tagging Guide

## Subject detection

Bulk-import filenames provide a four-digit Cambridge subject code. The importer resolves that code through `subject_code_map`; topic tagging then uses the resolved subject and its approved `topic_maps` rows. No subject code is embedded in the classifier.

Any code added to `subject_code_map` is supported automatically. If it has no approved map, indexing continues with `Unclassified`, confidence `0`, `needs_review = true`, and the note `No topic map found for this subject.`

## Topic maps

Each `topic_maps` row contains:

- subject code
- topic and optional subtopic
- syllabus reference
- keyword array
- draft/approved/rejected status
- manual, CSV, or AI-syllabus source

Only approved rows classify questions. The initial Cambridge Physics 5054 map includes Motion, Forces, Energy, Matter, Thermal Physics, Waves, Light, Sound, Electricity, Magnetism, Electromagnetism, Atomic Physics, and Space Physics.

## Rules and AI fallback

Keyword matching runs first:

- `0.85–1.00`: save automatically with `tagging_method = keyword`
- `0.60–0.84`: ask the configured central AI provider to choose from the approved map
- below `0.60`: use AI only when a map exists, then leave low-confidence results for review

The AI is never allowed to invent topics outside the approved map. Missing maps do not trigger paid AI calls. Weak extraction remains reviewable alongside the stored question screenshot; scanned PDFs must first pass the existing OCR-capable extraction workflow.

## Admin workflow

Open **Admin → Topic Map Manager** to:

- see every `subject_code_map` entry and real tagging counts
- add or edit topic rows
- import CSV using `topic,subtopic,syllabus_reference,keywords` (`|` separates keywords)
- generate a draft map from the newest processed syllabus
- approve drafts before they affect classification
- select review questions and bulk-assign a topic/subtopic
- rerun processing for all question resources in one subject

## Adding another subject

1. Add the subject and its four-digit code.
2. Confirm the code appears in `subject_code_map`.
3. Add approved topic-map rows manually, import CSV, or process a syllabus and choose **Generate From Syllabus**.
4. Review and approve generated rows.
5. Choose **Re-run Detection**.

## Student practice

The Topical Questions page reads approved, non-review `question_index` rows and supports subject, topic, subtopic, year, session, paper, and variant filters. It also shows real repeated-topic counts and can create a ten-question topical practice set from the active filters.
