# AI Tutor Cambridge Upgrade Report

## Root causes

- Generic `Light` queries were not recognized by the strict Physics 5054 topic
  detector. This allowed broad semantic evidence to influence ranking.
- The topic panel reflected returned sources, so weak retrieval could surface
  unrelated topics such as Atomic Physics.
- Source previews used a fixed 144 px height, making real paper questions
  unreadable. Broken image responses did not switch cleanly to question text.
- The marking-scheme filter was visual state only and did not filter cards.

## Backend improvements

- Added generic Light, optics, lenses, image formation, reflection, refraction,
  TIR, critical angle, and ray-diagram recognition.
- Added an irrelevant-topic ranking penalty.
- Added verified-question and linked-marking-scheme ranking boosts.
- Added subtopic breakdown and practice order to database-backed question-list
  answers.
- Included marking-scheme link status in source payloads.
- Existing OpenAI support was verified:
  - `AI_PROVIDER=openai`
  - `OPENAI_API_KEY` (backend only)
  - `OPENAI_MODEL` (defaults to `gpt-4.1-mini`)

No provider secrets are sent to the frontend or logged.

## AI Tutor UI improvements

- Increased the main answer workspace width.
- Increased question preview height to 288–320 px.
- Preview images open at full size in a new tab.
- Broken or missing images fall back to readable question text.
- Added clear topic, subtopic, difficulty, marks, and marking-scheme badges.
- The marking-scheme-only switch now filters visible source cards and counts.
- Existing admin diagnostics remain admin-only.
- Existing on-demand preview generation and PDF fallback remain intact.

## Light query verification

A live read-only database check for verified Physics 5054 Light questions from
2020–2024 returned:

- 53 verified Light rows
- 11 rows with linked or partial marking-scheme status
- only the `Light` main topic

Current subtopics include Refraction, Total Internal Reflection, and Lenses and
Image Formation.

## Tests

- Typecheck passed.
- 33 tests passed.
- Added coverage for generic `Find Light questions from 2020-2024` detection.
- Frontend and backend production builds passed.

## Remaining data risks

- Only 11 of the 53 currently matched Light rows have linked/partial marking
  schemes.
- Some indexed rows have missing marks.
- Preview quality still depends on correct `source_page` and `bbox` metadata;
  question text and PDF remain the safe fallback.
- The frontend bundle-size warning predates this work and remains.
