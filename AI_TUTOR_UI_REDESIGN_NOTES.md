# AI Tutor UI Redesign Notes

## Updated components

- `frontend/src/pages/subject-ai.tsx`
- `frontend/src/components/ai-tutor/ai-message.tsx`
- `frontend/src/components/ai-tutor/source-card.tsx`
- `frontend/src/components/ai-tutor/chat-composer.tsx`
- `frontend/src/components/ai-tutor/study-context-panel.tsx`

## Design improvements

- Premium white/slate workspace with emerald, teal, blue and violet accents.
- Clear AI identity, timestamps, verified-result metrics and teacher-tip panel.
- Compact ranked Best Matches list with progressive result disclosure.
- Refined prompt bubble and sticky composer with exam-search actions.
- Right panel now focuses on result context, detected topics and study actions.
- Softer borders, consistent radii, restrained shadows and improved spacing.
- Polished loading copy for verified past-paper retrieval.

## Preserved functionality

AI chat, current subject and paper selection, source cards, on-demand previews,
View PDF, View preview, Explain, marking-scheme display, worksheet export,
topic metadata, authentication, role checks and Supabase-backed retrieval remain
intact.

## Student and admin separation

Students receive clean source states and friendly PDF fallback text. Existing
technical screenshot metadata remains inside the email-gated collapsible admin
debug panel only.

## Responsive behavior

- Desktop: central chat workspace plus a dedicated context/refinement panel.
- Tablet: the context panel moves into the existing drawer.
- Mobile: source cards start at three results, controls wrap, the prompt remains
  sticky, and further results expand on demand.

## Remaining improvements

- Connect the decorative attachment control to a future approved image-upload
  workflow.
- Connect individual right-panel quick actions directly to prompt submission.
- Add persisted bookmarks when a bookmark data model is approved.
