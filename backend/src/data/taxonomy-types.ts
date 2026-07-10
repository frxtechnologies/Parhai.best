/**
 * Shared taxonomy type used by every subject's topic taxonomy.
 * IDs are PERMANENT once questions reference them — never rename or remove a node.
 * Level 1 = topic section (parent_id null); Level 2 = classifiable subtopic.
 */
export type TaxonomyTopic = {
  id: string;
  parent_id: string | null;
  level: 1 | 2;
  name: string;
  keywords: string[];
};
