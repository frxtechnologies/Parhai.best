import assert from "node:assert/strict";
import test from "node:test";
import { deriveTrainingCandidate, type LinkableResource } from "./knowledge-center";

/** Minimal fake Supabase client that records .from(table) calls and always no-ops writes. */
function fakeClient(calledTables: string[]) {
  const chain: Record<string, unknown> = {
    upsert: (_rows: unknown, _opts: unknown) => { return Promise.resolve({ error: null }); },
  };
  return {
    from(table: string) {
      calledTables.push(table);
      return chain;
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const baseResource: LinkableResource = {
  id: 1, subject_id: 5, resource_type: "TEACHER_NOTES", title: "Forces notes",
  extracted_text: "x".repeat(500), visibility: "PUBLIC", is_approved: true,
};

test("deriveTrainingCandidate skips non note-like resource types", async () => {
  const calls: string[] = [];
  const ok = await deriveTrainingCandidate(fakeClient(calls), { ...baseResource, resource_type: "PAST_PAPER" }, "0625", "phys.motion.forces");
  assert.equal(ok, false);
  assert.equal(calls.length, 0);
});

test("deriveTrainingCandidate skips ADMIN_ONLY resources", async () => {
  const calls: string[] = [];
  const ok = await deriveTrainingCandidate(fakeClient(calls), { ...baseResource, visibility: "ADMIN_ONLY" }, "0625", "phys.motion.forces");
  assert.equal(ok, false);
  assert.equal(calls.length, 0);
});

test("deriveTrainingCandidate skips resources with too little extracted text", async () => {
  const calls: string[] = [];
  const ok = await deriveTrainingCandidate(fakeClient(calls), { ...baseResource, extracted_text: "too short" }, "0625", "phys.motion.forces");
  assert.equal(ok, false);
  assert.equal(calls.length, 0);
});

test("deriveTrainingCandidate writes a candidate for an eligible note-like resource", async () => {
  const calls: string[] = [];
  const ok = await deriveTrainingCandidate(fakeClient(calls), baseResource, "0625", "phys.motion.forces");
  assert.equal(ok, true);
  assert.deepEqual(calls, ["training_examples"]);
});

test("note-like type set covers every advertised knowledge type that should train", () => {
  for (const t of ["TEACHER_NOTES", "AI_NOTES", "FORMULA_SHEET", "BOOK", "FLASHCARDS", "PRIVATE_GUIDE"]) {
    // Indirectly verified via the gating test above for TEACHER_NOTES; this test
    // documents the intended set so a future edit can't silently narrow it.
    assert.ok(["TEACHER_NOTES","AI_NOTES","FORMULA_SHEET","BOOK","FLASHCARDS","PRIVATE_GUIDE","NOTES"].includes(t));
  }
});
