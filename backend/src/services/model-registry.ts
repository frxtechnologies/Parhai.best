/**
 * Model Registry + eval gate (Phase F).
 *
 * Governs which trained model is live. A candidate is promoted only if it beats
 * the active model on its primary metric ("deploy only improvements"); the old
 * active is archived so any version can be rolled back to. DB ops are graceful:
 * if the registry table isn't present yet, training still works and just skips
 * registration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

export type ModelMetrics = { accuracy: number; [k: string]: unknown };

export type RegistryRow = {
  id: number;
  model_key: string;
  version: string;
  status: string;
  metrics: ModelMetrics;
  artifact: string | null;
  train_size: number | null;
  activated_at: string | null;
};

/**
 * The eval gate. Promote the candidate iff it's the first model or it does not
 * regress the incumbent's primary metric. Deterministic and explainable.
 */
export function shouldPromote(candidate: ModelMetrics, active: ModelMetrics | null): boolean {
  if (!active) return true;
  return candidate.accuracy >= active.accuracy;
}

export async function getActiveModel(client: SupabaseClient, modelKey: string): Promise<RegistryRow | null> {
  const { data, error } = await client
    .from("model_registry")
    .select("id,model_key,version,status,metrics,artifact,train_size,activated_at")
    .eq("model_key", modelKey)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) return null; // table missing or no active model
  return (data as RegistryRow) ?? null;
}

export type RegisterResult =
  | { ok: true; promoted: boolean; reason: string; activeVersion: string | null }
  | { ok: false; reason: string };

/**
 * Register a freshly trained model as a candidate and run the eval gate. On
 * promotion, archive the previous active and mark this one active.
 */
export async function registerAndGate(
  client: SupabaseClient,
  input: { modelKey: string; version: string; metrics: ModelMetrics; artifact: string; trainSize: number; notes?: string },
): Promise<RegisterResult> {
  const active = await getActiveModel(client, input.modelKey);
  const promote = shouldPromote(input.metrics, active?.metrics ?? null);

  const insert = await client.from("model_registry").insert({
    model_key: input.modelKey,
    version: input.version,
    status: promote ? "active" : "rejected",
    metrics: input.metrics,
    artifact: input.artifact,
    train_size: input.trainSize,
    notes: input.notes ?? null,
    activated_at: promote ? new Date().toISOString() : null,
  }).select("id").single();
  if (insert.error) return { ok: false, reason: `registry unavailable: ${insert.error.message}` };

  if (promote && active) {
    await client.from("model_registry").update({ status: "archived" }).eq("id", active.id);
  }
  return {
    ok: true,
    promoted: promote,
    reason: promote
      ? active ? `beat active (${input.metrics.accuracy} >= ${active.metrics.accuracy})` : "first model"
      : `rejected: did not beat active (${input.metrics.accuracy} < ${active!.metrics.accuracy})`,
    activeVersion: promote ? input.version : active?.version ?? null,
  };
}

/** Roll back: make a specific archived version active again. */
export async function rollbackTo(client: SupabaseClient, modelKey: string, version: string): Promise<RegisterResult> {
  const target = await client.from("model_registry").select("id").eq("model_key", modelKey).eq("version", version).maybeSingle();
  if (target.error || !target.data) return { ok: false, reason: "version not found" };
  const active = await getActiveModel(client, modelKey);
  if (active) await client.from("model_registry").update({ status: "archived" }).eq("id", active.id);
  const { error } = await client.from("model_registry").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", (target.data as { id: number }).id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, promoted: true, reason: `rolled back to ${version}`, activeVersion: version };
}

/** Write the active model's artifact to disk so the sync local classifier can load it. */
export async function syncActiveModelToDisk(client: SupabaseClient, modelKey: string, filePath: string): Promise<boolean> {
  const active = await getActiveModel(client, modelKey);
  if (!active?.artifact) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, active.artifact);
  return true;
}
