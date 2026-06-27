# AI Tutor UI V2

## Layout

The subject AI route is a responsive study workspace:

- the existing application navigation remains on the left
- the center contains the conversation, filters, prompt actions, and sticky composer
- desktop includes a right-side study-context panel
- mobile moves study context into a slide-over drawer

The active subject is inherited from the subject route and remains locked throughout retrieval.

## Components

- `AIMessage` renders compact student messages and structured assistant answers.
- `ChatComposer` supports Enter to send, Shift+Enter for new lines, disabled/loading states, and subject-aware placeholders.
- `SourceCard` converts citations into concise evidence cards.
- `StudyContextPanel` shows the active subject, paper scope, latest sources, and question screenshots.
- `AIErrorCard` converts provider failures into safe, actionable student messages.
- `AIThinkingState` provides a lightweight animated response state.

## Errors and rate limits

Failed requests keep the student message in the thread and restore the typed prompt in the composer. Students see a friendly provider-busy card with Retry and Use Sources Only. Existing source evidence remains visible. Administrators can expand technical details and open AI diagnostics.

## Sources and screenshots

Verified citations render as cards rather than raw JSON. Question screenshots appear both with assistant evidence and in the context panel. Missing images use the message `Question screenshot not generated yet.`

## Mobile behavior

The chat remains the primary surface. Prompt chips scroll horizontally, the composer stays accessible at the bottom, and study context opens from the header as an overlay drawer.

## Admin behavior

Provider names, models, raw diagnostics, and technical errors remain restricted to admin/testing routes. Student-facing components never receive API keys.
