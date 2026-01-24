import { createLogger } from '../utils/logger.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';

const logger = createLogger('TransactionCache');

interface CacheEntry {
  transactions: FireflyTransaction[];
  timestamp: number;
}

// Cache keyed by: sessionId -> dateRangeKey -> transactions
const cache = new Map<string, Map<string, CacheEntry>>();

// Cache TTL: 10 minutes
const CACHE_TTL = 10 * 60 * 1000;

// Track sessions with cache entries (for cleanup integration)
// Imported dynamically in setCachedTransactions to avoid circular dependency
let trackSessionFn: ((sessionId: string) => void) | null = null;

/**
 * Set the function to track sessions (called by sessionStore on init)
 */
export function setSessionTracker(fn: (sessionId: string) => void): void {
  trackSessionFn = fn;
}

/**
 * Generate a cache key from date range parameters
 */
export function getCacheKey(startDate?: string, endDate?: string, extra?: string): string {
  return `${startDate || ''}-${endDate || ''}-${extra || ''}`;
}

/**
 * Get cached transactions for a session and date range
 */
export function getCachedTransactions(
  sessionId: string,
  cacheKey: string
): FireflyTransaction[] | null {
  const sessionCache = cache.get(sessionId);
  if (!sessionCache) return null;

  const entry = sessionCache.get(cacheKey);
  if (!entry) return null;

  // Check if cache is expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    logger.debug(`Cache expired for ${cacheKey}`);
    sessionCache.delete(cacheKey);
    return null;
  }

  logger.debug(`Cache hit for ${cacheKey} (${entry.transactions.length} items)`);
  return entry.transactions;
}

/**
 * Cache transactions for a session and date range
 */
export function setCachedTransactions(
  sessionId: string,
  cacheKey: string,
  transactions: FireflyTransaction[]
): void {
  let sessionCache = cache.get(sessionId);
  if (!sessionCache) {
    sessionCache = new Map();
    cache.set(sessionId, sessionCache);
    // Track this session for cleanup
    if (trackSessionFn) {
      trackSessionFn(sessionId);
    }
  }

  sessionCache.set(cacheKey, {
    transactions,
    timestamp: Date.now(),
  });
  logger.debug(`Cache set for ${cacheKey} (${transactions.length} items)`);
}

/**
 * Clear cache for a session
 */
export function clearSessionCache(sessionId: string): void {
  logger.debug(`Clearing cache for session ${sessionId}`);
  cache.delete(sessionId);
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  logger.debug('Clearing all caches');
  cache.clear();
}
