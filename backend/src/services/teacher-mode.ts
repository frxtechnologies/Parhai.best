export type AssistantMode = "teacher" | "hybrid" | "rag";

const RAG_INTENT = /\b(past papers?|marking schemes?|source lookup|sources?|citations?|which paper|what paper|question history|topic history|repeated questions?|appeared|how many questions?|uploaded (?:paper|resource)|paper\s*\d|variant\s*\d|20\d{2})\b/i;
const HYBRID_INTENT = /\b(explain|explanation|chapter|concept|understand|revision|revise|teach me|what is|what are|how does|why does|step by step|exam technique|exam tip|common mistakes?)\b/i;

const SUBJECT_ALIASES: Record<string, string[]> = {
  physics: ["physics"], chemistry: ["chemistry"], biology: ["biology"],
  "computer science": ["computer science", "computing"], mathematics: ["mathematics", "maths", "math"],
  english: ["english"], urdu: ["urdu"], islamiat: ["islamiat", "islamiyat"],
  "pakistan studies": ["pakistan studies", "pak studies"],
};

export function assistantModeFor(message: string): AssistantMode {
  if (RAG_INTENT.test(message)) return "rag";
  if (HYBRID_INTENT.test(message)) return "hybrid";
  return "teacher";
}

export function cambridgeTeacherName(subjectName: string) {
  const lower = subjectName.toLowerCase();
  if (lower.includes("math")) return "Cambridge Mathematics Teacher";
  for (const canonical of Object.keys(SUBJECT_ALIASES)) {
    if (SUBJECT_ALIASES[canonical]!.some((alias) => lower.includes(alias))) {
      return `Cambridge ${canonical.replace(/\b\w/g, (letter) => letter.toUpperCase())} Teacher`;
    }
  }
  return `Cambridge ${subjectName} Teacher`;
}

export function requestedOutsideSubject(message: string, activeSubject: string) {
  const lowerMessage = message.toLowerCase();
  const lowerActive = activeSubject.toLowerCase();
  const activeCanonical = Object.entries(SUBJECT_ALIASES).find(([, aliases]) => aliases.some((alias) => lowerActive.includes(alias)))?.[0];
  return Object.entries(SUBJECT_ALIASES).some(([canonical, aliases]) => canonical !== activeCanonical && aliases.some((alias) => new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "i").test(lowerMessage)));
}

export function finalizeTeacherAnswer(answer: string, sourceCount: number, mode: AssistantMode) {
  let normalized = answer.replace(/\[Source\s+(\d+)\]/gi, "[S$1]").trim();
  const allMarkers = [...normalized.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1]));
  normalized = normalized.replace(/\[S(\d+)\]/g, (marker, rawIndex: string) => {
    const index = Number(rawIndex);
    return index >= 1 && index <= sourceCount ? marker : "";
  }).replace(/[ \t]+\n/g, "\n").trim();
  const citedIndexes = [...new Set(allMarkers.filter((index) => index >= 1 && index <= sourceCount))];
  if (mode === "hybrid" && sourceCount > 0 && !citedIndexes.length) {
    normalized += "\n\n### Related Uploaded Evidence\n- Review the closest matching uploaded question or note: [S1]";
    citedIndexes.push(1);
  }
  return { answer: normalized, citedIndexes };
}
