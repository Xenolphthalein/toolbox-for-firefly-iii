/**
 * Session Store Manager
 *
 * Manages lifecycle and eviction of in-memory session-scoped data:
 * - Amazon order extenders
 * - PayPal extenders
 * - FinTS clients
 * - Transaction caches
 *
 * Features:
 * - TTL-based expiration (configurable, default 15 minutes)
 * - Automatic cleanup on interval
 * - Cleanup on logout
 * - Memory usage bounded by max entries per store
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('SessionStore');

/** Default inactivity TTL: 15 minutes */
const DEFAULT_TTL_MS = 15 * 60 * 1000;

/** Cleanup interval: run every 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum entries per store type (safety limit) */
const MAX_ENTRIES_PER_STORE = 100;

interface StoreEntry<T> {
  value: T;
  lastAccessed: number;
  /** Optional cleanup callback when entry is evicted */
  cleanup?: () => void | Promise<void>;
}

interface StoreConfig {
  /** Time-to-live in milliseconds (default: 15 minutes) */
  ttlMs?: number;
  /** Cleanup callback for evicted entries */
  onEvict?: (sessionId: string, value: unknown) => void | Promise<void>;
}

/**
 * Generic session-scoped store with TTL and eviction
 */
class SessionStore<T> {
  private name: string;
  private store: Map<string, StoreEntry<T>> = new Map();
  private ttlMs: number;
  private onEvict?: (sessionId: string, value: T) => void | Promise<void>;

  constructor(name: string, config: StoreConfig = {}) {
    this.name = name;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.onEvict = config.onEvict as typeof this.onEvict;
  }

  /**
   * Get an entry, updating its last accessed time
   */
  get(sessionId: string): T | undefined {
    const entry = this.store.get(sessionId);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    return undefined;
  }

  /**
   * Check if an entry exists
   */
  has(sessionId: string): boolean {
    return this.store.has(sessionId);
  }

  /**
   * Set an entry with optional cleanup callback
   */
  set(sessionId: string, value: T, cleanup?: () => void | Promise<void>): void {
    // Enforce max entries limit
    if (this.store.size >= MAX_ENTRIES_PER_STORE && !this.store.has(sessionId)) {
      logger.warn(`${this.name}: Max entries (${MAX_ENTRIES_PER_STORE}) reached, evicting oldest`);
      this.evictOldest();
    }

    this.store.set(sessionId, {
      value,
      lastAccessed: Date.now(),
      cleanup,
    });
  }

  /**
   * Delete an entry, running its cleanup callback
   */
  async delete(sessionId: string): Promise<boolean> {
    const entry = this.store.get(sessionId);
    if (entry) {
      this.store.delete(sessionId);
      try {
        if (entry.cleanup) {
          await entry.cleanup();
        }
        if (this.onEvict) {
          await this.onEvict(sessionId, entry.value);
        }
      } catch (error) {
        logger.warn(`${this.name}: Cleanup error for session ${sessionId}:`, error);
      }
      return true;
    }
    return false;
  }

  /**
   * Evict expired entries based on TTL
   */
  async evictExpired(): Promise<number> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, entry] of this.store.entries()) {
      if (now - entry.lastAccessed > this.ttlMs) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.delete(sessionId);
    }

    if (expiredSessions.length > 0) {
      logger.debug(`${this.name}: Evicted ${expiredSessions.length} expired entries`);
    }

    return expiredSessions.length;
  }

  /**
   * Evict the oldest entry (used when max entries reached)
   */
  private async evictOldest(): Promise<void> {
    let oldestSession: string | null = null;
    let oldestTime = Infinity;

    for (const [sessionId, entry] of this.store.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestSession = sessionId;
      }
    }

    if (oldestSession) {
      await this.delete(oldestSession);
    }
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    const sessions = Array.from(this.store.keys());
    for (const sessionId of sessions) {
      await this.delete(sessionId);
    }
  }

  /**
   * Get current store size
   */
  get size(): number {
    return this.store.size;
  }
}

// ============================================
// Global Session Stores
// ============================================

/** Amazon order extenders - imported dynamically to avoid circular deps */
let amazonExtenders: SessionStore<unknown> | null = null;

/** PayPal extenders */
let paypalExtenders: SessionStore<unknown> | null = null;

/** FinTS clients */
let fintsClients: SessionStore<unknown> | null = null;

/** FinTS dialog states */
let fintsDialogStates: SessionStore<unknown> | null = null;

/** Transaction caches (already has TTL, but we track for session cleanup) */
const transactionCacheSessions: Set<string> = new Set();

// Cleanup interval handle
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Get or create the Amazon extenders store
 */
export function getAmazonExtenderStore<T>(): SessionStore<T> {
  if (!amazonExtenders) {
    amazonExtenders = new SessionStore<unknown>('AmazonExtenders');
  }
  return amazonExtenders as SessionStore<T>;
}

/**
 * Get or create the PayPal extenders store
 */
export function getPayPalExtenderStore<T>(): SessionStore<T> {
  if (!paypalExtenders) {
    paypalExtenders = new SessionStore<unknown>('PayPalExtenders');
  }
  return paypalExtenders as SessionStore<T>;
}

/**
 * Get or create the FinTS clients store
 */
export function getFinTSClientStore<T>(): SessionStore<T> {
  if (!fintsClients) {
    fintsClients = new SessionStore<unknown>('FinTSClients');
  }
  return fintsClients as SessionStore<T>;
}

/**
 * Get or create the FinTS dialog states store
 */
export function getFinTSDialogStateStore<T>(): SessionStore<T> {
  if (!fintsDialogStates) {
    fintsDialogStates = new SessionStore<unknown>('FinTSDialogStates');
  }
  return fintsDialogStates as SessionStore<T>;
}

/**
 * Track a session for transaction cache cleanup
 */
export function trackTransactionCacheSession(sessionId: string): void {
  transactionCacheSessions.add(sessionId);
}

/**
 * Clear all session data for a given session ID (e.g., on logout)
 */
export async function clearSessionData(sessionId: string): Promise<void> {
  logger.debug(`Clearing all data for session ${sessionId}`);

  const promises: Promise<boolean>[] = [];

  if (amazonExtenders?.has(sessionId)) {
    promises.push(amazonExtenders.delete(sessionId));
  }

  if (paypalExtenders?.has(sessionId)) {
    promises.push(paypalExtenders.delete(sessionId));
  }

  if (fintsClients?.has(sessionId)) {
    promises.push(fintsClients.delete(sessionId));
  }

  if (fintsDialogStates?.has(sessionId)) {
    promises.push(fintsDialogStates.delete(sessionId));
  }

  await Promise.all(promises);

  // Clear transaction cache for this session
  if (transactionCacheSessions.has(sessionId)) {
    // Import dynamically to avoid circular dependency
    const { clearSessionCache } = await import('./transactionCache.js');
    clearSessionCache(sessionId);
    transactionCacheSessions.delete(sessionId);
  }

  logger.info(`Session data cleared for ${sessionId}`);
}

/**
 * Run cleanup on all stores (evict expired entries)
 */
async function runCleanup(): Promise<void> {
  let totalEvicted = 0;

  if (amazonExtenders) {
    totalEvicted += await amazonExtenders.evictExpired();
  }

  if (paypalExtenders) {
    totalEvicted += await paypalExtenders.evictExpired();
  }

  if (fintsClients) {
    totalEvicted += await fintsClients.evictExpired();
  }

  if (fintsDialogStates) {
    totalEvicted += await fintsDialogStates.evictExpired();
  }

  // Clean up expired transaction cache sessions
  // (transactionCache.ts has its own TTL, we just track session IDs)
  // Note: The transaction cache already cleans up expired entries on access

  if (totalEvicted > 0) {
    logger.info(`Cleanup complete: evicted ${totalEvicted} expired entries`);
  }
}

/**
 * Start the periodic cleanup interval
 */
export function startCleanupInterval(): void {
  if (cleanupIntervalId) {
    return; // Already running
  }

  // Initialize the transaction cache session tracker
  import('./transactionCache.js').then(({ setSessionTracker }) => {
    setSessionTracker(trackTransactionCacheSession);
  });

  cleanupIntervalId = setInterval(() => {
    runCleanup().catch((error) => {
      logger.error('Cleanup interval error:', error);
    });
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent Node from exiting
  cleanupIntervalId.unref();

  logger.info(`Session store cleanup interval started (every ${CLEANUP_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop the periodic cleanup interval
 */
export function stopCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info('Session store cleanup interval stopped');
  }
}

/**
 * Get store statistics for monitoring
 */
export function getStoreStats(): Record<string, number> {
  return {
    amazonExtenders: amazonExtenders?.size ?? 0,
    paypalExtenders: paypalExtenders?.size ?? 0,
    fintsClients: fintsClients?.size ?? 0,
    fintsDialogStates: fintsDialogStates?.size ?? 0,
    transactionCacheSessions: transactionCacheSessions.size,
  };
}
