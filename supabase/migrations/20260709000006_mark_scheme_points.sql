-- F5: structured mark-scheme points.
-- Stores the discrete marking criteria parsed from a scheme's answer text so the
-- Paper Checker can award marks against each point instead of a text blob.
alter table public.question_index
  add column if not exists marking_points jsonb;
