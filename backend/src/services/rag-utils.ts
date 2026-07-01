const TOPIC_ALIASES: Record<string, string[]> = {
  electricity: [
    "electric",
    "current",
    "voltage",
    "resistance",
    "circuit",
    "charge",
  ],
  light: [
    "optics",
    "lens",
    "lenses",
    "refraction",
    "reflection",
    "mirror",
    "ray",
  ],
  waves: ["wave", "frequency", "wavelength", "oscillation"],
  motion: ["kinematics", "speed", "velocity", "acceleration", "distance"],
  forces: ["force", "moment", "pressure", "mass", "weight", "momentum"],
  energy: [
    "work",
    "work energy and power",
    "energy transfer",
    "kinetic energy",
    "gravitational potential energy",
    "efficiency",
    "power",
  ],
  magnetism: ["magnet", "induction", "transformer"],
  "thermal physics": ["thermal", "heat", "temperature", "gas"],
  "atomic physics": ["atomic", "radioactivity", "radiation", "nucleus"],
  "circle geometry": [
    "circle",
    "circles",
    "circle theorem",
    "circle theorems",
    "cyclic quadrilateral",
    "tangent",
    "chord",
    "radius",
    "diameter",
    "arc",
    "sector",
  ],
  algebra: [
    "equation",
    "equations",
    "factorise",
    "factorize",
    "expression",
    "expressions",
  ],
  trigonometry: ["trig", "sine", "cosine", "bearing", "bearings"],
};

const TYPO_NORMALIZATION: Record<string, string> = {
  ciruces: "circles",
  circels: "circles",
  cirlces: "circles",
};

const STOP_WORDS = new Set([
  "about",
  "all",
  "and",
  "answer",
  "appeared",
  "can",
  "explain",
  "find",
  "from",
  "give",
  "how",
  "many",
  "paper",
  "papers",
  "please",
  "question",
  "questions",
  "show",
  "tell",
  "the",
  "this",
  "what",
  "which",
  "with",
  "year",
  "physics",
  "chemistry",
  "biology",
  "level",
  "student",
  "according",
  "uploaded",
  "resources",
  "me",
  "in",
  "of",
  "on",
  "for",
  "a",
  "an",
  "to",
  "is",
  "are",
  "was",
  "were",
]);

export function expandSearchTerms(message: string) {
  const words = [
    ...new Set(
      message
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .map((word) => TYPO_NORMALIZATION[word] ?? word),
    ),
  ].filter(
    (word) =>
      word.length >= 3 && !STOP_WORDS.has(word) && !/^20\d{2}$/.test(word),
  );
  const expanded = new Set(words);
  for (const [topic, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (
      words.includes(topic) ||
      aliases.some((alias) => words.includes(alias))
    ) {
      expanded.add(topic);
      aliases.forEach((alias) => expanded.add(alias));
    }
  }
  return [...expanded].slice(0, 24);
}

export function canonicalTopic(topic: string) {
  const value = topic.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (value === canonical || aliases.includes(value))
      return canonical.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return topic.trim().replace(/\s+/g, " ") || "General";
}

export function fallbackTopicForSubject(text: string, subject: string) {
  const value = text.toLowerCase();
  const subjectName = subject.toLowerCase();
  if (subjectName.includes("physics")) {
    for (const [topic, aliases] of Object.entries(TOPIC_ALIASES)) {
      if ([topic, ...aliases].some((term) => value.includes(term)))
        return canonicalTopic(topic);
    }
    return "General Physics";
  }
  if (subjectName.includes("chem"))
    return /organic|alkane|alcohol/.test(value)
      ? "Organic Chemistry"
      : /acid|base|salt/.test(value)
        ? "Acids, Bases and Salts"
        : "General Chemistry";
  if (subjectName.includes("bio"))
    return /cell|membrane|mitosis/.test(value)
      ? "Cells"
      : /gene|inherit|dna/.test(value)
        ? "Genetics"
        : "General Biology";
  if (subjectName.includes("math"))
    return /triangle|circle|angle|shape/.test(value)
      ? "Geometry"
      : /equation|factor|algebra/.test(value)
        ? "Algebra"
        : "General Mathematics";
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
  return String(value ?? "")
    .replace("MAY_JUNE", "May/June")
    .replace("OCT_NOV", "Oct/Nov")
    .replace("FEB_MAR", "Feb/March");
}

export function formatCitation(
  subject: { name: string; code?: string },
  metadata: CitationMetadata,
) {
  const parts = [`${subject.name}${subject.code ? ` ${subject.code}` : ""}`];
  if (metadata.session) parts.push(sessionLabel(metadata.session));
  if (metadata.year) parts.push(String(metadata.year));
  if (metadata.paperCode) parts.push(`Paper ${String(metadata.paperCode)}`);
  else if (metadata.paperNumber)
    parts.push(`Paper ${String(metadata.paperNumber)}`);
  if (metadata.variant) parts.push(`Variant ${String(metadata.variant)}`);
  if (metadata.questionNumber)
    parts.push(`Question ${String(metadata.questionNumber)}`);
  if (metadata.sourceFile) parts.push(`File: ${String(metadata.sourceFile)}`);
  else if (metadata.title) parts.push(String(metadata.title));
  return parts.join(" · ");
}

export type RankableSource = {
  content: string;
  reference: string;
  metadata: Record<string, unknown>;
};

export type RequestedTopic = {
  topic: string;
  subtopics: string[];
  keywords: string[];
};

export function detectRequestedTopic(
  message: string,
  subjectCode: string,
): RequestedTopic | null {
  const value = message.toLowerCase();
  if (subjectCode === "5054") {
    if (
      /\b(light|optics|lens(?:es)?|image formation|reflection|total internal reflection|critical angle|refractive index|refract(?:ion|ed|s)?|ray diagram|light ray)\b/.test(
        value,
      )
    ) {
      return {
        topic: "Light",
        subtopics: [
          "Lenses and Image Formation",
          "Reflection",
          "Refraction",
          "Total Internal Reflection",
          "Critical Angle",
          "Ray Diagrams",
        ],
        keywords: [
          "light",
          "lens",
          "image formation",
          "reflection",
          "refraction",
          "refract",
          "total internal reflection",
          "critical angle",
          "refractive index",
          "ray diagram",
          "light ray",
        ],
      };
    }
    if (
      /\b(energy|work done|kinetic energy|gravitational potential energy|power|efficiency|energy transfer)\b/.test(
        value,
      )
    ) {
      return {
        topic: "Energy",
        subtopics: [],
        keywords: [
          "energy",
          "work done",
          "kinetic energy",
          "gravitational potential energy",
          "power",
          "efficiency",
          "energy transfer",
        ],
      };
    }
    if (
      /\b(current|voltage|resistance|circuit|resistor|electrical energy)\b/.test(
        value,
      )
    ) {
      return {
        topic: "Electricity",
        subtopics: [],
        keywords: [
          "current",
          "voltage",
          "resistance",
          "circuit",
          "resistor",
          "power in circuit",
          "electrical energy",
        ],
      };
    }
    if (
      /\b(motion graph|distance.time|speed.time|velocity.time)\b/.test(value)
    ) {
      return {
        topic: "Motion",
        subtopics: [],
        keywords: ["graph", "distance time", "speed time", "velocity time"],
      };
    }
  }
  if (subjectCode === "4024") {
    if (
      /\b(circle|circles|ciruces|circle theorem|tangent|chord|cyclic quadrilateral|alternate segment|angle at (?:the )?(?:centre|center|circumference))\b/.test(
        value,
      )
    ) {
      return {
        topic: "Geometry",
        subtopics: ["Circle Theorems"],
        keywords: [
          "circle",
          "circle theorem",
          "tangent",
          "chord",
          "cyclic quadrilateral",
          "alternate segment",
          "angle at centre",
          "angle at circumference",
        ],
      };
    }
    if (
      /\b(graph|curve|grid|coordinate axes|y\s*=|f\s*\(|gradient|intercept|equation of (?:a|the) line|function)\b/.test(
        value,
      )
    ) {
      return {
        topic: "Graphs and Functions",
        subtopics: [],
        keywords: [
          "graph",
          "curve",
          "grid",
          "coordinate axes",
          "gradient",
          "intercept",
          "equation of line",
          "function",
        ],
      };
    }
    if (/\b(algebra|equation|factorise|factorize|expression)\b/.test(value)) {
      return {
        topic: "Algebra",
        subtopics: [],
        keywords: [
          "algebra",
          "equation",
          "factorise",
          "factorize",
          "expression",
        ],
      };
    }
  }
  return null;
}

export function rankEvidence<T extends RankableSource>(
  sources: T[],
  terms: string[],
  maxSources = 12,
) {
  const hardestIntent = terms.some((term) =>
    ["hard", "hardest", "difficult", "challenging"].includes(term),
  );
  return sources
    .map((source, order) => {
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
      const requestedCanonicalTopics = terms
        .map(canonicalTopic)
        .map((term) => term.toLowerCase())
        .filter((term) => Object.keys(TOPIC_ALIASES).includes(term));
      if (
        requestedCanonicalTopics.length &&
        topic &&
        !requestedCanonicalTopics.some((requested) => topic.includes(requested))
      )
        score -= 20;
      if (source.metadata.studentVerified === true) score += 5;
      if (
        ["linked", "partial"].includes(
          String(source.metadata.markingSchemeLinkStatus),
        )
      )
        score += 3;
      if (source.metadata.questionNumber) score += 1;
      if (hardestIntent && source.metadata.questionNumber) {
        const marks = Number(source.metadata.marks ?? 0);
        const questionNumber = String(source.metadata.questionNumber);
        const confidence = Number(source.metadata.confidence ?? 0);
        const demanding =
          /\b(explain|calculate|determine|show that|graph|plot|table|deduce|describe)\b/i.test(
            source.content,
          );
        score += Math.min(marks, 15) * 2.5;
        if (String(source.metadata.difficulty).toUpperCase() === "HARD")
          score += 12;
        if (/[a-z]|\(|\)/i.test(questionNumber)) score += 5;
        if (demanding) score += 5;
        score += confidence * 3;
        if (marks <= 1) score -= 18;
        if (source.metadata.sourcePage) score += 1;
      }
      return { source, score, order };
    })
    .filter((entry) => !terms.length || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.min(maxSources, 12))
    .map((entry) => entry.source);
}

export function formatQuestionResultSummary(
  totalMatches: number,
  duplicatesRemoved: number,
  displayedCount: number,
) {
  const safeTotal = Math.max(0, totalMatches);
  const safeRemoved = Math.max(0, Math.min(duplicatesRemoved, safeTotal));
  const safeDisplayed = Math.max(
    0,
    Math.min(displayedCount, safeTotal - safeRemoved),
  );
  return `Found ${safeTotal} possible match${safeTotal === 1 ? "" : "es"}. Removed ${safeRemoved} repeated/similar question${safeRemoved === 1 ? "" : "s"}. Showing the ${safeDisplayed} best result${safeDisplayed === 1 ? "" : "s"}.`;
}

export function finalizeGroundedAnswer(
  answer: string,
  sourceCount: number,
  missingMessage: string,
) {
  const normalized = answer.replace(/\[Source\s+(\d+)\]/gi, "[S$1]").trim();
  if (
    !normalized ||
    /outside knowledge|general knowledge|not (?:in|from) the (?:provided|supplied) sources/i.test(
      normalized,
    )
  ) {
    return { answer: missingMessage, citedIndexes: [] as number[] };
  }
  const markers = [...normalized.matchAll(/\[S(\d+)\]/g)].map((match) =>
    Number(match[1]),
  );
  const citedIndexes = [
    ...new Set(markers.filter((index) => index >= 1 && index <= sourceCount)),
  ];
  if (
    !citedIndexes.length ||
    markers.some((index) => index < 1 || index > sourceCount)
  )
    return { answer: missingMessage, citedIndexes: [] as number[] };
  return { answer: normalized, citedIndexes };
}
