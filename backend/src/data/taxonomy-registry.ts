/**
 * Taxonomy registry — the single source of truth mapping a subject code to its
 * fixed topic taxonomy. Adding a new subject is a one-line change here plus a
 * taxonomy data file; the classifier, retrieval, and admin tools pick it up
 * automatically. This is what makes topic classification a SYSTEM rather than a
 * physics special-case.
 */

import type { TaxonomyTopic } from "./taxonomy-types";
import { PHYSICS_0625_TAXONOMY } from "./physics-taxonomy";
import { MATH_4024_TAXONOMY } from "./math-4024-taxonomy";
import { CHEMISTRY_5070_TAXONOMY } from "./chemistry-5070-taxonomy";

export type { TaxonomyTopic };

export type SubjectTaxonomy = {
  subjectCode: string;
  /** Human label used in the closed-set classifier prompt. */
  label: string;
  topics: TaxonomyTopic[];
};

export const TAXONOMY_REGISTRY: Record<string, SubjectTaxonomy> = {
  "0625": { subjectCode: "0625", label: "Cambridge IGCSE Physics (0625)", topics: PHYSICS_0625_TAXONOMY },
  // O Level Physics (5054) shares the same physics topic structure as IGCSE 0625.
  "5054": { subjectCode: "5054", label: "Cambridge O Level Physics (5054)", topics: PHYSICS_0625_TAXONOMY },
  "4024": { subjectCode: "4024", label: "Cambridge O Level Mathematics — Syllabus D (4024)", topics: MATH_4024_TAXONOMY },
  "5070": { subjectCode: "5070", label: "Cambridge O Level Chemistry (5070)", topics: CHEMISTRY_5070_TAXONOMY },
};

/** Every taxonomy topic across all subjects (deduplicated by id — physics is shared). */
export const ALL_TAXONOMY_TOPICS: TaxonomyTopic[] = (() => {
  const byId = new Map<string, TaxonomyTopic>();
  for (const entry of Object.values(TAXONOMY_REGISTRY)) {
    for (const topic of entry.topics) byId.set(topic.id, topic);
  }
  return [...byId.values()];
})();

const ALL_BY_ID = new Map(ALL_TAXONOMY_TOPICS.map((t) => [t.id, t]));
const VALID_SUBTOPIC_IDS = new Set(ALL_TAXONOMY_TOPICS.filter((t) => t.level === 2).map((t) => t.id));

export function hasTaxonomy(subjectCode: string): boolean {
  return subjectCode in TAXONOMY_REGISTRY;
}

export function getSubjectTaxonomy(subjectCode: string): SubjectTaxonomy | null {
  return TAXONOMY_REGISTRY[subjectCode] ?? null;
}

/** Valid level-2 (classifiable) subtopic id, across every subject. */
export function isValidSubtopicId(id: string): boolean {
  return VALID_SUBTOPIC_IDS.has(id);
}

/** Parent (level-1) id of a subtopic, e.g. "math.algebra.quadratics" → "math.algebra". */
export function parentTopicId(id: string): string | null {
  return ALL_BY_ID.get(id)?.parent_id ?? null;
}

export function getTopicName(id: string): string | null {
  return ALL_BY_ID.get(id)?.name ?? null;
}
