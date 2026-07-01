# AI Tutor UI Polish Report

## Files changed

- `frontend/src/components/layout/app-layout.tsx`
- `frontend/src/components/ai-tutor/ai-message.tsx`
- `frontend/src/components/ai-tutor/source-card.tsx`
- `frontend/src/components/ai-tutor/study-context-panel.tsx`

## Layout

The AI Tutor route now opts out of the general dashboard width cap and uses the
available desktop width for its main workspace and 340px context column.
Existing tablet drawer and mobile stacking behavior remain intact.

## Source cards

- Short Cambridge citation title without filenames.
- Consistent 144px preview area.
- Full preview opens in a new tab.
- Compact badges and existing PDF, preview, Explain and marking-scheme actions.
- Additional next-action buttons appear after results.

## Student and admin views

Diagnostics are no longer inferred from the user's admin email. Source cards
show them only when an explicit `adminDebug` prop is enabled. The normal AI
Tutor never enables that mode, so students and routine admin browsing receive
the same clean source card. Dedicated admin tooling remains available.

## Answer presentation

When the highlighted Teacher Tip panel is present, the plain Teacher Tip
heading and its following paragraph are suppressed. This removes duplicate
tips without changing stored AI answers.

## Right panel

The existing context panel now exposes compact Year, Session, Paper, Variant
and Difficulty controls, a marking-scheme toggle, detected topics and five
study actions. These controls are UI refinements and do not alter backend
retrieval.

## Remaining improvements

The refinement controls can be wired to a future approved client-side filter
state. Bookmark persistence and in-page preview zoom would require additional
product behavior and were intentionally not added in this polish-only pass.
