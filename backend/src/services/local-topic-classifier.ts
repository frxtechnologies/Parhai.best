/**
 * Local topic classification (Phase E) — inference for the Parhai-owned model,
 * with NO API call. Loads the trained Naive Bayes model from disk (cached) and
 * predicts masked to the subject's taxonomy. If no model has been trained yet it
 * returns null, so callers transparently fall back to the API teacher.
 */

import fs from "node:fs";
import path from "node:path";
import { TopicClassifierModel, type SerializedModel } from "./topic-classifier-model";
import { getSubjectTaxonomy } from "../data/taxonomy-registry";

export const MODEL_PATH = process.env.TOPIC_MODEL_PATH ?? path.join(process.cwd(), "models", "topic-classifier.json");

let cached: TopicClassifierModel | null | undefined; // undefined = not tried, null = absent

function loadModel(): TopicClassifierModel | null {
  if (cached !== undefined) return cached;
  try {
    cached = TopicClassifierModel.fromJSON(JSON.parse(fs.readFileSync(MODEL_PATH, "utf8")) as SerializedModel);
  } catch {
    cached = null;
  }
  return cached;
}

/** Force a reload (e.g. after (re)training). */
export function reloadLocalModel(): void {
  cached = undefined;
}

export function localModelAvailable(): boolean {
  return loadModel() !== null;
}

/** Classify with the local model, masked to the subject's subtopics. Null if unavailable. */
export function classifyLocally(text: string, subjectCode: string): { topicId: string; confidence: number } | null {
  const model = loadModel();
  if (!model) return null;
  const tax = getSubjectTaxonomy(subjectCode);
  if (!tax) return null;
  const allowed = tax.topics.filter((t) => t.level === 2).map((t) => t.id);
  const { topicId, confidence } = model.predict(text, allowed);
  return topicId ? { topicId, confidence } : null;
}
