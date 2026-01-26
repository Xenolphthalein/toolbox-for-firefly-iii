import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import { config, isAuthRequired } from '../config/index.js';
import { shouldUseSecureCookies } from './security.js';
import { createLogger } from '../utils/logger.js';
import type { AuthUser } from '../../shared/types/auth.js';

const logger = createLogger('AuthMiddleware');

// Create production-ready memory store (auto-prunes expired sessions)
const MemoryStore = createMemoryStore(session);

// Extend Express Request with session data
declare module 'express-session' {
  interface SessionData {
    user?: AuthUser;
    /** OIDC state parameter for CSRF protection */
    oauthState?: string;
    /** OIDC code verifier for PKCE */
    codeVerifier?: string;
  }
}

/**
 * Create session middleware with proper configuration.
 * In production, AUTH_SESSION_SECRET must be explicitly set.
 * Cookie secure flag is set based on APP_URL scheme (https = secure).
 *
 * Uses memorystore instead of the default MemoryStore to:
 * - Automatically prune expired sessions (prevents memory leaks)
 * - Avoid the "MemoryStore is not designed for production" warning
 */
export function createSessionMiddleware() {
  const secret = config.auth.sessionSecret;

  if (!secret) {
    if (config.nodeEnv === 'production') {
      throw new Error(
        'AUTH_SESSION_SECRET is required in production mode. ' +
          'Set a strong, random secret (e.g., 32+ characters) in your environment variables.'
      );
    }
    // This should not happen as config generates a random secret in dev,
    // but guard against misconfiguration
    throw new Error('Session secret is not configured.');
  }

  // Determine if secure cookies should be used based on environment and APP_URL
  const useSecureCookies = shouldUseSecureCookies();

  // Session expiry in milliseconds (24 hours)
  const sessionMaxAge = 24 * 60 * 60 * 1000;

  return session({
    secret,
    name: 'firefly_toolbox_session',
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: sessionMaxAge, // Prune expired sessions every 24 hours
    }),
    cookie: {
      secure: useSecureCookies,
      httpOnly: true,
      maxAge: sessionMaxAge,
      sameSite: 'lax', // Lax mode to allow OAuth redirect flows
    },
  });
}

/**
 * Middleware to require authentication on protected routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth check if auth is not required
  if (!isAuthRequired()) {
    return next();
  }

  // Check if user is authenticated via session
  if (req.session?.user) {
    return next();
  }

  logger.warn(`Authentication required for ${req.method} ${req.path}`);

  // Not authenticated - return 401
  res.status(401).json({
    success: false,
    error: 'Authentication required',
  });
}

/**
 * Get the current authenticated user from the session
 */
export function getCurrentUser(req: Request): AuthUser | null {
  return req.session?.user ?? null;
}

/**
 * Set the authenticated user in the session
 */
export function setAuthenticatedUser(req: Request, user: AuthUser): void {
  req.session.user = user;
}

/**
 * Clear the authenticated user from the session
 */
export function clearAuthenticatedUser(req: Request, callback?: (err?: Error) => void): void {
  req.session.destroy((err) => {
    if (callback) callback(err || undefined);
  });
}

/**
 * Get a stable session identifier for per-user state (caches, extenders, etc.)
 * Uses the Express session ID which is server-managed and cryptographically secure.
 * This replaces the client-controlled x-session-id header for security.
 */
export function getSessionId(req: Request): string {
  // Express session is initialized by createSessionMiddleware before routes
  // req.session.id is always available after session middleware runs
  return req.session.id;
}
