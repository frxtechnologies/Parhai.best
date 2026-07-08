import { rateLimit, ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";
import type { Request } from "express";

/**
 * Rate limiting for Parhai's own API endpoints.
 *
 * NOTE ON SERVERLESS: the default store is in-memory, so on Netlify each
 * function instance keeps its own counters and they reset on cold start. This
 * still meaningfully throttles bursty abuse from a single client, but it is not
 * a strict global limit. If we later need hard, cluster-wide quotas (e.g. for
 * paid AI usage caps) we should back these limiters with a shared store such as
 * Redis or a Supabase table via a custom `store`.
 */

// Some hosting proxies send an empty/unknown IP; fall back to a stable bucket so
// those requests are still counted together rather than bypassing the limiter.
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? "unknown");
}

/** Broad limiter applied to every /api request, keyed by client IP. */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

/**
 * Stricter limiter for the expensive AI assistant endpoint. Mounted AFTER
 * `requireUser`, so an authenticated user id is available and each account gets
 * its own quota regardless of IP; unauthenticated/edge cases fall back to IP.
 */
export const aiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator(req, res) {
    const userId = (res.locals as { user?: { id?: string } }).user?.id;
    return userId ? `user:${userId}` : ipKey(req);
  },
  message: {
    error: "You are sending AI requests too quickly. Please wait a moment before asking again.",
  },
});

/**
 * Limiter for upload/ingestion endpoints, which are heavier (PDF parsing,
 * embedding generation). Keyed by user id when available.
 */
export const uploadLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator(req, res) {
    const userId = (res.locals as { user?: { id?: string } }).user?.id;
    return userId ? `user:${userId}` : ipKey(req);
  },
  message: { error: "Too many uploads in a short period. Please wait before uploading again." },
});
