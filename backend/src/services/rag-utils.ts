const TOPIC_ALIASES: Record<string, string[]> = {
  electricity: ["electric", "current", "voltage", "resistance", "circuit", "charge"],
  light: ["optics", "lens", "lenses", "refraction", "reflection", "mirror", "ray"],
  waves: ["wave", "frequency", "wavelength", "oscillation"],
  motion: ["kinematics", "speed", "velocity", "acceleration", "distance"],
  forces: ["force", "moment", "pressure", "mass", "weight", "momentum"],
  energy: ["work", "power", "efficiency"],
  magnetism: ["magnet", "induction", "transformer"],
  "thermal physics": ["thermal", "heat", "temperature", "gas"],
  "atomic physics": ["atomic", "radioactivity", "radiation", "nucleus"],
};

const STOP_WORDS = new Set([
  "about", "all", "and", "answer", "appeared", "can", "explain", "find", "from", "give", "how", "many",
  "paper", "papers", "please", "question", "questions", "show", "tell", "the", "this", "what", "which",
  "with", "year", "physics", "chemistry", "biology", "level", "student", "according", "uploaded", "resources",
  "me", "in", "of", "on", "for", "a", "an", "to", "is", "are", "was", "were",
]);

export function expandSearchTerms(message: string) {
  const words = [...new Set(message.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/))]
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^20\d{2}$/.test(word));
  const expanded = new Set(words);
  for (const [topic, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (words.includes(topic) || aliases.some((alias) => words.includes(alias))) {
      expanded.add(topic);
      aliases.forEach((alias) => expanded.add(alias));
    }
  }
  return [...expanded].slice(0, 12);
}

export function canonicalTopic(topic: string) {
  const value = topic.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (value === canonical || aliases.includes(value)) return canonical.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return topic.trim().replace(/\s+/g, " ") || "General";
}

export function fallbackTopicForSubject(text: string, subject: string) {
  const value = text.toLowerCase();
  const subjectName = subject.toLowerCase();
  if (subjectName.includes("physics")) {
    for (const [topic, aliases] of Object.entries(TOPIC_ALIASES)) {
      if ([topic, ...aliases].some((term) => value.includes(term))) return canonicalTopic(topic);
    }
    return "General Physics";
  }
  if (subjectName.includes("chem")) return /organic|alkane|alcohol/.test(value) ? "Organic Chemistry" : /acid|base|salt/.test(value) ? "Acids, Bases and Salts" : "General Chemistry";
  if (subjectName.includes("bio")) return /cell|membrane|mitosis/.test(value) ? "Cells" : /gene|inherit|dna/.test(value) ? "Genetics" : "General Biology";
  if (subjectName.includes("math")) return /triangle|circle|angle|shape/.test(value) ? "Geometry" : /equation|factor|algebra/.test(value) ? "Algebra" : "General Mathematics";
  return `General ${subject}`;
}

export type CitationMetadata = {
  title?: unknown;
  sourceFile?: unknown;
  year?: unknown;
  session?: unknown;
  paperCode?: unknown;
  paperNumber?: unknown;
  variant?: unknown;
  questionNumber?: unknown;
};

function sessionLabel(value: unknown) {
  return String(value ?? "").replace("MAY_JUNE", "May/June").replace("OCT_NOV", "Oct/Nov").replace("FEB_MAR", "Feb/March");
}

export function formatCitation(subject: { name: string; code?: string }, metadata: CitationMetadata) {
  const parts = [`${subject.name}${subject.code ? ` ${subject.code}` : ""}`];
  if (metadata.session) parts.push(sessionLabel(metadata.session));
  if (metadata.year) parts.push(String(metadata.year));
  if (metadata.paperCode) parts.push(`Paper ${String(metadata.paperCode)}`);
  else if (metadata.paperNumber) parts.push(`Paper ${String(metadata.paperNumber)}`);
  if (metadata.variant) parts.push(`Variant ${String(metadata.variant)}`);
  if (metadata.questionNumber) parts.push(`Question ${String(metadata.questionNumber)}`);
  if (metadata.sourceFile) parts.push(`File: ${String(metadata.sourceFile)}`);
  else if (metadata.title) parts.push(String(metadata.title));
  return parts.join(" · ");
}

export type RankableSource = { content: string; reference: string; metadata: Record<string, unknown> };

export function rankEvidence<T extends RankableSource>(sources: T[], terms: string[], maxSources = 12) {
  return sources.map((source, order) => {
    const topic = String(source.metadata.topic ?? "").toLowerCase();
    const subtopic = String(source.metadata.subtopic ?? "").toLowerCase();
    const content = source.content.toLowerCase();
    const reference = source.reference.toLowerCase();
    let score = Number(source.metadata.similarity ?? 0) * 6;
    for (const term of terms) {
      if (topic === term) score += 12;
      else if (topic.includes(term)) score += 8;
      if (subtopic.includes(term)) score += 6;
      if (content.includes(term)) score += 3;
      if (reference.includes(term)) score += 2;
    }
    if (source.metadata.questionNumber) score += 1;
    return { source, score, order };
  }).filter((entry) => !terms.length || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.min(maxSources, 12))
    .map((entry) => entry.source);
}

export function finalizeGroundedAnswer(answer: string, sourceCount: number, missingMessage: string) {
  const normalized = answer.replace(/\[Source\s+(\d+)\]/gi, "[S$1]").trim();
  if (!normalized || /outside knowledge|general knowledge|not (?:in|from) the (?:provided|supplied) sources/i.test(normalized)) {
    return { answer: missingMessage, citedIndexes: [] as number[] };
  }
  const markers = [...normalized.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1]));
  const citedIndexes = [...new Set(markers.filter((index) => index >= 1 && index <= sourceCount))];
  if (!citedIndexes.length || markers.some((index) => index < 1 || index > sourceCount)) return { answer: missingMessage, citedIndexes: [] as number[] };
  return { answer: normalized, citedIndexes };
}
