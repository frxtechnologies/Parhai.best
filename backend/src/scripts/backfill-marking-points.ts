/**
 * Backfill F5 marking points onto pre-existing linked answers (F5 fix).
 *
 * F5's deterministic mark-scheme parser only ran inside linkAnswerRows during
 * FRESH ingestion — questions linked to an answer before F5 shipped never got
 * marking_points populated, so the Paper Checker still marks those against a
 * raw text blob instead of discrete criteria. This closes that gap. Zero AI
 * cost (parseMarkingPoints is pure regex/string logic) and fully idempotent —
 * only touches rows with answer_text set and marking_points still null unless
 * --force is passed.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-marking-points.ts
 *   npx tsx src/scripts/backfill-marking-points.ts --force --limit 500 --dry-run
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. No AI key needed.
 */

import { createClient } from "@supabase/supabase-js";
import { parseMarkingPoints, isReliableMarkingSchemeText } from "../services/mark-scheme-parser";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");
const argVal = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
const LIMIT = Number(argVal("--limit") ?? 0) || 100_000;
const BATCH = 500;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

type Row = { id: number; answer_text: string; total_marks: number | null; marks: number | null };

async function run() {
  console.log(`[backfill-marking-points] force=${FORCE} dry-run=${DRY_RUN} limit=${LIMIT}`);

  // Keyset (id-cursor) pagination, NOT offset-based: in the default (non-force)
  // mode this loop filters on marking_points IS NULL while ALSO writing
  // marking_points inside the same loop, so the matching set shrinks as it
  // goes. Offset pagination over a shrinking filtered set skips rows (the
  // bug this replaced — a live run silently stopped at 1500/2564 scanned).
  // Advancing a strictly-increasing `id > lastId` cursor is immune to that:
  // it never depends on how many rows currently match the filter.
  let lastId = 0, processed = 0, updated = 0, emptyResult = 0, skippedContaminated = 0;
  while (processed < LIMIT) {
    const take = Math.min(BATCH, LIMIT - processed);
    let query = supabase
      .from("question_index")
      .select("id,answer_text,total_marks,marks")
      .not("answer_text", "is", null)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(take);
    if (!FORCE) query = query.is("marking_points", null);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id;

    for (const row of rows) {
      // Sanity gate FIRST: never promote PDF boilerplate or multi-question bleed
      // into structured "ground truth" marking_points the Paper Checker trusts.
      if (!isReliableMarkingSchemeText(row.answer_text)) { skippedContaminated++; continue; }
      const points = parseMarkingPoints(row.answer_text, row.total_marks ?? row.marks);
      if (points.length === 0) { emptyResult++; continue; }
      if (!DRY_RUN) {
        const { error: updateError } = await supabase.from("question_index").update({ marking_points: points }).eq("id", row.id);
        if (updateError) { console.error(`[backfill-marking-points] row ${row.id} write error:`, updateError.message); continue; }
      }
      updated++;
    }

    processed += rows.length;
    console.log(`[backfill-marking-points] ${updated} parsed (scanned ${processed}, ${emptyResult} empty, ${skippedContaminated} skipped as unreliable)`);
    if (rows.length < take) break;
  }

  console.log(`[backfill-marking-points] Done — ${updated} rows updated, ${emptyResult} had no parseable marking points, ${skippedContaminated} skipped as unreliable (boilerplate/oversized), ${processed} scanned total.`);
  if (skippedContaminated > 0) {
    console.log(`[backfill-marking-points] The ${skippedContaminated} skipped rows likely have contaminated answer_text from the original extraction — worth a separate re-extraction pass, not something this parser should paper over.`);
  }
}

run().catch((err) => { console.error("[backfill-marking-points] Fatal:", err); process.exit(1); });
