export type DetectedResourceType =
  | "PAST_PAPER" | "MARKING_SCHEME" | "GRADE_THRESHOLD" | "EXAMINER_REPORT"
  | "SYLLABUS" | "NOTES" | "WORKSHEET" | "TOPICAL" | "OTHER";
export type DetectedSession = "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";
type Signal = { source: "filename" | "pdf"; field: string; value: string | number; confidence: number; evidence: string };

const sessionAliases: Array<[RegExp, DetectedSession]> = [
  [/\b(?:s\d{2}|may\s*\/?\s*june|may\s+june)\b/i, "MAY_JUNE"],
  [/\b(?:w\d{2}|oct\s*\/?\s*nov|october\s*\/?\s*november|oct\s+nov)\b/i, "OCT_NOV"],
  [/\b(?:m\d{2}|feb\s*\/?\s*mar|february\s*\/?\s*march|feb\s+mar)\b/i, "FEB_MAR"],
];
const typeAliases: Array<[RegExp, DetectedResourceType]> = [
  [/\b(?:ms|mark(?:ing)?\s*scheme)\b/i, "MARKING_SCHEME"],
  [/\b(?:qp|question\s*paper|past\s*paper)\b/i, "PAST_PAPER"],
  [/\b(?:gt|grade\s*thresholds?)\b/i, "GRADE_THRESHOLD"],
  [/\b(?:er|examiner(?:s|'s)?\s*report)\b/i, "EXAMINER_REPORT"],
  [/\b(?:sy|syllabus)\b/i, "SYLLABUS"],
  [/\b(?:topical\s*questions?)\b/i, "TOPICAL"],
  [/\b(?:worksheet)\b/i, "WORKSHEET"],
  [/\b(?:notes?|formula\s*sheet)\b/i, "NOTES"],
];
const knownSubjects: Record<string, string> = {
  "1123":"English Language","2058":"Islamiyat","2059":"Pakistan Studies","2210":"Computer Science",
  "2281":"Economics","4024": "Mathematics (Syllabus D)", "5054": "Physics","5070":"Chemistry","5090":"Biology",
  "7100":"Commerce","7115":"Business Studies","7707":"Accounting",
  "9609":"Business","9618":"Computer Science","9700":"Biology","9701":"Chemistry",
  "9702":"Physics","9706":"Accounting","9708":"Economics","9709":"Mathematics",
};
const knownLevels: Record<string, "O_LEVEL"|"A_LEVEL"> = {
  "1123":"O_LEVEL","2058":"O_LEVEL","2059":"O_LEVEL","2210":"O_LEVEL","2281":"O_LEVEL",
  "4024":"O_LEVEL","5054":"O_LEVEL","5070":"O_LEVEL","5090":"O_LEVEL","7100":"O_LEVEL",
  "7115":"O_LEVEL","7707":"O_LEVEL","9609":"A_LEVEL","9618":"A_LEVEL","9700":"A_LEVEL",
  "9701":"A_LEVEL","9702":"A_LEVEL","9706":"A_LEVEL","9708":"A_LEVEL","9709":"A_LEVEL",
 };

function yearFrom(value: string) {
  const n = Number(value);
  if (value.length === 4) return n >= 1980 && n <= 2100 ? n : null;
  return n <= 79 ? 2000 + n : 1900 + n;
}

function filenameSignals(fileName: string): Signal[] {
  const value = fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
  const output: Signal[] = [];
  const canonical = fileName.match(/(?:^|[^\d])(\d{4})_([swm])(\d{2})_(qp|ms|gt|er|sy|sp)(?:_(\d)(\d))?/i);
  if (canonical) {
    const [, code, session, yy, type, paper, variant] = canonical;
    output.push({ source: "filename", field: "syllabusCode", value: code!, confidence: 1, evidence: canonical[0] });
    output.push({ source: "filename", field: "year", value: yearFrom(yy!)!, confidence: 1, evidence: canonical[0] });
    output.push({ source: "filename", field: "session", value: ({ s: "MAY_JUNE", w: "OCT_NOV", m: "FEB_MAR" } as const)[session!.toLowerCase() as "s"|"w"|"m"], confidence: 1, evidence: canonical[0] });
    const mapped = type!.toLowerCase() === "qp" || type!.toLowerCase() === "sp" ? "PAST_PAPER"
      : type!.toLowerCase() === "ms" ? "MARKING_SCHEME"
        : type!.toLowerCase() === "gt" ? "GRADE_THRESHOLD"
          : type!.toLowerCase() === "er" ? "EXAMINER_REPORT" : "SYLLABUS";
    output.push({ source: "filename", field: "resourceType", value: mapped, confidence: 1, evidence: canonical[0] });
    if (paper) output.push({ source: "filename", field: "paperNumber", value: Number(paper), confidence: 1, evidence: canonical[0] });
    if (variant) output.push({ source: "filename", field: "variant", value: Number(variant), confidence: 1, evidence: canonical[0] });
    return output;
  }
  const code = value.match(/\b(\d{4})\b/)?.[1];
  if (code) output.push({ source: "filename", field: "syllabusCode", value: code, confidence: .9, evidence: code });
  const year = value.match(/\b(19\d{2}|20\d{2})\b/)?.[1];
  if (year) output.push({ source: "filename", field: "year", value: Number(year), confidence: .9, evidence: year });
  for (const [pattern, session] of sessionAliases) if (pattern.test(value)) { output.push({ source: "filename", field: "session", value: session, confidence: .85, evidence: value.match(pattern)?.[0] ?? "" }); break; }
  for (const [pattern, type] of typeAliases) if (pattern.test(value)) { output.push({ source: "filename", field: "resourceType", value: type, confidence: .85, evidence: value.match(pattern)?.[0] ?? "" }); break; }
  const paper = value.match(/\b(?:paper|p)\s*([1-9])\b/i)?.[1];
  if (paper) output.push({ source: "filename", field: "paperNumber", value: Number(paper), confidence: .85, evidence: `Paper ${paper}` });
  const variant = value.match(/\b(?:variant|v)\s*([1-9])\b/i)?.[1];
  if (variant) output.push({ source: "filename", field: "variant", value: Number(variant), confidence: .85, evidence: `Variant ${variant}` });
  if (/\bmath(?:s|ematics)?\b/i.test(value) && !code) output.push({ source: "filename", field: "subjectName", value: "Mathematics", confidence: .65, evidence: "Maths filename hint" });
  if (/\bphysics\b/i.test(value) && !code) output.push({ source: "filename", field: "subjectName", value: "Physics", confidence: .65, evidence: "Physics filename hint" });
  return output;
}

function pdfSignals(text: string): Signal[] {
  const value = text.slice(0, 24000).replace(/\s+/g, " ");
  const output: Signal[] = [];
  const code = value.match(/\b(?:syllabus|paper)\s*(?:code)?\s*(\d{4})\b/i)?.[1] ?? value.match(/\b(4024|5054|0620|0610|9709|9702|9701)\b/)?.[1];
  if (code) output.push({ source: "pdf", field: "syllabusCode", value: code, confidence: .95, evidence: code });
  const year = value.match(/\b(19\d{2}|20\d{2})\b/)?.[1];
  if (year) output.push({ source: "pdf", field: "year", value: Number(year), confidence: .9, evidence: year });
  for (const [pattern, session] of sessionAliases) if (pattern.test(value)) { output.push({ source: "pdf", field: "session", value: session, confidence: .95, evidence: value.match(pattern)?.[0] ?? "" }); break; }
  for (const [pattern, type] of typeAliases) if (pattern.test(value)) { output.push({ source: "pdf", field: "resourceType", value: type, confidence: .95, evidence: value.match(pattern)?.[0] ?? "" }); break; }
  const compact = value.match(/\b(\d{4})\/(\d)(\d)\b/);
  const paper = compact?.[2] ?? value.match(/\bPaper\s+([1-9])\b/i)?.[1];
  const variant = compact?.[3] ?? value.match(/\bVariant\s+([1-9])\b/i)?.[1];
  if (paper) output.push({ source: "pdf", field: "paperNumber", value: Number(paper), confidence: compact ? .98 : .9, evidence: compact?.[0] ?? `Paper ${paper}` });
  if (variant) output.push({ source: "pdf", field: "variant", value: Number(variant), confidence: compact ? .98 : .85, evidence: compact?.[0] ?? `Variant ${variant}` });
  return output;
}

export function detectResourceMetadata(fileName: string, firstPagesText = "") {
  const signals = [...filenameSignals(fileName), ...pdfSignals(firstPagesText)];
  const fields = ["syllabusCode","year","session","paperNumber","variant","resourceType"] as const;
  const metadata: Record<string, string|number|null> = {};
  const fieldConfidence: Record<string, number> = {};
  const conflicts: string[] = [];
  for (const field of fields) {
    const candidates = signals.filter((item) => item.field === field);
    const best = candidates.sort((a,b)=>b.confidence-a.confidence)[0];
    metadata[field] = best?.value ?? null;
    fieldConfidence[field] = best ? Math.round(best.confidence * 100) : 0;
    const values = [...new Set(candidates.map((item)=>String(item.value)))];
    if (values.length > 1) conflicts.push(`${field} conflict: filename/PDF signals suggest ${values.join(" and ")}.`);
  }
  const code = String(metadata.syllabusCode ?? "");
  metadata.subjectName = knownSubjects[code] ?? signals.find((item)=>item.field==="subjectName")?.value ?? null;
  const explicitLevel=/\b(?:AS\s*(?:&|and|\/)\s*A|AS\s+Level|A\s+Level)\b/i.test(firstPagesText)?"A_LEVEL"
    :/\bO\s+Level\b/i.test(firstPagesText)?"O_LEVEL":null;
  metadata.level=explicitLevel??knownLevels[code]??null;
  const warnings: string[] = [];
  if (code && !knownSubjects[code]) warnings.push(`Unknown syllabus code ${code}. Map it to an O Level or AS/A Level subject before import.`);
  const requiresPaper = ["PAST_PAPER","MARKING_SCHEME"].includes(String(metadata.resourceType));
  for (const field of ["syllabusCode","year","session","resourceType",...(requiresPaper?["paperNumber","variant"]:[])]) {
    if (metadata[field] == null) warnings.push(`Could not detect ${field.replace(/([A-Z])/g," $1").toLowerCase()}. Please select it manually.`);
  }
  const scored = Object.values(fieldConfidence).filter(Boolean);
  const overall = scored.length ? Math.round(scored.reduce((a,b)=>a+b,0) / Math.max(fields.length, requiresPaper ? 6 : 4)) : 0;
  const status = conflicts.length ? "Conflict" : warnings.length || overall < 80 ? "Needs Review" : "Ready";
  return {
    metadata, fieldConfidence, confidence: overall, confidenceLabel: overall >= 85 ? "high" : overall >= 60 ? "medium" : "low",
    status, warnings, conflicts, signals, textSnippet: firstPagesText.replace(/\s+/g," ").slice(0,500),
    normalizedPaperCode: code && metadata.year && metadata.session && metadata.resourceType
      ? `${code}_${metadata.session === "MAY_JUNE" ? "s" : metadata.session === "OCT_NOV" ? "w" : "m"}${String(metadata.year).slice(-2)}_${metadata.resourceType === "PAST_PAPER" ? "qp" : metadata.resourceType === "MARKING_SCHEME" ? "ms" : String(metadata.resourceType).toLowerCase()}${metadata.paperNumber && metadata.variant ? `_${metadata.paperNumber}${metadata.variant}` : ""}`
      : null,
  };
}
