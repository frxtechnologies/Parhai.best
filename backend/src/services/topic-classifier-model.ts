/**
 * Parhai Topic Classifier (Phase E) — the first model Parhai OWNS.
 *
 * A dependency-free Multinomial Naive Bayes text classifier in pure TypeScript.
 * Trains on labeled questions and runs entirely on CPU with NO API call at
 * inference — the first concrete step toward making commercial APIs optional.
 * The class space is the taxonomy's level-2 subtopics; prediction is masked to
 * the query's subject so it can never return another subject's topic.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were", "be",
  "this", "that", "these", "those", "it", "its", "with", "as", "by", "at", "from", "which", "what",
  "state", "explain", "describe", "calculate", "find", "show", "give", "using", "use", "following",
  "question", "answer", "diagram", "figure", "shown", "below", "above", "student",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export type TrainingLabel = { text: string; topicId: string };

export type SerializedModel = {
  version: string;
  createdAt: string;
  classes: string[];
  classDocCount: Record<string, number>;
  classTokenTotal: Record<string, number>;
  classTokenFreq: Record<string, Record<string, number>>;
  vocabSize: number;
  totalDocs: number;
};

export class TopicClassifierModel {
  private classes = new Set<string>();
  private classDocCount: Record<string, number> = {};
  private classTokenTotal: Record<string, number> = {};
  private classTokenFreq: Record<string, Record<string, number>> = {};
  private vocab = new Set<string>();
  private totalDocs = 0;
  version = "topic-nb-v1";
  createdAt = new Date().toISOString();

  train(examples: TrainingLabel[]): void {
    for (const ex of examples) {
      const tokens = tokenize(ex.text);
      if (tokens.length === 0) continue;
      const c = ex.topicId;
      this.classes.add(c);
      this.classDocCount[c] = (this.classDocCount[c] ?? 0) + 1;
      this.classTokenTotal[c] = this.classTokenTotal[c] ?? 0;
      this.classTokenFreq[c] = this.classTokenFreq[c] ?? {};
      for (const tok of tokens) {
        this.vocab.add(tok);
        this.classTokenFreq[c][tok] = (this.classTokenFreq[c][tok] ?? 0) + 1;
        this.classTokenTotal[c] += 1;
      }
      this.totalDocs += 1;
    }
  }

  /**
   * Predict the most likely topic. `allowedClasses` restricts scoring to a
   * subject's subtopics. Confidence is the softmax weight of the winning class.
   */
  predict(text: string, allowedClasses?: string[]): { topicId: string | null; confidence: number } {
    const candidates = (allowedClasses && allowedClasses.length ? allowedClasses : [...this.classes]).filter((c) => this.classes.has(c));
    if (candidates.length === 0) return { topicId: null, confidence: 0 };
    const tokens = tokenize(text);
    if (tokens.length === 0) return { topicId: null, confidence: 0 };
    const V = this.vocab.size || 1;

    const logScores = candidates.map((c) => {
      const prior = Math.log((this.classDocCount[c] ?? 1) / this.totalDocs);
      const total = this.classTokenTotal[c] ?? 0;
      const freq = this.classTokenFreq[c] ?? {};
      let ll = 0;
      for (const tok of tokens) {
        // Laplace-smoothed multinomial likelihood.
        ll += Math.log(((freq[tok] ?? 0) + 1) / (total + V));
      }
      return { c, score: prior + ll };
    });

    // Softmax over candidate scores for a calibrated confidence.
    const max = Math.max(...logScores.map((s) => s.score));
    const exps = logScores.map((s) => ({ c: s.c, e: Math.exp(s.score - max) }));
    const sum = exps.reduce((a, b) => a + b.e, 0) || 1;
    const best = exps.reduce((a, b) => (b.e > a.e ? b : a));
    return { topicId: best.c, confidence: Math.round((best.e / sum) * 100) / 100 };
  }

  toJSON(): SerializedModel {
    return {
      version: this.version,
      createdAt: this.createdAt,
      classes: [...this.classes],
      classDocCount: this.classDocCount,
      classTokenTotal: this.classTokenTotal,
      classTokenFreq: this.classTokenFreq,
      vocabSize: this.vocab.size,
      totalDocs: this.totalDocs,
    };
  }

  static fromJSON(m: SerializedModel): TopicClassifierModel {
    const model = new TopicClassifierModel();
    model.version = m.version;
    model.createdAt = m.createdAt;
    model.classes = new Set(m.classes);
    model.classDocCount = m.classDocCount;
    model.classTokenTotal = m.classTokenTotal;
    model.classTokenFreq = m.classTokenFreq;
    model.totalDocs = m.totalDocs;
    // Rebuild vocab from the per-class frequencies.
    const vocab = new Set<string>();
    for (const freqs of Object.values(m.classTokenFreq)) for (const tok of Object.keys(freqs)) vocab.add(tok);
    model.vocab = vocab;
    return model;
  }
}
