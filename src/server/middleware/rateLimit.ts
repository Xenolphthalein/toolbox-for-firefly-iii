import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RateLimit');

/**
 * In-memory rate limiting store.
 * For a small self-hosted app (1-5 users), in-memory storage is appropriate.
 * State is lost on restart, which is acceptable for this use case.
 */
interface RateLimitEntry {
  /** Number of requests in current window */
  count: number;
  /** Window start timestamp */
  windowStart: number;
  /** Consecutive failures (for login backoff) */
  failures?: number;
  /** Blocked until timestamp (for progressive backoff) */
  blockedUntil?: number;
}

// Global store for rate limit data, keyed by "limiterKey:clientKey"
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries that are outside their window and not blocked
    const isExpired = now - entry.windowStart > 60 * 60 * 1000; // 1 hour max
    const isUnblocked = !entry.blockedUntil || entry.blockedUntil < now;
    if (isExpired && isUnblocked) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Options for rate limiting middleware
 */
export interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Custom key generator (defaults to IP-based) */
  keyGenerator?: (req: Request) => string;
  /** Custom message for rate limit responses */
  message?: string;
  /** Whether to skip rate limiting for successful requests (useful for login) */
  skipSuccessfulRequests?: boolean;
  /** Enable progressive backoff on failures */
  progressiveBackoff?: boolean;
  /** Base backoff time in ms (doubles with each failure) */
  backoffBaseMs?: number;
  /** Maximum backoff time in ms */
  backoffMaxMs?: number;
}

/**
 * Default key generator using client IP address.
 * Works with trust proxy setting for reverse proxy scenarios.
 */
function defaultKeyGenerator(req: Request): string {
  // req.ip respects trust proxy setting
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Create a rate limiting middleware.
 *
 * @param limiterKey Unique identifier for this rate limiter (e.g., 'auth', 'import')
 * @param options Rate limit configuration
 */
export function rateLimit(limiterKey: string, options: RateLimitOptions): RequestHandler {
  const {
    maxRequests,
    windowMs,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    progressiveBackoff = false,
    backoffBaseMs = 1000,
    backoffMaxMs = 60000,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = keyGenerator(req);
    const storeKey = `${limiterKey}:${clientKey}`;
    const now = Date.now();

    let entry = rateLimitStore.get(storeKey);

    // Check if client is in backoff period
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      logger.warn(
        `Rate limit backoff active for ${clientKey} on ${limiterKey}, retry after ${retryAfter}s`
      );
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: message,
        retryAfter,
      });
      return;
    }

    // Initialize or reset window if expired
    if (!entry || now - entry.windowStart > windowMs) {
      entry = {
        count: 0,
        windowStart: now,
        failures: entry?.failures || 0, // Preserve failure count across windows
      };
    }

    // Check rate limit
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      logger.warn(`Rate limit exceeded for ${clientKey} on ${limiterKey}`);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: message,
        retryAfter,
      });
      return;
    }

    // Increment count immediately (before response)
    entry.count++;
    rateLimitStore.set(storeKey, entry);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + windowMs) / 1000)));

    // If we need to track success/failure for skipSuccessfulRequests or progressiveBackoff
    if (skipSuccessfulRequests || progressiveBackoff) {
      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json to detect success/failure
      res.json = function (body: unknown): Response {
        const isSuccess =
          res.statusCode >= 200 &&
          res.statusCode < 300 &&
          (typeof body === 'object' && body !== null && 'success' in body
            ? (body as { success: boolean }).success
            : true);

        const currentEntry = rateLimitStore.get(storeKey);
        if (currentEntry) {
          if (isSuccess) {
            // On success: decrement count if skipSuccessfulRequests, reset failures
            if (skipSuccessfulRequests) {
              currentEntry.count = Math.max(0, currentEntry.count - 1);
            }
            currentEntry.failures = 0;
            currentEntry.blockedUntil = undefined;
          } else if (progressiveBackoff && (res.statusCode === 401 || res.statusCode === 403)) {
            // On auth failure: increment failures and apply backoff
            currentEntry.failures = (currentEntry.failures || 0) + 1;
            // Exponential backoff: base * 2^(failures-1), capped at max
            const backoffTime = Math.min(
              backoffBaseMs * Math.pow(2, currentEntry.failures - 1),
              backoffMaxMs
            );
            currentEntry.blockedUntil = now + backoffTime;
            logger.warn(
              `Auth failure #${currentEntry.failures} for ${clientKey}, backoff ${backoffTime}ms`
            );
          }
          rateLimitStore.set(storeKey, currentEntry);
        }

        return originalJson(body);
      };
    }

    next();
  };
}

/**
 * Pre-configured rate limiter for authentication endpoints.
 * Stricter limits with progressive backoff on failures.
 */
export const authRateLimit = rateLimit('auth', {
  maxRequests: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true, // Don't count successful logins against limit
  progressiveBackoff: true,
  backoffBaseMs: 1000, // 1s, 2s, 4s, 8s, 16s, 32s, 60s...
  backoffMaxMs: 60000, // Max 1 minute backoff
});

/**
 * Pre-configured rate limiter for bulk/destructive operations.
 * Moderate limits to prevent accidental mass operations.
 */
export const bulkOperationRateLimit = rateLimit('bulk', {
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many bulk operations, please slow down',
});

/**
 * Pre-configured rate limiter for import operations.
 * Lower limits for expensive operations.
 */
export const importRateLimit = rateLimit('import', {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many import requests, please wait before importing more',
});

/**
 * Reset rate limit for a specific client (useful after successful password reset, etc.)
 */
export function resetRateLimit(limiterKey: string, clientKey: string): void {
  const storeKey = `${limiterKey}:${clientKey}`;
  rateLimitStore.delete(storeKey);
}

/**
 * Get current rate limit status for a client (for debugging/monitoring)
 */
export function getRateLimitStatus(
  limiterKey: string,
  clientKey: string
): RateLimitEntry | undefined {
  const storeKey = `${limiterKey}:${clientKey}`;
  return rateLimitStore.get(storeKey);
}
