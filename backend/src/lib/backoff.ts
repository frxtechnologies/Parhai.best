/**
 * Retry a rate-limited async operation with exponential backoff + jitter.
 * Used by the batch scripts so they survive free-tier provider limits and run to
 * completion (they're idempotent, so a run can also just be resumed). Only retries
 * transient rate-limit / availability errors; other errors propagate immediately.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; maxMs?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 5;
  const baseMs = opts.baseMs ?? 5000;
  const maxMs = opts.maxMs ?? 90_000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /rate limit|temporarily unavailable|quota|resource exhausted|\b429\b|\b503\b/i.test(message);
      if (!transient || attempt === retries) throw error;
      const delay = Math.min(baseMs * 2 ** attempt, maxMs) + Math.floor(Math.random() * 1000);
      console.log(`[backoff] ${opts.label ?? "operation"} rate-limited — waiting ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/** Small fixed pause between calls to stay under requests-per-minute ceilings. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
